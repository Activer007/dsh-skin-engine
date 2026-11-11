import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
export const examples = 'DSH_Skin_Engine_Development_Pack_v1.0/examples'
export const releaseSampleDirectories = [
  'skins/ink-focus', 'skins/warm-dusk',
  'scenes/night-navigator', 'scenes/morning-observatory', 'scenes/crimson-rain', 'scenes/night-navigator-motion',
  'templates/portrait-light', 'templates/portrait-dark', 'templates/portrait-dual',
  'characters/jade-reading-room', 'characters/last-train-study', 'characters/twilight-shift',
]
export const assetPaths = manifest => new Set([...Object.values(manifest.preview ?? {}), ...manifest.assets ?? []])
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

export async function checkExactPaths(directory, paths) {
  const directories = new Map()
  for (const path of paths) {
    const parts = path.split('/')
    let parent = directory
    for (const [index, part] of parts.entries()) {
      if (!directories.has(parent)) directories.set(parent, await readdir(parent, { withFileTypes: true }))
      const matches = directories.get(parent).filter(entry => entry.name.toLowerCase() === part.toLowerCase())
      assert.equal(matches.length, 1, `Missing file or case collision: ${resolve(parent, part)}`)
      const [entry] = matches
      assert.equal(entry.name, part, `Path spelling differs on disk: ${path}`)
      assert(index === parts.length - 1 ? entry.isFile() : entry.isDirectory(), `Expected a regular source path: ${path}`)
      parent = resolve(parent, part)
    }
  }
}

function dimensions(bytes, format) {
  if (format === 'png') return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]
  if (format === 'svg') {
    const tag = bytes.toString('utf8').match(/^<svg\b[^>]*>/)?.[0] ?? ''
    return ['width', 'height'].map(name => Number(tag.match(new RegExp(` ${name}="([0-9]+)"`))?.[1]))
  }
  if (format === 'webp') {
    switch (bytes.toString('latin1', 12, 16)) {
      case 'VP8X': return [bytes.readUIntLE(24, 3) + 1, bytes.readUIntLE(27, 3) + 1]
      case 'VP8L': return [(bytes.readUInt16LE(21) & 0x3fff) + 1, ((bytes.readUIntLE(22, 3) >>> 6) & 0x3fff) + 1]
      case 'VP8 ': return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff]
    }
  }
  throw Error(`Unsupported inventory format: ${format}`)
}

export async function loadReleaseAssets(file = new URL('docs/release-assets.json', root)) {
  const { provenance, files } = JSON.parse(await readFile(file, 'utf8'))
  const entries = new Map()
  const folded = new Set()
  for (const row of files) {
    const key = row.path.toLowerCase()
    assert(!folded.has(key), `Duplicate release asset path: ${row.path}`)
    folded.add(key)
    assert(Object.hasOwn(provenance, row.provenance), `Unknown provenance: ${row.path}`)
    entries.set(row.path, row)
  }
  return entries
}

export function checkReleaseAsset(inventory, path, bytes, resourceType) {
  const record = inventory.get(path)
  assert(record, `Unlisted release asset: ${path}`)
  const format = path.split('.').at(-1).toLowerCase()
  if (format !== 'svg') assert.equal(resourceType(path, bytes), `image/${format}`, path)
  assert.equal(record.format, format, path)
  assert.deepEqual([record.width, record.height], dimensions(bytes, format), `Asset dimensions differ: ${path}`)
  assert.equal(bytes.length, record.bytes, `Asset size differs: ${path}`)
  assert.equal(sha256(bytes), record.sha256, `Asset hash differs: ${path}`)
}

export function sourceKey(directory, path) {
  return relative(fileURLToPath(root), resolve(directory, path)).replaceAll('\\', '/')
}

export async function checkOutputFiles(directory, paths) {
  const actual = (await readdir(directory, { recursive: true, withFileTypes: true }))
    .filter(entry => !entry.isDirectory())
    .map(entry => relative(directory, resolve(entry.parentPath, entry.name)).replaceAll('\\', '/'))
  assert.deepEqual(actual.sort(), [...paths].sort(), `Unexpected build output in ${directory}`)
}
