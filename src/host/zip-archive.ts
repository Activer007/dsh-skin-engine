import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { once } from 'node:events'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { crc32 } from 'node:zlib'
import { openPromise, type Entry } from 'yauzl'
import { FILE_LIMIT, MANIFEST_LIMIT, PackageFileError } from './package-files.js'

export const EXPANDED_BYTES = 20 * 1024 * 1024
export const ZIP_ENTRIES = 256
const MAX_RATIO = 200
const windowsDevice = /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i
const safeSegment = /^[a-z0-9_-][a-z0-9_.-]*$/i

export function zipPathParts(path: string, allowWrapper = false) {
  const parts = path.split('/')
  if (path.length > (allowWrapper ? 260 : 180) || parts.length > (allowWrapper ? 9 : 8)
    || parts.some(part => !safeSegment.test(part) || part.endsWith('.') || windowsDevice.test(part))) {
    throw new PackageFileError('unsafe-zip-path', 422)
  }
  return parts
}

export function createZipPathIndex() {
  const paths = new Map<string, { spelling: string; directory: boolean; explicit: boolean }>()
  return {
    paths,
    add(parts: readonly string[], directory: boolean) {
      for (let depth = 1; depth <= parts.length; depth++) {
        const spelling = parts.slice(0, depth).join('/')
        const key = spelling.toLowerCase()
        const explicit = depth === parts.length
        const isDirectory = !explicit || directory
        const existing = paths.get(key)
        if (existing && (existing.spelling !== spelling || existing.directory !== isDirectory || (existing.explicit && explicit))) {
          throw new PackageFileError('duplicate-zip-path', 422)
        }
        paths.set(key, { spelling, directory: isDirectory, explicit: explicit || existing?.explicit === true })
      }
    },
  }
}

function entryPath(entry: Entry) {
  const directory = entry.fileName.endsWith('/')
  const path = directory ? entry.fileName.slice(0, -1) : entry.fileName
  const parts = zipPathParts(path, true)
  const mode = (entry.externalFileAttributes >>> 16) & 0o170000
  const expectedMode = directory ? 0o040000 : 0o100000
  const dos = entry.externalFileAttributes & 0xff
  if ((mode !== 0 && mode !== expectedMode) || (dos & 0x08) !== 0 || (!directory && (dos & 0x10) !== 0)
    || entry.extraFields.some(field => field.id === 0x000d || field.id === 0x756e)) {
    throw new PackageFileError('unsafe-zip-entry', 422)
  }
  if (entry.isEncrypted() || ![0, 8].includes(entry.compressionMethod) || (directory && entry.uncompressedSize !== 0)) {
    throw new PackageFileError('unsupported-zip-entry', 422)
  }
  return { path, parts, directory }
}

export async function extractSkinZip(archive: string, destination: string, signal: AbortSignal) {
  signal.throwIfAborted()
  const zip = await openPromise(archive, {
    lazyEntries: true, autoClose: false, strictFileNames: true, validateEntrySizes: true,
  }).catch(() => { throw new PackageFileError('invalid-zip', 422) })
  try {
    if (zip.entryCount > ZIP_ENTRIES) throw new PackageFileError('too-many-zip-entries', 413)
    const files = new Map<string, Entry>()
    const index = createZipPathIndex()
    let total = 0
    try {
      for await (const entry of zip.eachEntry()) {
        signal.throwIfAborted()
        const { path, parts, directory } = entryPath(entry)
        index.add(parts, directory)
        if (directory) continue
        const limit = parts.at(-1) === 'skin.json' ? MANIFEST_LIMIT : FILE_LIMIT
        total += entry.uncompressedSize
        if (entry.uncompressedSize > limit || total > EXPANDED_BYTES
          || entry.uncompressedSize > entry.compressedSize * MAX_RATIO) {
          throw new PackageFileError('zip-expansion-limit', 413)
        }
        files.set(path, entry)
      }
    } catch (error) {
      signal.throwIfAborted()
      if (error instanceof PackageFileError) throw error
      throw new PackageFileError('invalid-zip', 422)
    }

    const wrapper = files.has('skin.json') ? '' : [...files.keys()].find(path => /^[^/]+\/skin\.json$/.test(path))?.split('/')[0]
    if (wrapper === undefined || (wrapper && [...index.paths.values()].some(({ spelling }) =>
      spelling !== wrapper && !spelling.startsWith(wrapper + '/')))) {
      throw new PackageFileError('missing-zip-manifest', 422)
    }
    const names = new Set<string>()
    for (const [raw, entry] of files) {
      signal.throwIfAborted()
      const path = wrapper ? raw.slice(wrapper.length + 1) : raw
      zipPathParts(path)
      const target = join(destination, path)
      await mkdir(dirname(target), { recursive: true })
      let checksum = 0
      let count = 0
      const verify = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          count += chunk.length
          checksum = crc32(chunk, checksum)
          callback(count <= entry.uncompressedSize ? null : new PackageFileError('zip-expansion-limit', 413), chunk)
        },
      })
      try {
        const stream = await zip.openReadStreamPromise(entry)
        await pipeline(stream, verify, createWriteStream(target, { flags: 'wx', mode: 0o600 }), { signal })
      } catch (error) {
        signal.throwIfAborted()
        if (error instanceof PackageFileError || (error instanceof Error && 'path' in error)) throw error
        throw new PackageFileError('invalid-zip-entry', 422)
      }
      if (count !== entry.uncompressedSize || checksum !== entry.crc32) throw new PackageFileError('invalid-zip-entry', 422)
      names.add(path)
    }
    signal.throwIfAborted()
    return names
  } finally {
    if (zip.isOpen) {
      const closed = once(zip, 'close')
      zip.close()
      await closed
    }
  }
}
