import { realpath } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import { parseSkinManifest } from '../core/manifest.js'
import { ZIP_BYTES } from '../shared/skins.js'
import { packageResources, readSkinData } from './installed-package.js'
import { FILE_LIMIT, MANIFEST_LIMIT, parseJson, readPackageFile, utf8, type PackageLocation } from './package-files.js'
import { resourceType } from './resource-type.js'
import { validateSkinCss } from './skin-css.js'
import { createZipPathIndex, EXPANDED_BYTES, zipPathParts, ZIP_ENTRIES } from './zip-archive.js'

export { ZIP_BYTES }

/** Read a source directory into the same bounded, validated files accepted by ZIP import. */
export async function readSkinSource(directory: string) {
  const root = await realpath(directory)
  const location: PackageLocation = { anchor: dirname(root), segments: [basename(root)], source: 'local' }
  const signal = new AbortController().signal
  const manifest = parseSkinManifest(parseJson(await readPackageFile(location, 'skin.json', MANIFEST_LIMIT, signal)))
  const resources = packageResources(manifest)
  if (resources.size + 4 > ZIP_ENTRIES) throw Error('Skin has too many ZIP entries')
  const index = createZipPathIndex()
  for (const name of ['skin.json', ...Object.values(manifest.entry), ...resources]) index.add(zipPathParts(name), false)
  const { files: { tokens, effects, css } } = await readSkinData(location, manifest, signal)
  validateSkinCss(utf8(css), manifest)
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n')
  if (manifestBytes.length > MANIFEST_LIMIT) throw Error('Skin manifest exceeds the ZIP manifest size limit')
  const files = new Map([
    ['skin.json', manifestBytes],
    [manifest.entry.tokens, tokens],
    [manifest.entry.effects, effects],
    [manifest.entry.styles, css],
  ])
  let expanded = [...files.values()].reduce((total, bytes) => total + bytes.length, 0)
  for (const path of resources) {
    const bytes = await readPackageFile(location, path, FILE_LIMIT, signal)
    expanded += bytes.length
    if (expanded > EXPANDED_BYTES) throw Error('Skin exceeds the expanded ZIP size limit')
    resourceType(path, bytes)
    files.set(path, bytes)
  }
  return { manifest, files }
}
