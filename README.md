# MG Life Simulator — Alpha

> Un jeu vidéo de simulation de vie en monde ouvert inspiré de GTA, se déroulant sur la carte de Madagascar.
>
> A 3D open-world life-sim prototype in the browser: a procedurally generated Malagasy
> island, a red-laterite village with *gargotes*, and a drivable *taxi-brousse*.

Everything in this repository is procedural — **there is not a single binary asset**.
The island, props, character, vehicles, sky, sea and clouds are all generated from code at
load time (geometry, canvas textures, shaders), which keeps the whole game a couple of
hundred kilobytes of source.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server (0.0.0.0:5173) |
| `npm run build` | production build into `dist/` |
| `npm run preview` | serve the production build (4173) |
| `npm run lint` | ESLint — `no-undef` + `react-hooks/rules-of-hooks` |
| `npm test` | terrain + world + physics checks (see *Verification*) |

## Controls

| Key | Action |
| --- | --- |
| `W A S D` / arrows | walk (camera-relative) |
| `Shift` | sprint |
| `Space` | jump — *and* handbrake while driving |
| `F` | enter / exit the nearest taxi-brousse |
| `W` / `S` | accelerate / brake-reverse while driving |
| `A` / `D` | steer while driving |
| `R` | reset the vehicle (right it, unstick it) |
| `H` | show/hide the controls legend |
| `F3` | Rapier collider wireframes |
| Mouse | orbit the camera · wheel zooms · click the world to capture the pointer (`Esc` releases) |

## What is in this MVP

1. **Third-person character** — capsule collider, WASD/arrow walking, Shift sprint,
   Space jump (with coyote time and a jump buffer), animated low-poly mannequin, and a
   smooth orbit camera that follows the mouse and never dips below the terrain.
2. **Madagascar** — a 760 m procedurally generated island (red laterite soil, dry tapia
   grass, highland rainforest), a coastal village of 40 traditional houses, 15 *gargotes*,
   16 street lamps, road signs, palms, trees, ravenala, boulders, bushes and 7 zebu;
   tropical sun, gradient sky with drifting cumulus, and a shader ocean.
3. **Vehicles** — two blocky white-and-blue *taxi-brousse* minibuses parked on the RN7
   roadside, four-wheel steering visuals, arcade physics with gravity, downforce, lateral
   grip and a parking brake; press `F` to get in and out.
4. **HUD** — "MG Life Simulator · Alpha" banner, FPS readout, speedometer with a speed bar
   while driving, an "press F" prompt next to a parkable bus, the key-control legend, and
   transient toasts. French flavour text ("Au volant", "À pied") matches the setting.

## Architecture

```
src/
├─ config/gameConfig.js      every tunable number in one place (world, player, vehicle, camera, sun, palette)
├─ state/                    non-React state shared between systems
│   ├─ input.js              raw key/mouse listeners + edge-triggered `wasPressed`
│   ├─ cameraState.js        the yaw/pitch/distance the camera writes and movement reads
│   ├─ useGameStore.js       zustand store: only what the UI needs to re-render on
│   ├─ playerRegistry.js     the player body, published to the camera + interaction system
│   └─ vehicleRegistry.js    a tiny control surface per vehicle ("find the nearest one")
├─ world/                    procedural generation, framework-free
│   ├─ noise.js, terrainMath.js, terrain.js      island height/colour field + the physics mesh
│   ├─ roadNetwork.js        RN7, the market street, the beach road, the plaza
│   ├─ layout.js             deterministic placement of every prop
│   ├─ propGeometry.js, geometryUtils.js         merged, vertex-coloured prop geometry
│   └─ Terrain/Ocean/Sky/Roads/Props.jsx         the React/three layers on top
├─ player/                   playerController.js (pure maths) + Player.jsx (Rapier body) + PlayerModel.jsx
├─ vehicles/                 vehicleController.js (pure maths) + TaxiBe.jsx + TaxiBeModel.jsx + vehicleGeometry.js
├─ camera/ThirdPersonCamera.jsx
├─ game/                     Scene.jsx (composition) + InteractionSystem.jsx (F, prompt, input edges)
├─ components/PhysicsWorld.jsx
└─ ui/                       Hud.jsx, StartOverlay.jsx, ErrorOverlay.jsx
```

Design rules the code sticks to:

* **Physics maths is pure and React-free** (`playerController.js`, `vehicleController.js`,
  `terrainMath.js`, `propGeometry.js`), so it can be executed and asserted headlessly.
  The components only own bodies, refs and rendering.
* **Per-frame data never enters React.** Positions, speeds and camera state live in module
  singletons; the zustand store only receives values that must re-render (and only when
  they change).
* **One draw call per kind of thing.** Props are merged into single vertex-coloured
  geometries sharing one material; vegetation uses drei `<Instances>`.
* **All static collision is the terrain trimesh plus cheap primitives** (boxes for
  buildings, cylinders for trunks and lamp posts, balls for boulders). Scenery colliders
  hang off a single fixed body.
* **Rounded boxes for the vehicles.** A sharp-cornered box sliding on a triangle mesh
  catches on the internal triangle edges and stops the bus dead; rounding the collider
  corners (Rapier's recommended fix) removes it. See `docs` in `TaxiBe.jsx`.
* Custom shaders (sky, sea) include `<tonemapping_fragment>` and `<colorspace_fragment>`,
  so they match the tone-mapped materials around them.

## Verification

There is no browser in the development sandbox, so the game is verified by executing its
own systems headlessly (`node scripts/...`) — the maths is shared with the components, so
these are real tests of the shipped code, not mocks:

| Script | Covers |
| --- | --- |
| `scripts/check-terrain.mjs` | island/road/village geometry: roads stay dry and below 10°, the plaza is flat, every spawn is on land, the coastline is *inside* the map (so nobody can drive off the world), no degenerate triangles |
| `scripts/smoke-world.mjs` | prop placement: counts, nothing underwater/on a road/floating, spawns clear of scenery, geometry sizes, draw-call budget |
| `scripts/physics-sim.mjs` | a real Rapier world with the real terrain trimesh, stepping the real player and vehicle controllers at 60 Hz: walking, sprinting, jumping, landing, slopes, out-of-world rescue, acceleration (0–50 km/h ≈ 3.7 s, top speed exactly the configured 86 km/h), braking to a stop, reversing, steering authority, banking, the parking brake, drowning in the sea and returning to the road |

`npm run lint` additionally guarantees every identifier is defined (`no-undef` caught a
missing `three` import that would have crashed the canvas) and that hooks follow the rules.

Latest run: **72/72 physics checks**, terrain ✅, world ✅, lint ✅, build ✅.

## Known limits / next steps

* The alpha has no save system, no traffic AI, no NPC interaction and no missions yet.
* Vehicles are arcade-simple: no gearbox, no damage, no fuel, and the sea returns you to
  the road rather than letting you drive underwater.
* Swapping in real art is a one-file change per entity: keep the root transform of
  `PlayerModel.jsx` / `TaxiBeModel.jsx` (feet at `y = 0`, vehicle facing `-Z`) and replace
  the meshes with a `useGLTF` model.
