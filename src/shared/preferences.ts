import { sameArtwork, type ArtworkPreference } from './user-artwork.js'
import type { SkinEffect } from '../core/effects.js'
import type { ColorScheme, parseSkinTokens } from '../core/tokens.js'
import { describeEffect, editableEffects, expandEffectValue, normalizeEffectValue, type EditableEffect,
  type SecondaryEffectControl, type SecondaryEffectPreference } from '../core/effect-descriptors.js'

export { editableEffects, type EditableEffect }

export const qualityLevels = ['low', 'balanced', 'high', 'auto'] as const
export type QualityChoice = (typeof qualityLevels)[number]
export type Quality = Exclude<QualityChoice, 'auto'>

export const editableColors = ['canvas', 'surface', 'accent'] as const
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

function readEffectNumber(effect: SkinEffect, parameter: string, fallback: number) {
  const value = (effect.params as Record<string, unknown>)[parameter]
  return typeof value === 'number' ? value : fallback
}

function secondaryControls(effect: SkinEffect) {
  const secondary = describeEffect(effect.id).secondary
  if (!secondary || (effect.params as Record<string, unknown>)[secondary.whenDefined] === undefined) return []
  return Object.entries(secondary.controls) as [SecondaryEffectPreference, SecondaryEffectControl][]
}

function effectEnabled(effect: SkinEffect, preference?: EffectPreference) {
  return preference?.enabled ?? (!describeEffect(effect.id).optIn && effect.enabled)
}

export function effectControls(effect: SkinEffect, preference?: EffectPreference) {
  const { strength, variant, hint } = describeEffect(effect.id)
  const profile = variant && (effect.params as Record<string, unknown>)[variant.parameter] === variant.equals ? variant : undefined
  const minimum = strength.percentMinimum ?? 0
  const multiplier = strength.percentMultiplier ? readEffectNumber(effect, strength.percentMultiplier, 1) : 1
  const span = profile?.percentMaximum ?? 100 * multiplier
  const native = readEffectNumber(effect, strength.parameter, strength.bounds[2])
  return {
    label: profile?.label ?? `effect.${effect.id}` as const,
    measure: profile?.measure ?? strength.measure,
    enabled: effectEnabled(effect, preference),
    minimum, maximum: minimum + span,
    percentage: minimum + Math.round((preference?.strength ?? normalizeEffectValue(native, strength.bounds)) * span),
    hint,
    additional: secondaryControls(effect).map(([key, { parameter, bounds, label }]) => ({
      key,
      label,
      minimum: 100 * bounds[0],
      maximum: 100 * bounds[1],
      percentage: Math.round(100 * (preference?.[key] ?? readEffectNumber(effect, parameter, bounds[2]))),
    })),
  }
}

function overrideEffect<T extends SkinEffect>(effect: T, overrides: SkinPreferences['effects']): T {
  const descriptor = describeEffect(effect.id)
  const preference = overrides?.[effect.id]
  if (!preference && !descriptor.optIn) return effect
  const params: Record<string, number> = {}
  if (preference?.strength !== undefined) {
    const { parameter, bounds } = descriptor.strength
    params[parameter] = expandEffectValue(preference.strength, bounds)
  }
  for (const [key, control] of secondaryControls(effect)) {
    const value = preference?.[key]
    if (value !== undefined) params[control.parameter] = value
  }
  return { ...effect, enabled: effectEnabled(effect, preference), params: { ...effect.params, ...params } }
}

export function resolveSkinColors(tokens: ReturnType<typeof parseSkinTokens>, scheme?: ColorScheme) {
  const overrides = scheme && tokens.variants?.[scheme]
  return overrides ? { ...tokens.colors, ...overrides } : tokens.colors
}

export function applyPreferences<T extends { tokens: ReturnType<typeof parseSkinTokens>; effects: SkinEffect[] }>(
  data: T, preferences: SkinPreferences | undefined, scheme?: ColorScheme,
): T {
  const colors = resolveSkinColors(data.tokens, scheme)
  if (colors === data.tokens.colors && !preferences && !data.effects.some(effect => describeEffect(effect.id).optIn && effect.enabled)) return data
  return {
    ...data,
    tokens: { ...data.tokens, colors: { ...colors, ...preferences?.colors } },
    effects: data.effects.map(effect => overrideEffect(effect, preferences?.effects)),
  }
}
