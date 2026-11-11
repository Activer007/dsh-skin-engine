import { gte, minVersion, satisfies, valid, validRange } from 'semver'
import * as z from 'zod/mini'
import { MINIMUM_DSH_VERSION } from '../shared/compatibility.js'
import { invalid, parseFile, type SkinDiagnostic } from './validation.js'

const LEGACY_API_VERSION = '1.0.0'
const SCENE_API_VERSION = '1.1.0'
const SCENE_PRESET_API_VERSION = '1.2.0'
export const DUAL_APPEARANCE_API_VERSION = '1.3.0'
export const ARTWORK_MOTION_API_VERSION = '1.4.0'
export const ENGINE_API_VERSION = ARTWORK_MOTION_API_VERSION

const capabilities = ['tokens', 'css', 'assets', 'effects:css', 'effects:canvas2d', 'effects:webgl', 'scene'] as const
const segment = /^[a-z0-9_-][a-z0-9_.-]*$/i
const device = /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i
export const isPackageImage = (path: string) => /\.(?:png|webp|jpe?g)$/i.test(path)

function resourcePath(value: string, folder: 'preview' | 'assets'): boolean {
  const parts = value.split('/')
  return parts[0] === folder && parts.length >= 2 && parts.length <= 8
    && parts.every(part => segment.test(part) && !part.endsWith('.') && !device.test(part))
    && (isPackageImage(value) || (folder === 'assets' && /\.woff2$/i.test(value)))
}

const range = z.string().check(z.minLength(1), z.maxLength(64), z.refine(
  value => value.trim() !== '' && validRange(value) !== null,
  'Expected a SemVer range',
))
const previewPath = z.string().check(z.maxLength(160), z.refine(
  value => resourcePath(value, 'preview'),
  'Expected a safe package-relative image path under preview/',
))
export const skinIdSchema = z.string().check(z.maxLength(96), z.regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/))

const manifestSchema = z.strictObject({
  schema: z.literal('dsh.skin/v1'),
  id: skinIdSchema,
  name: z.string().check(z.minLength(1), z.maxLength(80)),
  nameEn: z.optional(z.string().check(z.maxLength(80))),
  author: z.optional(z.string().check(z.maxLength(80))),
  description: z.optional(z.string().check(z.maxLength(1200))),
  version: z.string().check(z.refine(
    value => /^\d/.test(value) && value.trim() === value && valid(value) !== null,
    'Expected a SemVer version',
  )),
  engineApi: range,
  dshCompatibility: z.optional(range),
  tags: z.optional(z.array(z.string().check(z.maxLength(24))).check(z.maxLength(16))),
  colorScheme: z.optional(z.enum(['light', 'dark', 'both'])),
  entry: z.strictObject({
    tokens: z.literal('tokens.json'),
    styles: z.literal('theme.css'),
    effects: z.literal('effects.json'),
    scene: z.optional(z.literal('scene.json')),
  }),
  preview: z.optional(z.strictObject({ light: z.optional(previewPath), dark: z.optional(previewPath) })),
  capabilities: z.array(z.enum(capabilities)).check(z.maxLength(capabilities.length)),
  assets: z.optional(z.array(z.string().check(z.maxLength(180), z.refine(
    value => resourcePath(value, 'assets'),
    'Expected a safe package-relative image or WOFF2 path under assets/',
  ))).check(z.maxLength(128))),
})

export type SkinManifest = z.output<typeof manifestSchema>

export function parseSkinManifest(value: unknown): SkinManifest {
  const manifest = parseFile(manifestSchema, value, 'skin.json')
  if (new Set(manifest.capabilities).size !== manifest.capabilities.length) {
    invalid('skin.json', 'capabilities', 'duplicate-capability', 'Capabilities must be unique')
  }
  const assets = manifest.assets ?? []
  const paths = new Set(assets.map(path => path.toLowerCase()))
  if (paths.size !== assets.length) {
    invalid('skin.json', 'assets', 'duplicate-path', 'Asset paths must be unique regardless of case')
  }
  const { light, dark } = manifest.preview ?? {}
  if (light && dark && light !== dark && light.toLowerCase() === dark.toLowerCase()) {
    invalid('skin.json', 'preview', 'duplicate-path', 'Preview paths differ only in case')
  }
  if ((assets.length > 0 || light || dark) && !manifest.capabilities.includes('assets')) {
    invalid('skin.json', 'capabilities', 'missing-capability', 'Resources require the assets capability')
  }
  if (Boolean(manifest.entry.scene) !== manifest.capabilities.includes('scene')) {
    invalid('skin.json', 'capabilities', 'scene-capability-mismatch', 'entry.scene and the scene capability must be declared together')
  }
  if (manifest.entry.scene) {
    if (!manifest.capabilities.includes('assets')) {
      invalid('skin.json', 'capabilities', 'missing-capability', 'Scene artwork requires the assets capability')
    }
    const minimum = minVersion(manifest.engineApi)
    if (!minimum || !gte(minimum, SCENE_API_VERSION)) {
      invalid('skin.json', 'engineApi', 'scene-engine-api', `Scenes require Engine API ${SCENE_API_VERSION} or later`)
    }
  }
  return manifest
}

export function checkSkinCompatibility(manifest: SkinManifest, dshVersion: string | undefined): SkinDiagnostic | undefined {
  if (!dshVersion || !valid(dshVersion) || !gte(dshVersion, MINIMUM_DSH_VERSION)) {
    return {
      file: 'skin.json', path: 'dshCompatibility', code: 'unsupported-host',
      message: `Unsupported DSH version ${dshVersion ?? '(unknown)'}. Skin Engine requires DSH >=${MINIMUM_DSH_VERSION}.`,
    }
  }
  const compatible = satisfies(ENGINE_API_VERSION, manifest.engineApi)
    || satisfies(DUAL_APPEARANCE_API_VERSION, manifest.engineApi)
    || satisfies(SCENE_PRESET_API_VERSION, manifest.engineApi)
    || satisfies(SCENE_API_VERSION, manifest.engineApi)
    || (!manifest.entry.scene && satisfies(LEGACY_API_VERSION, manifest.engineApi))
  if (!compatible) {
    return {
      file: 'skin.json', path: 'engineApi', code: 'incompatible-engine',
      message: `Engine API ${ENGINE_API_VERSION} does not satisfy ${manifest.engineApi}`,
    }
  }
  if (manifest.dshCompatibility && !satisfies(dshVersion, manifest.dshCompatibility, { includePrerelease: true })) {
    return {
      file: 'skin.json', path: 'dshCompatibility', code: 'incompatible-dsh',
      message: `DSH ${dshVersion} does not satisfy ${manifest.dshCompatibility}`,
    }
  }
  return undefined
}
