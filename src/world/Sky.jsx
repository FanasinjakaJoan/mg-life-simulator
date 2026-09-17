import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Billboard } from '@react-three/drei'
import { SUN, WORLD } from '../config/gameConfig.js'

/**
 * Tropical sky: a gradient dome with a sun disc, plus procedural clouds.
 *
 * Written as a shader instead of a texture so the project ships with zero
 * external assets, and so the horizon colour can be reused as the scene's fog
 * colour (which keeps the ocean/terrain fade seamless).
 */

const DOME_VERTEX = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const DOME_FRAGMENT = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  uniform float uTime;
  varying vec3 vDirection;

  void main() {
    vec3 dir = normalize(vDirection);

    // Sky gradient: strongest change right above the horizon.
    float height = clamp(dir.y, -1.0, 1.0);
    float t = pow(clamp(height, 0.0, 1.0), 0.42);
    vec3 color = mix(uHorizon, uZenith, t);
    // Below the horizon fades into the ocean haze.
    color = mix(color, uGround, smoothstep(0.0, -0.09, height));

    // Sun disc + wide glow + a warm Rayleigh-style tint near the sun.
    vec3 sunDir = normalize(uSunDirection);
    float sunDot = max(dot(dir, sunDir), 0.0);
    float disc = smoothstep(0.9986, 0.9995, sunDot);
    float glow = pow(sunDot, 220.0) * 0.55 + pow(sunDot, 12.0) * 0.16;
    color += uSunColor * (disc * 1.2 + glow);
    color = mix(color, uSunColor * 0.4 + color * 0.6, pow(sunDot, 4.0) * 0.35);

    // Tropical haze band hugging the horizon (moist Indian Ocean air).
    float hazeBand = exp(-abs(height) * 14.0) * 0.10;
    color = mix(color, vec3(0.96, 0.98, 1.0), hazeBand);

    // Very light banding of high cirrus so the sky is not perfectly flat.
    float cirrus = sin(dir.x * 22.0 + uTime * 0.015) * sin(dir.z * 27.0 - uTime * 0.01);
    color += vec3(0.02) * smoothstep(0.25, 0.75, cirrus) * smoothstep(0.05, 0.6, height);

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export const SKY_HORIZON = '#bfe0f2'

export function SkyDome({ sunDirection = SUN.direction }) {
  const uniforms = useMemo(
    () => ({
      uZenith: { value: new THREE.Color('#3f86d8') },
      uHorizon: { value: new THREE.Color(SKY_HORIZON) },
      uGround: { value: new THREE.Color('#9dc4dc') },
      uSunColor: { value: new THREE.Color('#fff2d4') },
      uSunDirection: { value: new THREE.Vector3(...sunDirection).normalize() },
      uTime: { value: 0 },
    }),
    // `sunDirection` is static config: this memo effectively builds once.
    [sunDirection],
  )

  useFrame((_, delta) => {
    uniforms.uTime.value += Math.min(delta, 0.05)
  })

  return (
    <mesh scale={[1, 1, 1]} frustumCulled={false} renderOrder={-10} name="sky">
      <sphereGeometry args={[WORLD.fogFar * 2.4, 32, 20]} />
      {/* toneMapped stays true on purpose: the shader's tonemapping include
          applies the renderer's ACES when the scene renders straight to
          screen (low preset) and stays inert inside the post composer's
          render target (where the ToneMapping effect does it) - so every
          quality tier grades the sky identically, and the horizon seam
          against the fogged terrain stays seamless. */}
      <shaderMaterial
        vertexShader={DOME_VERTEX}
        fragmentShader={DOME_FRAGMENT}
        uniforms={uniforms}
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  )
}

/**
 * Soft cloud sprite drawn once into a canvas - no image files needed.
 */
function createCloudTexture() {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')

  // A handful of blurred blobs reads convincingly as a cumulus puff.
  const blobs = [
    { x: 0.5, y: 0.58, r: 0.34, a: 0.95 },
    { x: 0.34, y: 0.62, r: 0.26, a: 0.9 },
    { x: 0.66, y: 0.62, r: 0.24, a: 0.9 },
    { x: 0.44, y: 0.45, r: 0.22, a: 0.8 },
    { x: 0.6, y: 0.47, r: 0.18, a: 0.75 },
    { x: 0.5, y: 0.68, r: 0.3, a: 0.85 },
  ]

  ctx.clearRect(0, 0, size, size)
  for (const blob of blobs) {
    const gradient = ctx.createRadialGradient(
      blob.x * size,
      blob.y * size,
      0,
      blob.x * size,
      blob.y * size,
      blob.r * size,
    )
    gradient.addColorStop(0, `rgba(255,255,255,${blob.a})`)
    gradient.addColorStop(0.55, `rgba(255,255,255,${blob.a * 0.55})`)
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(blob.x * size, blob.y * size, blob.r * size, 0, Math.PI * 2)
    ctx.fill()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** Drifting cumulus layer - billboards so they always read as volume. */
export function Clouds({ count = 16 }) {
  const texture = useMemo(() => createCloudTexture(), [])
  const groupRef = useRef(null)

  const puffs = useMemo(() => {
    const list = []
    let seed = 1337
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296
      return seed / 4294967296
    }
    for (let i = 0; i < count; i += 1) {
      const puffsInCluster = 2 + Math.floor(random() * 3)
      const cluster = []
      const baseX = (random() - 0.5) * WORLD.size * 2.4
      const baseZ = (random() - 0.5) * WORLD.size * 2.4
      const baseY = 150 + random() * 120
      const scale = 60 + random() * 90
      for (let p = 0; p < puffsInCluster; p += 1) {
        cluster.push({
          x: baseX + (random() - 0.5) * scale * 1.1,
          y: baseY + (random() - 0.5) * scale * 0.16,
          z: baseZ + (random() - 0.5) * scale * 0.5,
          scale: scale * (0.5 + random() * 0.6),
          opacity: 0.5 + random() * 0.35,
          drift: 0.8 + random() * 1.6,
        })
      }
      list.push(cluster)
    }
    return list
  }, [count])

  useFrame((_, delta) => {
    const group = groupRef.current
    if (!group) return
    const step = Math.min(delta, 0.05)
    for (const cluster of group.children) {
      for (const puff of cluster.children) {
        puff.position.x += (puff.userData.drift ?? 1) * step * 2.2
        if (puff.position.x > WORLD.size * 1.4) puff.position.x = -WORLD.size * 1.4
      }
    }
  })

  return (
    <group ref={groupRef} name="clouds">
      {puffs.map((cluster, clusterIndex) => (
        <group key={`cloud-${clusterIndex}`}>
          {cluster.map((puff, puffIndex) => (
            <CloudPuff key={`puff-${clusterIndex}-${puffIndex}`} texture={texture} {...puff} />
          ))}
        </group>
      ))}
    </group>
  )
}

function CloudPuff({ texture, x, y, z, scale, opacity, drift }) {
  return (
    <Billboard position={[x, y, z]} userData={{ drift }}>
      <mesh scale={[scale, scale * 0.62, 1]} renderOrder={-5} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={texture} transparent opacity={opacity} depthWrite={false} />
      </mesh>
    </Billboard>
  )
}
