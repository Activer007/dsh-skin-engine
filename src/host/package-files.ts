import { constants, type BigIntStats } from 'node:fs'
import { lstat, mkdir, open, realpath } from 'node:fs/promises'
import { basename, dirname, join, relative } from 'node:path'

export const MANIFEST_LIMIT = 64 * 1024
export const FILE_LIMIT = 5 * 1024 * 1024

export class PackageFileError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code)
  }
}

export interface PackageLocation {
  anchor: string
  segments: readonly string[]
  source: 'built-in' | 'local'
  managed?: boolean
}

export function fsErrorCode(error: unknown): string | undefined {
  return error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined
}

export async function checkedLocation(anchor: string, segments: readonly string[], file = false) {
  let path = anchor
  let info = await lstat(anchor, { bigint: true })
  if (!info.isDirectory()) throw new PackageFileError('unsafe-path', 404)
  for (const [index, segment] of segments.entries()) {
    path = join(path, segment)
    info = await lstat(path, { bigint: true })
    const regularFile = file && index === segments.length - 1
    if (regularFile ? !info.isFile() : !info.isDirectory()) {
      throw new PackageFileError('unsafe-path', 404)
    }
  }
  if (relative(path, await realpath(path)) !== '') throw new PackageFileError('unsafe-path', 404)
  return { path, info }
}

export async function checkedProfile(directory: string) {
  return (await checkedLocation(await realpath(dirname(directory)), [basename(directory)])).path
}

export async function ensurePackageDirectory(anchor: string, segments: readonly string[]) {
  let path = anchor
  for (let depth = 1; depth <= segments.length; depth++) {
    const prefix = segments.slice(0, depth)
    await mkdir(join(path, segments[depth - 1]), { mode: 0o700 }).catch(error => {
      if (fsErrorCode(error) !== 'EEXIST') throw error
    })
    path = (await checkedLocation(anchor, prefix)).path
  }
  return path
}

function sameFile(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size
    && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs && left.nlink === right.nlink
}

const readFlags = constants.O_RDONLY | (process.platform === 'win32' ? 0 : constants.O_NOFOLLOW | constants.O_NONBLOCK)

/** Paths are fixed entry names or already validated against a Manifest's allowlist. */
export async function readPackageFile(location: PackageLocation, path: string, maxBytes: number, signal: AbortSignal) {
  const segments = [...location.segments, ...path.split('/')]
  signal.throwIfAborted()
  const before = await checkedLocation(location.anchor, segments, true)
  if (location.source === 'local' && before.info.nlink !== 1n) throw new PackageFileError('unsafe-path', 404)
  if (before.info.size > BigInt(maxBytes)) throw new PackageFileError('file-too-large', 413)
  signal.throwIfAborted()

  const handle = await open(before.path, readFlags)
  try {
    const info = await handle.stat({ bigint: true })
    if (!info.isFile() || !sameFile(before.info, info)) throw new PackageFileError('file-changed', 409)
    const bytes = Buffer.alloc(Number(info.size))
    let offset = 0
    while (offset < bytes.length) {
      signal.throwIfAborted()
      const { bytesRead } = await handle.read(bytes, offset, Math.min(64 * 1024, bytes.length - offset), offset)
      if (bytesRead === 0) throw new PackageFileError('file-changed', 409)
      offset += bytesRead
    }
    const after = await checkedLocation(location.anchor, segments, true)
    if (!sameFile(info, after.info) || !sameFile(info, await handle.stat({ bigint: true }))) {
      throw new PackageFileError('file-changed', 409)
    }
    signal.throwIfAborted()
    return bytes
  } finally {
    await handle.close()
  }
}

export function utf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new PackageFileError('invalid-text', 422)
  }
}

export function parseJson(bytes: Uint8Array): unknown {
  const text = utf8(bytes)
  try {
    return JSON.parse(text)
  } catch {
    throw new PackageFileError('invalid-json', 422)
  }
}
