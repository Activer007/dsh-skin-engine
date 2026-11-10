import { gte, minVersion } from 'semver'
import * as z from 'zod/mini'
import type { SkinEffect } from './effects.js'
import { ARTWORK_MOTION_API_VERSION, isPackageImage, type SkinManifest } from './manifest.js'
import { hexColor } from './tokens.js'
import { invalid, parseFile } from './validation.js'

const file = 'scene.json'
const bounded = (min: number, max: number) => z.number().check(z.minimum(min), z.maximum(max))
const scale = bounded(0.5, 1.5)
const opacity = bounded(0, 0.35)
const unit = bounded(0, 1)
const effectId = z.string().check(z.minLength(1), z.maxLength(96))
const artworkAsset = z.string().check(z.minLength(1), z.maxLength(180))

const sceneSchema = z.strictObject({
  schema: z.literal('dsh.scene/v1'),
  layout: z.strictObject({
    artwork: z.strictObject({
      asset: artworkAsset,
      variants: z.optional(z.strictObject({ light: z.optional(artworkAsset), dark: z.optional(artworkAsset) })),
      fit: z.enum(['contain', 'cover']),
      anchor: z.enum([
        'left top', 'left center', 'left bottom', 'center top', 'center center', 'center bottom',
        'right top', 'right center', 'right bottom',
      ]),
      focalPoint: z.tuple([unit, unit]),
      scale,
      opacity,
      motion: z.optional(z.strictObject({
        parallax: z.optional(z.strictObject({
          maxX: bounded(0, 8),
          maxY: bounded(0, 4),
          settleMs: z.int().check(z.minimum(180), z.maximum(500)),
        })),
        ambientLight: z.optional(z.strictObject({ color: hexColor, opacity: bounded(0, 0.24) })),
      })),
    }),
    safeArea: z.optional(z.strictObject({ contentLeftFraction: bounded(0.5, 0.9) })),
    breakpoints: z.optional(z.array(z.strictObject({
      maxWidth: z.int().check(z.minimum(320), z.maximum(1920)), artworkScale: scale, opacity,
    })).check(z.maxLength(4))),
  }),
  presets: z.strictObject({
    static: z.tuple([]),
    light: z.array(effectId).check(z.maxLength(2)),
    dynamic: z.array(effectId).check(z.maxLength(8)),
  }),
})

export type SceneSpec = z.output<typeof sceneSchema>

export function parseScene(value: unknown, manifest: SkinManifest, effects: readonly SkinEffect[]): SceneSpec {
  const scene = parseFile(sceneSchema, value, file)
  const { asset, variants, motion } = scene.layout.artwork
  if (motion) {
    const minimum = minVersion(manifest.engineApi)
    if (!minimum || !gte(minimum, ARTWORK_MOTION_API_VERSION)) {
      invalid('skin.json', 'engineApi', 'artwork-motion-engine-api', `Artwork motion requires Engine API ${ARTWORK_MOTION_API_VERSION} or later`)
    }
    if (!manifest.capabilities.includes('effects:css')) {
      invalid('skin.json', 'capabilities', 'missing-capability', 'Artwork motion requires the effects:css capability')
    }
    if (!scene.layout.safeArea) {
      invalid(file, 'layout.safeArea', 'missing-artwork-safe-area', 'Artwork motion requires a reserved conversation area')
    }
  }
  const references = { asset, ...Object.fromEntries(Object.entries(variants ?? {}).map(([scheme, path]) => [`variants.${scheme}`, path])) }
  for (const [field, path] of Object.entries(references)) {
    if (!manifest.assets?.includes(path) || !isPackageImage(path)) {
      invalid(file, `layout.artwork.${field}`, 'invalid-artwork-asset', 'Artwork must reference a declared package image')
    }
  }
  let previousWidth = 0
  for (const [index, { maxWidth }] of (scene.layout.breakpoints ?? []).entries()) {
    if (maxWidth <= previousWidth) {
      invalid(file, `layout.breakpoints.${index}.maxWidth`, 'unordered-breakpoint', 'Breakpoints must be strictly increasing')
    }
    previousWidth = maxWidth
  }
  const ids = new Set<string>(effects.map(effect => effect.id))
  for (const preset of ['light', 'dynamic'] as const) {
    const seen = new Set<string>()
    for (const [index, id] of scene.presets[preset].entries()) {
      const path = `presets.${preset}.${index}`
      if (!ids.has(id)) invalid(file, path, 'undeclared-effect', 'Preset effects must be declared and supported in effects.json')
      if (seen.has(id)) invalid(file, path, 'duplicate-effect', 'Preset effects must be unique')
      seen.add(id)
    }
  }
  return scene
}
