/**
 * Player registry.
 *
 * The interaction system and the camera need the player's rigid body without
 * being its React parent. Same pattern as the vehicle registry: systems talk to
 * a tiny control surface instead of prop-drilling refs.
 */
export const playerRegistry = {
  /** @type {import('@dimforge/rapier3d-compat').RigidBody | null} */
  body: null,
  /** Visual root, animated by the controller (never re-rendered). */
  model: null,
  /** Set while the player is riding: used to hide the avatar. */
  hidden: false,
}

export function setPlayerBody(body) {
  playerRegistry.body = body
}

export function setPlayerHidden(hidden) {
  playerRegistry.hidden = hidden
}

/** Current player position, or null when the player does not exist yet. */
export function getPlayerPosition(target = { x: 0, y: 0, z: 0 }) {
  const body = playerRegistry.body
  if (!body) return null
  const translation = body.translation()
  target.x = translation.x
  target.y = translation.y
  target.z = translation.z
  return target
}

/** Teleport the player (used when getting in/out of a vehicle). */
export function placePlayer(x, y, z) {
  const body = playerRegistry.body
  if (!body) return
  body.setTranslation({ x, y, z }, true)
  body.setLinvel({ x: 0, y: 0, z: 0 }, true)
}
