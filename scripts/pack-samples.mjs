import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { buffer } from 'node:stream/consumers'
import { parseArgs } from 'node:util'
import { ZipFile } from 'yazl'
import { readSkinSource, ZIP_BYTES } from '../lib/authoring.js'
import { builtInSkinDirectories, parseSkinManifest, readBuiltInSkins } from '../lib/host.js'

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
  const { manifest, files } = await readSkinSource(resolve(source))
  await writeZip(manifest.id, files, manifest.entry)
} else {
  const skins = await readBuiltInSkins()
  for (const [index, directory] of builtInSkinDirectories.entries()) {
    const { manifest } = skins[index]
    const id = `${manifest.id}.sample`
    const sample = parseSkinManifest({
      ...manifest, id, name: `${manifest.name} (ZIP Sample)`,
      ...(manifest.nameEn ? { nameEn: `${manifest.nameEn} (ZIP Sample)` } : {}),
    })
    const root = new URL(`../lib/skins/${directory}/`, import.meta.url)
    const paths = new Set([...Object.values(manifest.entry), ...Object.values(manifest.preview ?? {}), ...manifest.assets ?? []])
    const files = new Map([['skin.json', Buffer.from(JSON.stringify(sample, null, 2) + '\n')]])
    for (const file of paths) {
      const bytes = await readFile(new URL(file, root))
      files.set(file, file === manifest.entry.styles
        ? Buffer.from(bytes.toString('utf8').replaceAll(`data-dsh-skin-id="${manifest.id}"`, `data-dsh-skin-id="${id}"`))
        : bytes)
    }
    await writeZip(directory, files, manifest.entry)
  }
}
