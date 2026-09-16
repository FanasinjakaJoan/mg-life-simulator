/**
 * Shared camera orientation state.
 *
 * Lives outside React because both the camera rig (writer) and the player /
 * vehicle controllers (readers, for camera-relative movement) need it every
 * frame without causing re-renders.
 */
export const cameraState = {
  yaw: Math.PI,
  pitch: 0.28,
  distance: 6.2,
  /** Orbit pivot, kept in sync by the camera rig for debugging / effects. */
  target: { x: 0, y: 0, z: 0 },
  /** Set by whichever controller currently owns the camera. */
  mode: 'onFoot',
}

/** Horizontal basis vectors derived from the current yaw (reused, no alloc). */
export function cameraBasis(yaw = cameraState.yaw) {
  const sin = Math.sin(yaw)
  const cos = Math.cos(yaw)
  // "forward" = direction the camera looks at, projected on the ground plane.
  return {
    forwardX: -sin,
    forwardZ: -cos,
    rightX: cos,
    rightZ: -sin,
  }
}
