import { realpath } from 'node:fs/promises'
import { parseSkinManifest } from '../core/manifest.js'
import { readSkinData, validateSceneArtwork } from './installed-package.js'
import { MANIFEST_LIMIT, parseJson, readPackageFile, utf8, type PackageLocation } from './package-files.js'
import { validateSkinCss } from './skin-css.js'

export const builtInSkinDirectories = [
  'deep-ocean', 'aurora', 'obsidian-neon', 'paper-light', 'mist-pine', 'night-navigator',
  'jade-archive',
  'blue-arc', 'dawn-station', 'moonlit-horizon', 'crimson-rain',
] as const

export async function readBuiltInSkins() {
  const anchor = await realpath(new URL('./skins/', import.meta.url))
  const { signal } = new AbortController()
  return Promise.all(builtInSkinDirectories.map(async directory => {
    const location: PackageLocation = { anchor, segments: [directory], source: 'built-in' }
    const manifest = parseSkinManifest(parseJson(await readPackageFile(location, 'skin.json', MANIFEST_LIMIT, signal)))
    const { parsed, files } = await readSkinData(location, manifest, signal)
    if (parsed.scene) {
      validateSkinCss(utf8(files.css), manifest)
      await validateSceneArtwork(location, parsed.scene, signal)
    }
    return parsed
  }))
}
