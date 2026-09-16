/**
 * Centralised input layer.
 *
 * Kept outside of React so the render loop can read raw state every frame
 * without triggering re-renders. Uses `event.code` (physical key position) so
 * both QWERTY (WASD) and AZERTY (ZQSD) keyboards work unchanged, plus arrow keys.
 */

const down = new Set()
const pressed = new Set() // edge-triggered, cleared at the end of each frame

/** Mouse deltas + wheel are accumulated between frames. */
export const mouse = {
  dx: 0,
  dy: 0,
  wheel: 0,
  dragging: false,
  lastMoveAt: 0,
  lastButtonAt: 0,
}

export const KEY = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space'],
  interact: ['KeyF'],
  handbrake: ['Space'],
  help: ['KeyH', 'Slash'],
  reset: ['KeyR'],
}

let attached = false

function onKeyDown(event) {
  // Let the browser keep reload/devtools shortcuts, but stop page scrolling.
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
    event.preventDefault()
  }
  if (!down.has(event.code)) pressed.add(event.code)
  down.add(event.code)
}

function onKeyUp(event) {
  down.delete(event.code)
}

function onMouseMove(event) {
  const movementX = event.movementX ?? 0
  const movementY = event.movementY ?? 0
  mouse.dx += movementX
  mouse.dy += movementY
  if (movementX || movementY) mouse.lastMoveAt = performance.now()
}

function onWheel(event) {
  mouse.wheel += event.deltaY
}

function onPointerDown(event) {
  if (event.button === 0) {
    mouse.dragging = true
    mouse.lastButtonAt = performance.now()
  }
}

function onPointerUp(event) {
  if (event.button === 0) mouse.dragging = false
}

function onBlur() {
  down.clear()
  pressed.clear()
  mouse.dragging = false
}

/** Attach global listeners once (called from App). */
export function attachInput() {
  if (attached) return () => {}
  attached = true
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('mousemove', onMouseMove, { passive: true })
  window.addEventListener('wheel', onWheel, { passive: true })
  window.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('blur', onBlur)
  return () => {
    attached = false
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('wheel', onWheel)
    window.removeEventListener('pointerdown', onPointerDown)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('blur', onBlur)
  }
}

/** True while any of the given physical keys is held. */
export function isDown(codes) {
  if (typeof codes === 'string') return down.has(codes)
  for (const code of codes) if (down.has(code)) return true
  return false
}

/** True only on the frame the key was first pressed. */
export function wasPressed(codes) {
  if (typeof codes === 'string') return pressed.has(codes)
  for (const code of codes) if (pressed.has(code)) return true
  return false
}

/** Consume everything accumulated for this frame (call at the end of the loop). */
export function endFrame() {
  pressed.clear()
  mouse.dx = 0
  mouse.dy = 0
  mouse.wheel = 0
}

/** Snapshot of the movement axis derived from the keyboard. */
export function readMoveAxis() {
  let x = 0
  let z = 0
  if (isDown(KEY.forward)) z += 1
  if (isDown(KEY.back)) z -= 1
  if (isDown(KEY.left)) x -= 1
  if (isDown(KEY.right)) x += 1
  return { x, z }
}
