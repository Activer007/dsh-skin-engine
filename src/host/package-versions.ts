import { randomUUID } from 'node:crypto'
import { readdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import * as z from 'zod/mini'
import { checkedLocation, ensurePackageDirectory, fsErrorCode, PackageFileError, parseJson,
  readPackageFile, type PackageLocation } from './package-files.js'

const VERSION_FILE = '.current.json'
const VERSION_DIRECTORY = '.versions'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const versionId = z.union([z.literal('base'), z.string().check(z.regex(uuid))])
const record = z.strictObject({
  schema: z.literal(1), generation: z.string().check(z.regex(uuid)),
  current: versionId, previous: z.nullable(versionId),
}).check(z.refine(value => value.previous !== value.current))
export type PackageVersions = z.output<typeof record>

export async function readPackageVersions(installation: PackageLocation, signal: AbortSignal) {
  let bytes: Buffer
  try {
    bytes = await readPackageFile(installation, VERSION_FILE, 2048, signal)
  } catch (error) {
    if (fsErrorCode(error) === 'ENOENT') return null
    if (error instanceof PackageFileError && error.code === 'file-changed') {
      bytes = await readPackageFile(installation, VERSION_FILE, 2048, signal)
    } else throw error
  }
  const parsed = record.safeParse(parseJson(bytes))
  if (!parsed.success) throw new PackageFileError('invalid-package-versions', 422)
  return parsed.data
}

export function versionLocation(installation: PackageLocation, version = 'base'): PackageLocation {
  if (version === 'base') return installation
  return { ...installation, segments: [...installation.segments, VERSION_DIRECTORY, version] }
}

async function pruneVersions(installation: PackageLocation, versions: PackageVersions | null) {
  const segments = [...installation.segments, VERSION_DIRECTORY]
  const directory = await checkedLocation(installation.anchor, segments).catch(error => {
    if (fsErrorCode(error) !== 'ENOENT') throw error
  })
  if (!directory) return
  for (const entry of await readdir(directory.path, { withFileTypes: true })) {
    if (!entry.isDirectory() || !uuid.test(entry.name)
      || entry.name === versions?.current || entry.name === versions?.previous) continue
    const target = await checkedLocation(installation.anchor, [...segments, entry.name])
    await rm(target.path, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
  }
}

export async function stagePackageVersion(installation: PackageLocation, versions: PackageVersions | null,
  contents: string, signal: AbortSignal) {
  // Call under the same profile lock as publication so recovery never reaps a writer's work.
  await pruneVersions(installation, versions)
  const next = randomUUID()
  const directory = await ensurePackageDirectory(installation.anchor, [...installation.segments, VERSION_DIRECTORY])
  signal.throwIfAborted()
  await rename(contents, join(directory, next))
  return next
}

export async function commitPackageVersion(installation: PackageLocation, current: string, previous: string | null,
  signal: AbortSignal, write = writeFileAtomic) {
  const next: PackageVersions = { schema: 1, generation: randomUUID(), current, previous }
  const root = await checkedLocation(installation.anchor, installation.segments)
  try {
    signal.throwIfAborted()
    await write(join(root.path, VERSION_FILE), JSON.stringify(next), { mode: 0o600 })
  } catch (error) {
    // An interrupted response cannot decide which version to retain. Inspect the durable record.
    const actual = await readPackageVersions(installation, new AbortController().signal)
    if (actual?.generation !== next.generation) {
      try { await pruneVersions(installation, actual) } catch (cleanupError) {
        console.warn('[skin-engine] package version cleanup deferred', cleanupError)
      }
      throw error
    }
  }
  try { await pruneVersions(installation, next) } catch (error) {
    console.warn('[skin-engine] committed package version; cleanup deferred', error)
  }
  return next
}
