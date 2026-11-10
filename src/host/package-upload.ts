import { mkdir, mkdtemp, open, readdir, rm, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { skinIdSchema, type SkinManifest } from '../core/manifest.js'
import { SkinValidationError } from '../core/validation.js'
import { IMPORT_SKIN_PATH, UPDATE_SKIN_PATH, UPLOAD_CHUNK_BYTES, ZIP_BYTES,
  type PackageTarget, type PackageVersionResult } from '../shared/skins.js'
import type { Register } from './catalogue-routes.js'
import { STAGING_ROOT, validateStagedPackage } from './installed-package.js'
import { checkedLocation, checkedProfile, ensurePackageDirectory, fsErrorCode, PackageFileError } from './package-files.js'
import { extractSkinZip } from './zip-archive.js'

const SESSION_LIMIT = 2
const IDLE_MS = 120_000
const ORPHAN_MS = 24 * 60 * 60 * 1000
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const tempName = /^upload-(\d+)-[A-Za-z0-9]+$/
const headers = { 'cache-control': 'no-store' }

interface Upload {
  id: string
  size: number
  written: number
  abort: AbortController
  stage?: { root: string; directory: string }
  task?: Promise<Response>
  timer?: ReturnType<typeof setTimeout>
  cleanup?: Promise<void>
  committed?: boolean
  target?: PackageTarget
}

type Publish = (manifest: SkinManifest, contents: string, signal: AbortSignal, target?: PackageTarget) =>
  Promise<PackageVersionResult | undefined>

function parseCount(value: string | null) {
  if (!value || !/^(?:0|[1-9]\d{0,8})$/.test(value)) throw new PackageFileError('invalid-upload-query', 400)
  return Number(value)
}

async function removeStage(root: string, directory: string) {
  // Only remove our own directly named staging children, and re-check the parent before recursion.
  if (!tempName.test(directory)) throw new PackageFileError('unsafe-staging-path', 500)
  const target = await checkedLocation(root, [directory]).catch(error => {
    if (fsErrorCode(error) !== 'ENOENT') throw error
  })
  if (target) await rm(target.path, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
}

async function reapOrphans(root: string) {
  const now = Date.now()
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const match = tempName.exec(entry.name)
    if (!match || !entry.isDirectory()) continue
    const info = await stat(join(root, entry.name)).catch(() => undefined)
    if (!info || now - info.mtimeMs < ORPHAN_MS) continue
    try { process.kill(Number(match[1]), 0) } catch (error) {
      if (fsErrorCode(error) === 'ESRCH') await removeStage(root, entry.name)
    }
  }
}

async function appendChunk(request: Request, file: string, offset: number, limit: number, signal: AbortSignal) {
  if (request.headers.get('content-type') !== 'application/octet-stream' || !request.body) {
    throw new PackageFileError('invalid-upload-content-type', 415)
  }
  const reader = request.body.getReader()
  const stop = () => { void reader.cancel(signal.reason).catch(() => {}) }
  signal.addEventListener('abort', stop, { once: true })
  let received = 0
  try {
    if (signal.aborted) stop()
    signal.throwIfAborted()
    const handle = await open(file, offset === 0 ? 'wx' : 'r+', 0o600)
    try {
      if ((await handle.stat()).size !== offset) throw new PackageFileError('upload-file-changed', 409)
      for (;;) {
        signal.throwIfAborted()
        const chunk = await reader.read()
        signal.throwIfAborted()
        if (chunk.done) break
        if (received + chunk.value.byteLength > limit) throw new PackageFileError('upload-chunk-too-large', 413)
        let cursor = 0
        while (cursor < chunk.value.byteLength) {
          signal.throwIfAborted()
          const { bytesWritten } = await handle.write(chunk.value, cursor, chunk.value.byteLength - cursor, offset + received + cursor)
          if (bytesWritten === 0) throw new PackageFileError('upload-write-failed', 503)
          cursor += bytesWritten
        }
        received += cursor
      }
    } finally { await handle.close() }
  } catch (error) {
    stop()
    throw error
  } finally {
    signal.removeEventListener('abort', stop)
    reader.releaseLock()
  }
  if (received !== limit) throw new PackageFileError('incomplete-upload-chunk', 422)
  return received
}

export function registerUploadRoute(register: Register, profileDirectory: string, lifetime: AbortSignal, publish: Publish) {
  const sessions = new Map<string, Upload>()
  let staging: Promise<string> | undefined

  async function clean(upload: Upload) {
    clearTimeout(upload.timer)
    upload.cleanup ??= (async () => {
      if (upload.stage) await removeStage(upload.stage.root, upload.stage.directory)
      sessions.delete(upload.id)
    })().catch(error => { upload.cleanup = undefined; throw error })
    await upload.cleanup
  }

  async function cancel(upload: Upload) {
    upload.abort.abort()
    await upload.task?.catch(() => {})
    await clean(upload)
  }

  function scheduleExpiry(upload: Upload) {
    clearTimeout(upload.timer)
    upload.timer = setTimeout(() => {
      void cancel(upload).catch(error => console.warn('[skin-engine] staging cleanup failed', error))
    }, IDLE_MS)
    upload.timer.unref()
  }

  function run(upload: Upload, request: Request, terminal: boolean, work: (signal: AbortSignal) => Promise<Response>) {
    if (upload.task || upload.abort.signal.aborted) throw new PackageFileError('upload-busy', 409)
    scheduleExpiry(upload)
    const signal = AbortSignal.any([request.signal, upload.abort.signal, lifetime])
    upload.task = Promise.resolve().then(async () => {
      try {
        signal.throwIfAborted()
        const result = await work(signal)
        if (terminal) await clean(upload).catch(error => {
          console.warn('[skin-engine] package installed; staging cleanup deferred', error)
          scheduleExpiry(upload)
        })
        else scheduleExpiry(upload)
        return result
      } catch (error) {
        const cancelled = signal.aborted
        upload.abort.abort()
        await clean(upload)
        if (cancelled) throw new PackageFileError('upload-cancelled', 408)
        throw error
      } finally {
        upload.task = undefined
      }
    })
    return upload.task
  }

  async function serve(request: Request, updating: boolean) {
    const query = new URL(request.url).searchParams
    const op = query.get('op')
    const id = query.get('upload')
    const keys = op === 'begin' ? ['op', 'upload', 'size']
      : op === 'append' ? ['op', 'upload', 'offset'] : ['op', 'upload']
    if (updating && op === 'begin') keys.push('id', 'revision')
    if (!id || !uuid.test(id) || query.size !== keys.length || keys.some(key => !query.has(key))) {
      throw new PackageFileError('invalid-upload-query', 400)
    }
    lifetime.throwIfAborted()
    const session = sessions.get(id)
    const current = session && Boolean(session.target) === updating ? session : undefined
    if (op === 'cancel') {
      if (current) await cancel(current)
      return Response.json({ state: current ? current.committed ? 'published' : 'cancelled' : 'missing' }, { headers })
    }
    if (op === 'begin') {
      const size = parseCount(query.get('size'))
      if (size === 0 || size > ZIP_BYTES) throw new PackageFileError('upload-size-limit', 413)
      if (session || sessions.size >= SESSION_LIMIT) throw new PackageFileError('upload-busy', 409)
      const upload: Upload = { id, size, written: 0, abort: new AbortController() }
      if (updating) {
        const target = skinIdSchema.safeParse(query.get('id'))
        const revision = query.get('revision')
        if (!target.success || !revision || !/^[a-f0-9]{64}$/.test(revision)) {
          throw new PackageFileError('invalid-upload-query', 400)
        }
        upload.target = { id: target.data, revision }
      }
      sessions.set(id, upload)
      return run(upload, request, false, async signal => {
        staging ??= checkedProfile(profileDirectory).then(profile => ensurePackageDirectory(profile, STAGING_ROOT))
          .then(async root => { await reapOrphans(root); return root }).catch(error => { staging = undefined; throw error })
        const root = await staging
        signal.throwIfAborted()
        const directory = basename(await mkdtemp(join(root, `upload-${process.pid}-`)))
        upload.stage = { root, directory }
        signal.throwIfAborted()
        return Response.json({ received: 0 }, { status: 201, headers })
      })
    }
    if (op !== 'append' && op !== 'finish') throw new PackageFileError('invalid-upload-query', 400)
    if (!current) throw new PackageFileError('upload-not-found', 404)
    if (op === 'append') {
      const offset = parseCount(query.get('offset'))
      if (offset !== current.written || offset >= current.size) throw new PackageFileError('upload-offset-conflict', 409)
      return run(current, request, false, async signal => {
        const stage = current.stage!
        const { path } = await checkedLocation(stage.root, [stage.directory])
        current.written += await appendChunk(request, join(path, 'archive.zip'), offset,
          Math.min(current.size - offset, UPLOAD_CHUNK_BYTES), signal)
        return Response.json({ received: current.written }, { headers })
      })
    }
    if (current.written !== current.size) throw new PackageFileError('upload-incomplete', 409)
    return run(current, request, true, async signal => {
      const stage = current.stage!
      const { path } = await checkedLocation(stage.root, [stage.directory])
      const archive = (await checkedLocation(path, ['archive.zip'], true)).path
      const contents = join(path, 'contents')
      await mkdir(contents, { mode: 0o700 })
      const names = await extractSkinZip(archive, contents, signal)
      const manifest = await validateStagedPackage({ anchor: contents, segments: [], source: 'local' }, names, signal)
      signal.throwIfAborted()
      const result = await publish(manifest, contents, signal, current.target)
      current.committed = true
      return Response.json(result ?? { skinId: manifest.id }, { status: result ? 200 : 201, headers })
    })
  }

  for (const path of [IMPORT_SKIN_PATH, UPDATE_SKIN_PATH]) register({
    path: `/${path}`, methods: ['POST'], requestBody: 'streaming',
    async fetch(request) {
      try { return await serve(request, path === UPDATE_SKIN_PATH) } catch (error) {
        if (request.signal.aborted || lifetime.aborted) return Response.json({ error: 'upload-cancelled' }, { status: 408, headers })
        if (error instanceof PackageFileError) return Response.json({ error: error.code }, { status: error.status, headers })
        if (error instanceof SkinValidationError) return Response.json({ error: 'invalid-skin-data', diagnostics: error.diagnostics }, { status: 422, headers })
        console.warn('[skin-engine] package upload failed', error)
        return Response.json({ error: 'package-upload-failed' }, { status: 503, headers })
      }
    },
  })
  return () => Promise.allSettled([...sessions.values()].map(cancel))
}
