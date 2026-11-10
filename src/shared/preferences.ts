import type { SkinEffect } from '../core/effects.js'
import type { parseSkinTokens } from '../core/tokens.js'

export const qualityLevels = ['low', 'balanced', 'high', 'auto'] as const
export type QualityChoice = (typeof qualityLevels)[number]
export type Quality = Exclude<QualityChoice, 'auto'>

export const editableColors = ['canvas', 'surface', 'accent'] as const
export const editableEffects = ['glass.liquid', 'ambient.aurora', 'light.flow', 'particles.dust',
  'interaction.ripple', 'particles.starfield', 'glass.holographic', 'glass.refraction'] as const
export type EditableEffect = (typeof editableEffects)[number]
export interface EffectPreference { enabled?: boolean; strength?: number }

export interface SkinPreferences {
  quality?: QualityChoice
  colors?: Partial<Record<(typeof editableColors)[number], string>>
  effects?: Partial<Record<EditableEffect, EffectPreference>>
}

export function preferencesFor(values: Readonly<Record<string, SkinPreferences>> | undefined, id: string) {
  return values && Object.hasOwn(values, id) ? values[id] : undefined
}

export function samePreferences(a?: SkinPreferences | null, b?: SkinPreferences | null) {
  return a?.quality === b?.quality
    && editableColors.every(key => a?.colors?.[key] === b?.colors?.[key])
    && editableEffects.every(key => a?.effects?.[key]?.enabled === b?.effects?.[key]?.enabled
      && a?.effects?.[key]?.strength === b?.effects?.[key]?.strength)
}

export function effectStrength(effect: SkinEffect): number | undefined {
  switch (effect.id) {
    case 'glass.liquid': return effect.params.blur / 24
    case 'ambient.aurora':
    case 'light.flow':
    case 'glass.holographic': return effect.params.intensity
    case 'particles.dust': return effect.params.density
    case 'particles.starfield': return effect.params.brightness
    case 'interaction.ripple': return (effect.params.maxRadius - 80) / 140
    case 'glass.refraction': return effect.params.distortion
  }
}

function overrideEffect(effect: SkinEffect, overrides: SkinPreferences['effects']): SkinEffect {
  const value = overrides?.[effect.id]
  if (effect.id === 'glass.refraction') {
    return { ...effect, enabled: value?.enabled === true,
      params: { ...effect.params, distortion: value?.strength ?? effect.params.distortion } }
  }
  if (!value) return effect
  const next = { ...effect, enabled: value.enabled ?? effect.enabled }
  const strength = value.strength
  if (strength === undefined) return next
  switch (next.id) {
    case 'glass.liquid': return { ...next, params: { ...next.params, blur: strength * 24 } }
    case 'ambient.aurora': return { ...next, params: { ...next.params, intensity: strength } }
    case 'light.flow': return { ...next, params: { ...next.params, intensity: strength } }
    case 'particles.dust': return { ...next, params: { ...next.params, density: strength } }
    case 'interaction.ripple': return { ...next, params: { ...next.params, maxRadius: 80 + strength * 140 } }
    case 'particles.starfield': return { ...next, params: { ...next.params, brightness: strength } }
    case 'glass.holographic': return { ...next, params: { ...next.params, intensity: strength } }
  }
}

export function applyPreferences<T extends { tokens: ReturnType<typeof parseSkinTokens>; effects: SkinEffect[] }>(
  data: T, preferences: SkinPreferences | undefined,
): T {
  if (!preferences && !data.effects.some(effect => effect.id === 'glass.refraction' && effect.enabled)) return data
  return {
    ...data,
    tokens: { ...data.tokens, colors: { ...data.tokens.colors, ...preferences?.colors } },
    effects: data.effects.map(effect => overrideEffect(effect, preferences?.effects)),
  }
}
