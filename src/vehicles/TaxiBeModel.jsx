import { useMemo } from 'react'
import { PALETTE, VEHICLE } from '../config/gameConfig.js'
import {
  VEHICLE_MATERIAL,
  VEHICLE_MATERIAL_MATTE,
  WHEEL_POSITIONS,
  buildTaxiBodyGeometry,
  buildWheelGeometry,
} from './vehicleGeometry.js'

export { WHEEL_POSITIONS }

/**
 * Malagasy taxi-brousse.
 *
 * Boxy white minibus with a blue stripe, a loaded roof rack (sacks, crates and
 * a chicken cage - the definitive taxi-bé silhouette) and a tricolour stripe.
 * The body is one merged vertex-coloured geometry; the four wheels are separate
 * so they can spin and steer.
 */

const { halfWidth, halfLength, halfHeight } = VEHICLE.chassis

export function TaxiBeModel({
  bodyColor = PALETTE.taxiBeWhite,
  accentColor = PALETTE.taxiBeBlue,
  wheelRef,
}) {
  const geometry = useMemo(
    () => buildTaxiBodyGeometry(bodyColor, accentColor),
    [bodyColor, accentColor],
  )
  const wheels = useMemo(() => buildWheelGeometry(), [])

  return (
    <group name="taxi-be-model">
      <mesh geometry={geometry} material={VEHICLE_MATERIAL} castShadow receiveShadow />
      {WHEEL_POSITIONS.map((wheel, index) => (
        <group
          key={`wheel-${index}`}
          position={[wheel.x, -halfHeight + 0.42, wheel.z]}
          ref={(node) => {
            if (wheelRef) wheelRef.current[index] = node
          }}
        >
          <mesh geometry={wheels} material={VEHICLE_MATERIAL_MATTE} castShadow />
        </group>
      ))}
      {/* Under-body shadow catcher so the vehicle reads as grounded. */}
      <mesh position={[0, -halfHeight + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[halfWidth * 1.9, halfLength * 1.9]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.16} depthWrite={false} />
      </mesh>
    </group>
  )
}
