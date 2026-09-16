import { useEffect } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { SUN } from '../config/gameConfig.js'
import { SKY_HORIZON } from './Sky.jsx'

/**
 * Image-based lighting (IBL), generated at runtime.
 *
 * The same sky gradient as the visible dome (plus a strong HDR sun and the
 * red-earth bounce below the horizon) is rendered once into a PMREM
 * environment map and assigned to `scene.environment`. Every PBR material in
 * the scene then picks up:
 *
 *  - soft ambient light from the sky (no flat grey bounce);
 *  - real reflections - car paint, glass belt, ocean-adjacent metal;
 *  - a warm warm-grey ground bounce off the laterite.
 *
 * Cost: one-time ~ms of PMREM filtering at 256 px, then zero per frame.
 */

const ENV_VERTEX = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const ENV_FRAGMENT = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  varying vec3 vDirection;

  void main() {
    vec3 dir = normalize(vDirection);
    vec3 sunDir = normalize(uSunDirection);

    float t = pow(clamp(dir.y, 0.0, 1.0), 0.5);
    vec3 color = mix(uHorizon, uZenith, t);

    // HDR sun: values above 1.0 survive the PMREM HalfFloat capture, so the
    // environment map has a real bright source for specular reflections.
    float sunDot = max(dot(dir, sunDir), 0.0);
    color += uSunColor * (pow(sunDot, 400.0) * 60.0 + pow(sunDot, 32.0) * 0.8);

    // Warm laterite bounce below the horizon.
    color = mix(color, uGround, smoothstep(0.0, -0.2, dir.y));

    gl_FragColor = vec4(color, 1.0);
  }
`

function buildEnvironmentScene() {
  const scene = new THREE.Scene()
  const material = new THREE.ShaderMaterial({
    vertexShader: ENV_VERTEX,
    fragmentShader: ENV_FRAGMENT,
    side: THREE.BackSide,
    uniforms: {
      uZenith: { value: new THREE.Color('#2f74cf') },
      uHorizon: { value: new THREE.Color(SKY_HORIZON) },
      uGround: { value: new THREE.Color('#5e402a') },
      uSunDirection: { value: new THREE.Vector3(...SUN.direction).normalize() },
      // Scaled up for HDR capture (the visible sky stays in LDR range).
      uSunColor: { value: new THREE.Color('#fff3d6').multiplyScalar(1.6) },
    },
  })
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), material)
  scene.add(sphere)
  return { scene, disposables: [material, sphere.geometry] }
}

export function IBL({ intensity = 0.5 }) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const { scene: envScene, disposables } = buildEnvironmentScene()
    const target = pmrem.fromScene(envScene, 0.04)

    scene.environment = target.texture
    scene.environmentIntensity = intensity

    return () => {
      scene.environment = null
      target.dispose()
      pmrem.dispose()
      disposables.forEach((resource) => resource.dispose())
    }
  }, [gl, scene, intensity])

  return null
}
