/**
 * Vehicle registry.
 *
 * Vehicles register a tiny control surface (not the whole React tree) so that
 * the player controller, the camera rig and the HUD can talk to them without
 * prop drilling or extra renders. Supports any number of vehicles; the closest
 * one to the player wins the interaction prompt.
 */

/** @type {Map<string, {id:string,name:string,body:any,getWorldPosition:(v:any)=>void,getSpeedKmh:()=>number}>} */
const vehicles = new Map()

/** Scratch vector so the nearest-vehicle search never allocates. */
const TEMP = { x: 0, y: 0, z: 0 }


export function registerVehicle(id, api) {
  vehicles.set(id, api)
  return () => {
    if (vehicles.get(id) === api) vehicles.delete(id)
  }
}

export function getVehicle(id) {
  return id ? vehicles.get(id) ?? null : null
}

export function getVehicles() {
  return vehicles.values()
}

/**
 * Nearest registered vehicle to a world position.
 * @returns {{vehicle:object, distance:number}|null}
 */
export function findNearestVehicle(position, maxDistance = Infinity) {
  let best = null
  let bestDistance = maxDistance
  for (const vehicle of vehicles.values()) {
    const target = vehicle.getWorldPosition(TEMP)
    const distance = Math.hypot(target.x - position.x, target.y - position.y, target.z - position.z)
    if (distance < bestDistance) {
      bestDistance = distance
      best = vehicle
    }
  }
  return best ? { vehicle: best, distance: bestDistance } : null
}

