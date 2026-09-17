import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { PALETTE, WORLD } from '../config/gameConfig.js'
import { SKY_HORIZON } from './Sky.jsx'

/**
 * Ocean surface.
 *
 * A single large plane with a hand-written shader, in the "cheap real water"
 * recipe:
 *  - three travelling sine swells plus a fine ripple normal perturbation;
 *  - a fresnel-weighted reflection of the procedural sky gradient (sampled in
 *    the reflected direction, no cube map needed) with the sun added in;
 *  - a tight specular sparkle on top of a wider sun glint;
 *  - crest foam and a distance haze that matches the sky (seamless horizon).
 */

const VERTEX = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vWave;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    float x = world.x;
    float z = world.z;

    float wave =
      sin(x * 0.06 + uTime * 0.9) * 0.22 +
      sin(z * 0.043 - uTime * 0.7) * 0.26 +
      sin((x + z) * 0.021 + uTime * 0.45) * 0.30;

    world.y += wave;

    float dx = 0.06 * cos(x * 0.06 + uTime * 0.9) * 0.22 +
               0.021 * cos((x + z) * 0.021 + uTime * 0.45) * 0.30;
    float dz = 0.043 * cos(z * 0.043 - uTime * 0.7) * 0.26 +
               0.021 * cos((x + z) * 0.021 + uTime * 0.45) * 0.30;

    vNormal = normalize(vec3(-dx, 1.0, -dz));
    vWave = wave;
    vWorldPos = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const FRAGMENT = /* glsl */ `
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uSunColor;
  uniform vec3 uSunDirection;
  uniform vec3 uHazeColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uTime;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vWave;

  void main() {
    vec3 normal = normalize(vNormal);

    // Fine ripple detail on top of the analytic swell normal.
    float rippleA = cos(vWorldPos.x * 2.1 + uTime * 1.6) - cos(vWorldPos.z * 1.7 - uTime * 1.2);
    float rippleB = cos(vWorldPos.z * 2.4 + uTime * 1.5) - cos(vWorldPos.x * 1.9 - uTime * 1.8);
    normal = normalize(normal + vec3(rippleA, 0.0, rippleB) * 0.016);

    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    vec3 sunDir = normalize(uSunDirection);

    // Fresnel (Schlick, base reflectance ~0.02 like real sea water).
    float fresnel = 0.02 + 0.98 * pow(1.0 - clamp(dot(normal, viewDir), 0.0, 1.0), 3.0);

    // Water body colour: turquoise shallows blended toward deep blue.
    vec3 color = mix(uDeep, uShallow, clamp(fresnel * 1.5 + 0.16, 0.0, 1.0));

    // Sky reflection sampled in the reflected view direction - cheap, but it is
    // what makes the surface read as water instead of glass.
    vec3 reflDir = reflect(-viewDir, normal);
    float reflHeight = clamp(reflDir.y, 0.0, 1.0);
    vec3 skyRefl = mix(uHorizon, uZenith, pow(reflHeight, 0.55));
    skyRefl += uSunColor * pow(max(dot(reflDir, sunDir), 0.0), 180.0) * 1.4;
    color = mix(color, skyRefl, clamp(fresnel * 1.25, 0.0, 1.0));

    // Sun glint: wide lobe for the path, tight lobe for the sparkle.
    vec3 halfVec = normalize(sunDir + viewDir);
    float spec = max(dot(normal, halfVec), 0.0);
    color += uSunColor * (pow(spec, 240.0) * 1.1 + pow(spec, 900.0) * 3.0);

    // Crest foam.
    float foam = smoothstep(0.46, 0.78, vWave + sin(vWorldPos.x * 0.35 + uTime * 0.8) * 0.05);
    color = mix(color, vec3(0.93, 0.97, 0.98), foam * 0.25);

    float distanceToCamera = length(cameraPosition - vWorldPos);
    float haze = smoothstep(uFogNear, uFogFar * 1.5, distanceToCamera);
    color = mix(color, uHazeColor, haze);

    gl_FragColor = vec4(color, mix(0.74, 0.96, clamp(haze + 0.25, 0.0, 1.0)));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function Ocean({ sunDirection = [0.55, 0.62, 0.36] }) {
  const materialRef = useRef(null)
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color('#4bb6bb') },
      uDeep: { value: new THREE.Color(PALETTE.waterDeep) },
      uZenith: { value: new THREE.Color('#3f86d8') },
      uHorizon: { value: new THREE.Color(SKY_HORIZON) },
      uSunColor: { value: new THREE.Color('#fff2d4') },
      uSunDirection: { value: new THREE.Vector3(...sunDirection).normalize() },
      uHazeColor: { value: new THREE.Color(SKY_HORIZON) },
      uFogNear: { value: WORLD.fogNear * 1.5 },
      uFogFar: { value: WORLD.fogFar },
    }),
    // `sunDirection` is static config: this memo effectively builds once.
    [sunDirection],
  )

  useFrame((_, delta) => {
    uniforms.uTime.value += Math.min(delta, 0.05)
  })

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, WORLD.seaLevel, 0]}
      frustumCulled={false}
      name="ocean"
      renderOrder={1}
    >
      <planeGeometry args={[WORLD.size * 5, WORLD.size * 5, 96, 96]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={VERTEX}
        fragmentShader={FRAGMENT}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}
