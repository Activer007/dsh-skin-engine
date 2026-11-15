import * as z from 'zod/mini'
import { parseSkinManifest, skinIdSchema, type SkinManifest } from '../core/manifest.js'
import type { SceneSpec } from '../core/scene.js'
import { parseSkinPackage } from '../core/skin-package.js'
import type { SkinPreferences } from '../shared/preferences.js'
import { FILE_LIMIT, MANIFEST_LIMIT, PackageFileError, parseJson, readPackageFile, utf8,
  type PackageLocation } from './package-files.js'
import { skinPreferencesSchema } from './preference-schema.js'
import { resourceType } from './resource-type.js'
import { validateSkinCss } from './skin-css.js'

export const INSTALLED_ROOT = ['skin-engine', 'installed'] as const
export const STAGING_ROOT = ['skin-engine', 'staging'] as const
export const BUNDLE_PREFERENCES = 'preferences.json'
export const BUNDLE_PREFERENCES_SCHEMA = 'dsh.skin-preferences/v1'
export const installedDirectory = /^skin-[0-9a-f-]{36}$/

const preferenceFile = z.strictObject({
  schema: z.literal(BUNDLE_PREFERENCES_SCHEMA), skinId: skinIdSchema, preferences: skinPreferencesSchema,
})

export function packageResources(manifest: SkinManifest) {
  const resources = new Set(manifest.assets)
  if (manifest.preview?.light) resources.add(manifest.preview.light)
  if (manifest.preview?.dark) resources.add(manifest.preview.dark)
  return resources
}

export async function readSkinData(location: PackageLocation, manifest: SkinManifest, signal: AbortSignal) {
  const [tokens, effects, css, scene] = await Promise.all([
    readPackageFile(location, manifest.entry.tokens, FILE_LIMIT, signal),
    readPackageFile(location, manifest.entry.effects, FILE_LIMIT, signal),
    readPackageFile(location, manifest.entry.styles, location.source === 'local' ? MANIFEST_LIMIT : FILE_LIMIT, signal),
    manifest.entry.scene && readPackageFile(location, manifest.entry.scene, MANIFEST_LIMIT, signal),
  ])
  const parsed = parseSkinPackage({ manifest, tokens: parseJson(tokens), effects: parseJson(effects), scene: scene && parseJson(scene) })
  return { parsed, files: { tokens, effects, css, scene } }
}

export async function validateSceneArtwork(location: PackageLocation, scene: SceneSpec, signal: AbortSignal) {
  const { asset } = scene.layout.artwork
  resourceType(asset, await readPackageFile(location, asset, FILE_LIMIT, signal))
}

export async function bundledPreferences(location: PackageLocation, data: ReturnType<typeof parseSkinPackage>,
  signal: AbortSignal): Promise<SkinPreferences | undefined> {
  let bytes: Buffer
  try {
    bytes = await readPackageFile(location, BUNDLE_PREFERENCES, MANIFEST_LIMIT, signal)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return
    throw error
  }
  const result = preferenceFile.safeParse(parseJson(bytes))
  if (!result.success || result.data.preferences.artwork !== undefined || result.data.skinId !== data.manifest.id
    || Object.keys(result.data.preferences.effects ?? {}).some(id => !data.effects.some(effect => effect.id === id))) {
    throw new PackageFileError('invalid-bundled-preferences', 422)
  }
  return result.data.preferences
}

export async function validateStagedPackage(location: PackageLocation, names: ReadonlySet<string>, signal: AbortSignal) {
  const manifest = parseSkinManifest(parseJson(await readPackageFile(location, 'skin.json', MANIFEST_LIMIT, signal)))
  const resources = packageResources(manifest)
  const allowed = new Set(['skin.json', ...Object.values(manifest.entry), ...resources])
  if (names.has(BUNDLE_PREFERENCES)) allowed.add(BUNDLE_PREFERENCES)
  if (names.size !== allowed.size || [...names].some(name => !allowed.has(name))) {
    throw new PackageFileError('invalid-package-files', 422)
  }
  await validatePackageContents(location, manifest, signal)
  return manifest
}

export async function validatePackageContents(location: PackageLocation, manifest: SkinManifest, signal: AbortSignal) {
  const { parsed, files } = await readSkinData(location, manifest, signal)
  validateSkinCss(utf8(files.css), manifest)
  await bundledPreferences(location, parsed, signal)
  for (const path of packageResources(manifest)) {
    resourceType(path, await readPackageFile(location, path, FILE_LIMIT, signal))
  }
}
