import * as z from 'zod/mini'
import { hexColor } from './tokens.js'
import { invalid, parseFile, type SkinDiagnostic } from './validation.js'
import type { SkinManifest } from './manifest.js'

export type EffectRenderer = 'css' | 'canvas2d' | 'webgl'
export const AMBIENT_LIGHT_MAX_INTENSITY = 0.22

function number(min: number, max: number, initial: number) {
  return z._default(z.number().check(z.minimum(min), z.maximum(max)), initial)
}

function integer(min: number, max: number, initial: number) {
  return z._default(z.int().check(z.minimum(min), z.maximum(max)), initial)
}

function defineEffect<const Id extends string, const Kind extends EffectRenderer, Params extends z.ZodMiniType>(
  id: Id, renderer: Kind, params: Params,
) {
  return {
    id,
    renderer,
    schema: z.strictObject({ id: z.literal(id), enabled: z.boolean(), renderer: z.literal(renderer), params }),
  }
}

const particleSize = z.number().check(z.minimum(0.25), z.maximum(6))
const sizeRange = z.tuple([particleSize, particleSize]).check(z.refine(
  ([min, max]) => min <= max, 'Expected sizes in ascending order',
))

export const effectDefinitions = {
  glass: defineEffect('glass.liquid', 'css', z.strictObject({
    blur: number(0, 24, 16),
    tintAlpha: number(0.08, 0.30, 0.18),
    saturation: number(1, 1.5, 1.25),
    edgeLight: number(0, 1, 0.3),
    frost: number(0, 1, 0.25),
  })),
  aurora: defineEffect('ambient.aurora', 'css', z.strictObject({
    speed: number(0.1, 1, 0.25),
    intensity: number(0, 1, 0.45),
    palette: z._default(z.enum(['ocean', 'aurora']), 'ocean'),
    blur: number(0, 96, 48),
    direction: number(0, 360, 35),
    movement: z.optional(z.number().check(z.minimum(0), z.maximum(1))),
  })),
  dust: defineEffect('particles.dust', 'canvas2d', z.strictObject({
    density: number(0, 1, 0.35),
    densityMultiplier: z.optional(z.int().check(z.minimum(1), z.maximum(4))),
    speed: number(0.1, 1, 0.25),
    sizeRange: z._default(sizeRange, (): [number, number] => [0.75, 2.25]),
    opacity: number(0, 1, 0.35),
    drift: number(0, 1, 0.3),
  })),
  bubbles: defineEffect('particles.bubbles', 'canvas2d', z.strictObject({
    density: number(0, 1, 0.6),
    densityMultiplier: z.optional(z.int().check(z.minimum(1), z.maximum(4))),
    speed: number(0.1, 1, 0.35),
    opacity: number(0, 1, 0.55),
  })),
  flow: defineEffect('light.flow', 'css', z.strictObject({
    speed: number(0.1, 1, 0.2),
    intensity: number(0, 1, 0.22),
    width: number(1, 48, 8),
    colorStops: z._default(z.array(hexColor).check(z.minLength(2), z.maxLength(5)), () => ['#6dc7ff00', '#6dc7ff']),
    route: z._default(z.enum(['background', 'edge']), 'background'),
    count: integer(1, 2, 1),
  })),
  ripple: defineEffect('interaction.ripple', 'canvas2d', z.strictObject({
    durationMs: integer(300, 800, 450),
    maxRadius: number(80, 220, 120),
    ringCount: integer(1, 3, 1),
    color: z._default(hexColor, '#6dc7ff'),
  })),
  stars: defineEffect('particles.starfield', 'canvas2d', z.strictObject({
    starCount: integer(0, 128, 64),
    twinkle: number(0, 1, 0.22),
    parallax: number(0, 1, 0.12),
    depthLayers: integer(1, 3, 2),
    brightness: number(0, 1, 0.5),
  })),
  holographic: defineEffect('glass.holographic', 'css', z.strictObject({
    iridescence: number(0, 1, 0.28),
    edgeWidth: number(0, 4, 1),
    pointerInfluence: number(0, 1, 0.2),
    spectrum: z._default(z.enum(['prism', 'cool', 'warm']), 'prism'),
    intensity: number(0, 1, 0.4),
  })),
  refraction: defineEffect('glass.refraction', 'webgl', z.strictObject({
    distortion: number(0, 1, 0.2),
    dispersion: number(0, 1, 0.08),
    flowSpeed: number(0.1, 1, 0.25),
    refractionScale: number(0.25, 1, 0.5),
    quality: z._default(z.enum(['low', 'balanced', 'high']), 'balanced'),
  })),
  ambientLight: defineEffect('ambient.light', 'css', z.strictObject({
    intensity: number(0, AMBIENT_LIGHT_MAX_INTENSITY, 0.14),
    speed: number(0.1, 1, 0.3),
    illuminateArtwork: z.optional(z.boolean()),
  })),
  brightness: defineEffect('scene.brightness', 'css', z.strictObject({
    level: number(0.5, 1.5, 1),
  })),
} as const

export type EffectDefinition = (typeof effectDefinitions)[keyof typeof effectDefinitions]
export type SkinEffect = z.output<EffectDefinition['schema']>
export type EffectParams<Id extends SkinEffect['id']> = Extract<SkinEffect, { id: Id }>['params']

const registry = new Map<string, EffectDefinition>(Object.values(effectDefinitions).map(definition => [definition.id, definition]))
const profileSchema = z.strictObject({
  schema: z.literal('dsh.effects/v1'),
  effects: z.array(z.strictObject({
    id: z.string().check(z.minLength(1), z.maxLength(96)),
    enabled: z.boolean(),
    renderer: z.string().check(z.minLength(1), z.maxLength(24)),
    params: z.record(z.string(), z.unknown()),
  })).check(z.maxLength(32)),
})

export function parseSkinEffects(value: unknown, capabilities: SkinManifest['capabilities']) {
  const file = 'effects.json'
  const profile = parseFile(profileSchema, value, file)
  const effects: SkinEffect[] = []
  const diagnostics: SkinDiagnostic[] = []
  const seen = new Set<string>()

  for (const [index, entry] of profile.effects.entries()) {
    const path = `effects.${index}`
    const definition = registry.get(entry.id)
    if (!definition) {
      diagnostics.push({ file, path: `${path}.id`, code: 'unknown-effect', message: `Unknown effect ${entry.id} skipped` })
      continue
    }
    if (seen.has(entry.id)) invalid(file, `${path}.id`, 'duplicate-effect', `Effect ${entry.id} is already declared`)
    seen.add(entry.id)
    const effect = parseFile(definition.schema, entry, file, path)
    const capability = `effects:${effect.renderer}` as const
    if (!capabilities.includes(capability)) {
      invalid(file, `${path}.renderer`, 'missing-capability', `Effect ${entry.id} requires ${capability}`)
    }
    effects.push(effect)
  }
  return { effects, diagnostics }
}
