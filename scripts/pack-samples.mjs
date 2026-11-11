import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buffer } from 'node:stream/consumers'
import { parseArgs } from 'node:util'
import { ZipFile } from 'yazl'
import { readSkinSource, resourceType, ZIP_BYTES } from '../lib/authoring.js'
import { builtInSkinDirectories, parseSkinManifest, readBuiltInSkins } from '../lib/host.js'
import { assetPaths, checkExactPaths, checkReleaseAsset, examples, loadReleaseAssets,
  releaseSampleDirectories, sourceKey } from './release-assets.mjs'

const { values: { source }, positionals } = parseArgs({
  options: { source: { type: 'string' } }, allowPositionals: true,
})
if (positionals.length > 1) throw Error('Expected at most one output directory')
const destination = resolve(positionals[0] ?? 'dist')
await mkdir(destination, { recursive: true })

async function writeZip(name, files, entry) {
  const zip = new ZipFile()
  const options = { compress: false, mtime: new Date('2026-01-01T00:00:00Z') }
  const textFiles = new Set(Object.values(entry))
  zip.addBuffer(files.get('skin.json'), 'skin.json', options)
  for (const file of [...files.keys()].filter(file => file !== 'skin.json').sort()) {
    const bytes = files.get(file)
    const contents = textFiles.has(file) ? Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n')) : bytes
    zip.addBuffer(contents, file, options)
  }
  const output = buffer(zip.outputStream)
  zip.end()
  const bytes = await output
  if (bytes.length > ZIP_BYTES) throw Error('Skin exceeds the ZIP upload size limit')
  const path = join(destination, `${name}.dshskin.zip`)
  await writeFile(path, bytes)
  console.log(path)
}

if (source) {
  const directory = resolve(source)
  const { manifest, files } = await readSkinSource(directory)
  await checkExactPaths(directory, files.keys())
  const relative = sourceKey(directory, '.')
  if (releaseSampleDirectories.some(item => relative === `${examples}/${item}`)) {
    const inventory = await loadReleaseAssets()
    for (const path of assetPaths(manifest)) checkReleaseAsset(inventory, sourceKey(directory, path), files.get(path), resourceType)
  }
  await writeZip(manifest.id, files, manifest.entry)
} else {
  const inventory = await loadReleaseAssets()
  const skins = await readBuiltInSkins()
  for (const [index, directory] of builtInSkinDirectories.entries()) {
    const { manifest } = skins[index]
    const id = `${manifest.id}.sample`
    const sample = parseSkinManifest({
      ...manifest, id, name: `${manifest.name} (ZIP Sample)`,
      ...(manifest.nameEn ? { nameEn: `${manifest.nameEn} (ZIP Sample)` } : {}),
    })
    const root = new URL(`../lib/skins/${directory}/`, import.meta.url)
    const assets = assetPaths(manifest)
    const paths = new Set([...Object.values(manifest.entry), ...assets])
    await checkExactPaths(fileURLToPath(root), paths)
    const files = new Map([['skin.json', Buffer.from(JSON.stringify(sample, null, 2) + '\n')]])
    for (const file of paths) {
      const bytes = await readFile(new URL(file, root))
      if (assets.has(file)) checkReleaseAsset(inventory, `${examples}/skins/${directory}/${file}`, bytes, resourceType)
      files.set(file, file === manifest.entry.styles
        ? Buffer.from(bytes.toString('utf8').replaceAll(`data-dsh-skin-id="${manifest.id}"`, `data-dsh-skin-id="${id}"`))
        : bytes)
    }
    await writeZip(directory, files, manifest.entry)
  }
}
