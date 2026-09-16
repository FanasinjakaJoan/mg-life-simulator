import { useEffect, useMemo } from 'react'
import { Instance, Instances } from '@react-three/drei'
import { BallCollider, CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import { getWorldLayout } from './layout.js'
import { PROP_MATERIAL, PROP_MATERIAL_ROUGH } from './geometryUtils.js'
import {
  buildHouseGeometry,
  buildPropGeometries,
  buildStallGeometry,
} from './propGeometry.js'

/**
 * Every static object on the island.
 *
 * Props come from the deterministic `layout.js`; each one becomes a single
 * merged vertex-coloured mesh (one draw call) plus a matching fixed collider, so
 * the player and the taxi-bés can bump into real geometry.
 */
export function Props() {
  const layout = useMemo(() => getWorldLayout(), [])
  const geometries = useMemo(() => buildPropGeometries(layout.zebus[0]), [layout.zebus])

  useEffect(
    () => () => Object.values(geometries).forEach((geometry) => geometry.dispose()),
    [geometries],
  )

  return (
    <group name="props">
      <Houses houses={layout.houses} />
      <Gargotes stalls={layout.stalls} />
      <StreetFurniture lamps={layout.lamps} signs={layout.signs} geometries={geometries} />
      <Vegetation layout={layout} geometries={geometries} />
      <SceneryColliders layout={layout} />
      <Zebus zebus={layout.zebus} geometry={geometries.zebu} />
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Houses                                                              */
/* ------------------------------------------------------------------ */

function Houses({ houses }) {
  const built = useMemo(
    () => houses.map((house) => ({ house, geometry: buildHouseGeometry(house) })),
    [houses],
  )

  useEffect(() => () => built.forEach(({ geometry }) => geometry.dispose()), [built])

  return (
    <group name="houses">
      {built.map(({ house, geometry }) => (
        <RigidBody
          key={house.id}
          type="fixed"
          colliders={false}
          position={[house.x, house.y, house.z]}
          rotation={[0, house.yaw, 0]}
          name={house.id}
        >
          <CuboidCollider
            args={[house.width / 2, house.wallHeight / 2, house.depth / 2]}
            position={[0, house.wallHeight / 2, 0]}
            friction={0.8}
          />
          <CuboidCollider
            args={[house.width / 2 + 0.4, 0.75, house.depth / 2 + 0.4]}
            position={[0, -0.65, 0]}
            friction={0.9}
          />
          <mesh geometry={geometry} material={PROP_MATERIAL} castShadow receiveShadow />
        </RigidBody>
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Gargotes (street food stalls)                                       */
/* ------------------------------------------------------------------ */

function Gargotes({ stalls }) {
  const built = useMemo(
    () => stalls.map((stall) => ({ stall, geometry: buildStallGeometry(stall) })),
    [stalls],
  )

  useEffect(() => () => built.forEach(({ geometry }) => geometry.dispose()), [built])

  return (
    <group name="gargotes">
      {built.map(({ stall, geometry }) => (
        <RigidBody
          key={stall.id}
          type="fixed"
          colliders={false}
          position={[stall.x, stall.y, stall.z]}
          rotation={[0, stall.yaw, 0]}
          name={stall.id}
        >
          <CuboidCollider
            args={[stall.width / 2, stall.height / 2, stall.depth / 2]}
            position={[0, stall.height / 2, 0]}
            friction={0.7}
          />
          <mesh geometry={geometry} material={PROP_MATERIAL} castShadow receiveShadow />
        </RigidBody>
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Lamps + road signs                                                  */
/* ------------------------------------------------------------------ */

function StreetFurniture({ lamps, signs, geometries }) {
  return (
    <>
      <group name="lamps">
        {lamps.map((lamp) => (
          <group key={lamp.id} position={[lamp.x, lamp.y, lamp.z]} rotation={[0, lamp.yaw, 0]}>
            <mesh geometry={geometries.lamp} material={PROP_MATERIAL} castShadow />
          </group>
        ))}
      </group>
      <group name="signs">
        {signs.map((sign) => (
          <RigidBody
            key={sign.id}
            type="fixed"
            colliders={false}
            position={[sign.x, sign.y, sign.z]}
            rotation={[0, sign.yaw, 0]}
            name={sign.id}
          >
            <CuboidCollider args={[0.2, 1.05, 0.2]} position={[0, 1.05, 0]} friction={0.6} />
            <mesh geometry={geometries.sign} material={PROP_MATERIAL} castShadow />
          </RigidBody>
        ))}
      </group>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Vegetation (instanced: one draw call per plant part)                */
/* ------------------------------------------------------------------ */

function Vegetation({ layout, geometries }) {
  const trees = layout.trees.filter((tree) => tree.kind === 'tree')
  const ravenalas = layout.trees.filter((tree) => tree.kind !== 'tree')

  return (
    <group name="vegetation">
      <Instances
        geometry={geometries.palmTrunk}
        material={PROP_MATERIAL_ROUGH}
        limit={Math.max(layout.palms.length, 1)}
        castShadow
        receiveShadow
      >
        {layout.palms.map((palm) => (
          <Instance
            key={`palm-trunk-${palm.id}`}
            position={[palm.x, palm.y - 0.2, palm.z]}
            rotation={[palm.lean, palm.yaw, palm.lean * 0.6]}
            scale={[palm.scale, palm.height, palm.scale]}
          />
        ))}
      </Instances>
      <Instances
        geometry={geometries.palmHead}
        material={PROP_MATERIAL_ROUGH}
        limit={Math.max(layout.palms.length, 1)}
        castShadow
      >
        {layout.palms.map((palm) => (
          <Instance
            key={`palm-head-${palm.id}`}
            position={[palm.x, palm.y - 0.2 + palm.height * 0.98, palm.z]}
            rotation={[palm.lean, palm.yaw, palm.lean * 0.6]}
            scale={[palm.scale * 1.05, palm.scale * 1.05, palm.scale * 1.05]}
          />
        ))}
      </Instances>

      <Instances
        geometry={geometries.treeTrunk}
        material={PROP_MATERIAL_ROUGH}
        limit={Math.max(trees.length, 1)}
        castShadow
      >
        {trees.map((tree) => (
          <Instance
            key={`tree-trunk-${tree.id}`}
            position={[tree.x, tree.y - 0.2, tree.z]}
            rotation={[0, tree.yaw, 0]}
            scale={[tree.scale, tree.height * 0.62, tree.scale]}
          />
        ))}
      </Instances>
      <Instances
        geometry={geometries.treeCanopy}
        material={PROP_MATERIAL_ROUGH}
        limit={Math.max(trees.length, 1)}
        castShadow
      >
        {trees.map((tree) => (
          <Instance
            key={`tree-canopy-${tree.id}`}
            position={[tree.x, tree.y - 0.2 + tree.height * 0.66, tree.z]}
            rotation={[0, tree.yaw, 0]}
            scale={[
              tree.radius * 0.5 * tree.scale,
              tree.radius * 0.42 * tree.scale,
              tree.radius * 0.5 * tree.scale,
            ]}
          />
        ))}
      </Instances>

      <Instances
        geometry={geometries.ravenala}
        material={PROP_MATERIAL_ROUGH}
        limit={Math.max(ravenalas.length, 1)}
        castShadow
      >
        {ravenalas.map((tree) => (
          <Instance
            key={`ravenala-${tree.id}`}
            position={[tree.x, tree.y - 0.2 + tree.height * 0.45, tree.z]}
            rotation={[0, tree.yaw, 0]}
            scale={[tree.scale, tree.height * 0.34, tree.scale]}
          />
        ))}
      </Instances>

      <Instances
        geometry={geometries.rock}
        material={PROP_MATERIAL}
        limit={Math.max(layout.rocks.length, 1)}
        castShadow
        receiveShadow
      >
        {layout.rocks.map((rock) => (
          <Instance
            key={rock.id}
            position={[rock.x, rock.y, rock.z]}
            rotation={[0, rock.yaw, 0]}
            scale={[rock.scale, rock.scale * rock.squash, rock.scale * 0.9]}
          />
        ))}
      </Instances>

      <Instances
        geometry={geometries.bush}
        material={PROP_MATERIAL_ROUGH}
        limit={Math.max(layout.bushes.length, 1)}
        receiveShadow
      >
        {layout.bushes.map((bush) => (
          <Instance
            key={bush.id}
            position={[bush.x, bush.y + bush.scale * 0.12, bush.z]}
            rotation={[0, bush.yaw, 0]}
            scale={[bush.scale, bush.scale * 0.7, bush.scale]}
          />
        ))}
      </Instances>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Collision for the scattered scenery                                 */
/* ------------------------------------------------------------------ */

/**
 * Trunks, lamp posts and boulders you must not be able to drive through.
 *
 * Everything hangs off a *single* fixed body: one rigid body holding a few
 * hundred child colliders is far cheaper (and far fewer React nodes) than a
 * rigid body per tree. Bushes and ravenala fans stay pass-through - walking
 * through a shrub is expected, driving through a palm trunk is not.
 */
function SceneryColliders({ layout }) {
  return (
    <RigidBody type="fixed" colliders={false} name="scenery">
      {layout.palms.map((palm) => (
        <CylinderCollider
          key={`palm-collider-${palm.id}`}
          args={[palm.height * 0.5, Math.max(palm.scale * 0.16, 0.12)]}
          position={[palm.x, palm.y - 0.2 + palm.height * 0.5, palm.z]}
          friction={0.8}
        />
      ))}
      {layout.trees
        .filter((tree) => tree.kind === 'tree')
        .map((tree) => (
          <CylinderCollider
            key={`tree-collider-${tree.id}`}
            args={[tree.height * 0.31, Math.max(tree.scale * 0.18, 0.14)]}
            position={[tree.x, tree.y - 0.2 + tree.height * 0.31, tree.z]}
            friction={0.8}
          />
        ))}
      {layout.rocks.map((rock) => (
        <BallCollider
          key={`rock-collider-${rock.id}`}
          args={[Math.max(rock.scale * 0.45, 0.2)]}
          position={[rock.x, rock.y + rock.scale * 0.2, rock.z]}
          friction={0.9}
        />
      ))}
      {layout.lamps.map((lamp) => (
        <CylinderCollider
          key={`lamp-collider-${lamp.id}`}
          args={[1.6, 0.14]}
          position={[lamp.x, lamp.y + 1.6, lamp.z]}
          friction={0.6}
        />
      ))}
    </RigidBody>
  )
}

/* ------------------------------------------------------------------ */
/* Zebu                                                                */
/* ------------------------------------------------------------------ */

function Zebus({ zebus, geometry }) {
  if (!zebus.length) return null

  return (
    <group name="zebus">
      {zebus.map((zebu) => (
        <RigidBody
          key={zebu.id}
          type="fixed"
          colliders={false}
          position={[zebu.x, zebu.y, zebu.z]}
          rotation={[0, zebu.yaw, 0]}
          name={zebu.id}
        >
          <CuboidCollider args={[1.1, 0.7, 0.45]} position={[0, 0.8, 0]} friction={0.6} />
          <mesh
            geometry={geometry}
            material={PROP_MATERIAL_ROUGH}
            scale={[zebu.scale, zebu.scale, zebu.scale]}
            castShadow
          />
        </RigidBody>
      ))}
    </group>
  )
}
