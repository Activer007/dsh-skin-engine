import type { SkinEffect } from '../../core/effects.js'
import type { SceneSpec } from '../../core/scene.js'
import type { EffectMode } from '../effects/p0.js'

export type ScenePreset = keyof SceneSpec['presets']

export function effectiveScenePreset(preset: ScenePreset, mode: EffectMode, reducedMotion: boolean): ScenePreset {
  if (reducedMotion || mode === 'static' || mode === 'off') return 'static'
  return mode === 'economy' && preset === 'dynamic' ? 'light' : preset
}

export function sceneEffects(effects: readonly SkinEffect[], presets: SceneSpec['presets'], preset: ScenePreset) {
  const ids = new Set<string>(presets[preset])
  return effects.filter(effect => effect.enabled && ids.has(effect.id))
}
