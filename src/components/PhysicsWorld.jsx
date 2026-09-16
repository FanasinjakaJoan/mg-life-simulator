import { Physics } from '@react-three/rapier'

/**
 * The single Rapier simulation.
 *
 * Everything physical (terrain, buildings, the player, the taxi-bés, props)
 * lives inside this component. Keeping it isolated means the sim can be paused
 * (menu / tab hidden) without touching the rest of the scene graph.
 */
export function PhysicsWorld({ children, paused = false, debug = false }) {
  return (
    <Physics
      gravity={[0, -9.81, 0]}
      timeStep={1 / 60}
      interpolate
      paused={paused}
      debug={debug}
      colliders="cuboid"
      numSolverIterations={6}
      // Contact events are opt-in per collider; global filtering stays default.
      updatePriority={-1}
    >
      {children}
    </Physics>
  )
}
