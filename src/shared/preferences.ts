import { sameArtwork, type ArtworkPreference } from './user-artwork.js'
import { AMBIENT_LIGHT_MAX_INTENSITY, type SkinEffect } from '../core/effects.js'
import type { ColorScheme, parseSkinTokens } from '../core/tokens.js'

export const qualityLevels = ['low', 'balanced', 'high', 'auto'] as const
export type QualityChoice = (typeof qualityLevels)[number]
export type Quality = Exclude<QualityChoice, 'auto'>

export const editableColors = ['canvas', 'surface', 'accent'] as const
export const editableEffects = ['glass.liquid', 'ambient.aurora', 'light.flow', 'particles.dust', 'particles.bubbles',
  'interaction.ripple', 'particles.starfield', 'glass.holographic', 'glass.refraction', 'ambient.light', 'scene.brightness'] as const
export type EditableEffect = (typeof editableEffects)[number]
export interface EffectPreference { enabled?: boolean; strength?: number; speed?: number; movement?: number }

export interface SkinPreferences {
  artwork?: ArtworkPreference
  quality?: QualityChoice
  colors?: Partial<Record<(typeof editableColors)[number], string>>
  effects?: Partial<Record<EditableEffect, EffectPreference>>
}

export function preferencesFor(values: Readonly<Record<string, SkinPreferences>> | undefined, id: string) {
  return values && Object.hasOwn(values, id) ? values[id] : undefined
}

export function samePreferences(a?: SkinPreferences | null, b?: SkinPreferences | null) {
  return sameArtwork(a?.artwork, b?.artwork) && a?.quality === b?.quality
    && editableColors.every(key => a?.colors?.[key] === b?.colors?.[key])
    && editableEffects.every(key => sameEffectPreference(a?.effects?.[key], b?.effects?.[key]))
}

export function sameEffectPreference(a?: EffectPreference, b?: EffectPreference) {
  return a?.enabled === b?.enabled && a?.strength === b?.strength && a?.speed === b?.speed && a?.movement === b?.movement
}

export function effectStrength(effect: SkinEffect): number | undefined {
  switch (effect.id) {
    case 'glass.liquid': return effect.params.blur / 24
    case 'ambient.aurora':
    case 'light.flow':
    case 'glass.holographic': return effect.params.intensity
    case 'ambient.light': return effect.params.intensity / AMBIENT_LIGHT_MAX_INTENSITY
    case 'scene.brightness': return effect.params.level - 0.5
    case 'particles.dust':
    case 'particles.bubbles': return effect.params.density
    case 'particles.starfield': return effect.params.brightness
    case 'interaction.ripple': return (effect.params.maxRadius - 80) / 140
    case 'glass.refraction': return effect.params.distortion
  }
}

function overrideEffect(effect: SkinEffect, overrides: SkinPreferences['effects']): SkinEffect {
  if (!hasEditableEffect(effect)) return effect
  const value = overrides?.[effect.id]
  if (effect.id === 'glass.refraction') {
    return { ...effect, enabled: value?.enabled === true,
      params: { ...effect.params, distortion: value?.strength ?? effect.params.distortion } }
  }
  if (!value) return effect
  const next = { ...effect, enabled: value.enabled ?? effect.enabled }
  const strength = value.strength
  if (next.id === 'ambient.aurora') {
    const params = { ...next.params, intensity: strength ?? next.params.intensity }
    if (params.movement !== undefined) {
      params.movement = value.movement ?? params.movement
      params.speed = value.speed ?? params.speed
    }
    return { ...next, params }
  }
  if (strength === undefined) return next
  switch (next.id) {
    case 'glass.liquid': return { ...next, params: { ...next.params, blur: strength * 24 } }
    case 'light.flow': return { ...next, params: { ...next.params, intensity: strength } }
    case 'particles.dust': return { ...next, params: { ...next.params, density: strength } }
    case 'particles.bubbles': return { ...next, params: { ...next.params, density: strength } }
    case 'interaction.ripple': return { ...next, params: { ...next.params, maxRadius: 80 + strength * 140 } }
    case 'particles.starfield': return { ...next, params: { ...next.params, brightness: strength } }
    case 'glass.holographic': return { ...next, params: { ...next.params, intensity: strength } }
    case 'ambient.light': return { ...next, params: { ...next.params, intensity: strength * AMBIENT_LIGHT_MAX_INTENSITY } }
    case 'scene.brightness': return { ...next, params: { ...next.params, level: 0.5 + strength } }
  }
}

function hasEditableEffect(effect: SkinEffect): effect is Extract<SkinEffect, { id: EditableEffect }> {
  return (editableEffects as readonly string[]).includes(effect.id)
}

export function resolveSkinColors(tokens: ReturnType<typeof parseSkinTokens>, scheme?: ColorScheme) {
  const overrides = scheme && tokens.variants?.[scheme]
  return overrides ? { ...tokens.colors, ...overrides } : tokens.colors
}

export function applyPreferences<T extends { tokens: ReturnType<typeof parseSkinTokens>; effects: SkinEffect[] }>(
  data: T, preferences: SkinPreferences | undefined, scheme?: ColorScheme,
): T {
  const colors = resolveSkinColors(data.tokens, scheme)
  if (colors === data.tokens.colors && !preferences && !data.effects.some(effect => effect.id === 'glass.refraction' && effect.enabled)) return data
  return {
    ...data,
    tokens: { ...data.tokens, colors: { ...colors, ...preferences?.colors } },
    effects: data.effects.map(effect => overrideEffect(effect, preferences?.effects)),
  }
}
