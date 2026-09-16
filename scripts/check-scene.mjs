#!/usr/bin/env node
/**
 * Scene structure check (node scripts/check-scene.mjs).
 *
 * Every component that talks to Rapier has to be *rendered inside* the physics
 * world: hooks such as `useRapier` / `useBeforePhysicsStep` read a React context
 * that `<Physics>` provides and throw `react-three-rapier: useRapier must be
 * used within <Physics />!` otherwise. That failure is invisible in a headless
 * test - it only shows up as a blank canvas - so the layout of `Scene.jsx` is
 * verified here statically.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const SRC = join(ROOT, 'src')

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

const files = walk(SRC).filter((path) => /\.jsx?$/.test(path))
const scene = readFileSync(join(SRC, 'game/Scene.jsx'), 'utf8')

// The JSX subtree between <PhysicsWorld> and its closing tag.
const open = scene.indexOf('<PhysicsWorld')
const close = scene.indexOf('</PhysicsWorld>')
if (open === -1 || close === -1) {
  console.error('\u2717 Scene.jsx no longer contains a <PhysicsWorld> block')
  process.exit(1)
}
const physicsSubtree = scene.slice(open, close)

let failures = 0

// Any component whose source uses Rapier hooks must appear inside that subtree.
const RAPIER_HOOK = /use(Rapier|BeforePhysicsStep|AfterPhysicsStep)\s*\(/
const REQUIRES_PHYSICS = new Map()

for (const path of files) {
  const source = readFileSync(path, 'utf8')
  if (!source.includes("@react-three/rapier")) continue
  if (!RAPIER_HOOK.test(source)) continue
  for (const match of source.matchAll(/export function ([A-Z]\w*)/g)) {
    REQUIRES_PHYSICS.set(match[1], path.replace(`${ROOT}/`, ''))
  }
}

for (const [component, path] of REQUIRES_PHYSICS) {
  if (component === 'PhysicsWorld') continue
  const rendered = physicsSubtree.includes(`<${component} `) || physicsSubtree.includes(`<${component} /`)
  if (!rendered) {
    console.error(
      `\u2717 ${component} (${path}) uses Rapier hooks but is not rendered inside <PhysicsWorld>`,
    )
    failures += 1
  }
}

// Overlays live in the DOM, outside the <Canvas>: they must never reach for a
// three.js / Rapier hook, which would throw.
const DOM_OVERLAYS = ['src/ui/Hud.jsx', 'src/ui/StartOverlay.jsx', 'src/ui/ErrorOverlay.jsx']
for (const relative of DOM_OVERLAYS) {
  const source = readFileSync(join(ROOT, relative), 'utf8')
  if (source.includes('@react-three/fiber') || source.includes('@react-three/rapier')) {
    console.error(`\u2717 ${relative} is a DOM overlay but imports three.js / Rapier`)
    failures += 1
  }
}

// drei's <Instance> only works inside <Instances>: a silent no-op otherwise.
for (const path of files) {
  const source = readFileSync(path, 'utf8')
  if (!source.includes('<Instance ')) continue
  const blocks = source.match(/<Instances[\s\S]*?<\/Instances>/g) ?? []
  const insideBlocks = blocks.join('\n')
  const total = (source.match(/<Instance /g) ?? []).length
  const wrapped = (insideBlocks.match(/<Instance /g) ?? []).length
  if (total !== wrapped) {
    console.error(
      `\u2717 ${path.replace(`${ROOT}/`, '')} renders ${total - wrapped} <Instance> outside <Instances>`,
    )
    failures += 1
  }
}

// Sanity: the scene should still contain the pieces the game is built from.
for (const expected of [
  '<Terrain',
  '<Props',
  '<Player',
  '<TaxiBe',
  '<InteractionSystem',
  '<ThirdPersonCamera',
  '<SkyDome',
  '<Ocean',
]) {
  if (!scene.includes(expected)) {
    console.error(`\u2717 Scene.jsx no longer renders ${expected}`)
    failures += 1
  }
}

if (failures > 0) {
  console.error(`\u2717 scene structure check failed (${failures} problem(s))`)
  process.exit(1)
}

console.log(
  `\u2713 scene structure ok - ${REQUIRES_PHYSICS.size} physics-aware component(s) rendered inside <PhysicsWorld>`,
)
