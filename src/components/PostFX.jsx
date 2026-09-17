import { useMemo } from 'react'
import { EffectComposer, Bloom, Noise, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { QUALITY } from '../config/gameConfig.js'
import { useGameStore } from '../state/useGameStore.js'

/**
 * The realistic-image post pipeline.
 *
 * Ordering matters: bloom runs on the linear HDR buffer first (so only truly
 * bright things - sun, glints, lamps - bleed), then the ACES filmic operator
 * compresses the range, then vignette + grain finish the frame like a
 * photographic plate.
 *
 * While this composer is active @react-three/postprocessing pins the
 * renderer's tone mapping to NoToneMapping itself, which is why the ACES
 * operator lives in the chain (and matches the Canvas' direct ACES path used
 * by the "low" preset, so every tier grades identically).
 *
 * API notes (postprocessing 6.36+):
 *  - effect options moved into constructor option objects, so in R3F they are
 *    passed through the `args` prop: `new Effect(opts)`.
 *  - the composer's render buffers are sized once, at mount, from the
 *    drawing-buffer size and do NOT follow a later pixel-ratio change on
 *    their own, so the composer key includes the live dpr: a DPR step remounts
 *    the composer and rescales the buffers.
 */
export function PostFX() {
  const quality = useGameStore((state) => state.quality)
  const dpr = useGameStore((state) => state.effectiveDpr)
  const preset = QUALITY[quality]

  // Memoized: R3F reconstructs an effect whenever an `args` entry changes
  // reference, so this must stay stable across renders of the same quality.
  const bloomArgs = useMemo(
    () => [
      {
        intensity: preset.bloom,
        luminanceThreshold: 0.82,
        luminanceSmoothing: 0.22,
        mipmapBlur: true,
        radius: 0.75,
      },
    ],
    [preset],
  )

  if (!preset.post) return null

  return (
    <EffectComposer key={`${quality}-${dpr}`} multisampling={4}>
      <Bloom args={bloomArgs} />
      {/* Same ACES operator as the Canvas' direct renderer path (low preset),
          so the tiers grade identically. */}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette eskil={false} offset={0.26} darkness={0.4} />
      <Noise premultiply opacity={0.045} />
    </EffectComposer>
  )
}
