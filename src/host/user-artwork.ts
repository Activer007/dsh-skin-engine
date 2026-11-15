import { createHash } from 'node:crypto'
import { open, readdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { withFileLock } from '@deepseek-ai/dsh-atomic-write'
import { artworkAssetPattern, USER_ARTWORK_IMAGE_PATH, USER_ARTWORK_LIMIT, USER_ARTWORK_PATH } from '../shared/user-artwork.js'
import type { Register } from './catalogue-routes.js'
import { checkedProfile, ensurePackageDirectory, fsErrorCode, PackageFileError, readPackageFile } from './package-files.js'
import { resourceType } from './resource-type.js'

const folder = 'skin-engine-user-artwork'
const headers = {
  'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
  'content-security-policy': "sandbox; default-src 'none'",
}
export async function readUserArtwork(profileDirectory: string, asset: string, signal: AbortSignal) {
  if (!artworkAssetPattern.test(asset)) throw new PackageFileError('invalid-artwork', 400)
  const profile = await checkedProfile(profileDirectory)
  const bytes = await readPackageFile({ anchor: profile, segments: [folder], source: 'local' }, asset, USER_ARTWORK_LIMIT, signal)
  const type = resourceType(asset, bytes)
  if (createHash('sha256').update(bytes).digest('hex') !== asset.split('.')[0]) throw new PackageFileError('invalid-artwork', 422)
  return { bytes, type }
}

export function registerUserArtworkRoutes(register: Register, profileDirectory: string, lifetime: AbortSignal) {
  const pending = new Set<Promise<Response>>()
  let uploading = false
  async function readImage(request: Request, signal: AbortSignal) {
    const query = new URL(request.url).searchParams
    const asset = query.get('asset')
    if (query.size !== 1 || !asset) throw new PackageFileError('invalid-query', 400)
    const { bytes, type } = await readUserArtwork(profileDirectory, asset, signal)
    return new Response(request.method === 'HEAD' ? null : new Uint8Array(bytes), { headers: { ...headers, 'content-type': type } })
  }
  async function upload(request: Request, signal: AbortSignal) {
    if (new URL(request.url).searchParams.size) throw new PackageFileError('invalid-query', 400)
    if (uploading) throw new PackageFileError('artwork-upload-busy', 409)
    uploading = true
    try {
      const type = request.headers.get('content-type')
      const extension = type === 'image/png' ? 'png' : type === 'image/jpeg' ? 'jpg' : type === 'image/webp' ? 'webp' : null
      if (!extension || !request.body) throw new PackageFileError('invalid-resource-type', 415)
      const chunks: Uint8Array[] = []
      const reader = request.body.getReader()
      const abort = () => { void reader.cancel().catch(() => {}) }
      signal.addEventListener('abort', abort, { once: true })
      let size = 0
      try {
        for (;;) {
          signal.throwIfAborted()
          const chunk = await reader.read()
          signal.throwIfAborted()
          if (chunk.done) break
          size += chunk.value.length
          if (size > USER_ARTWORK_LIMIT) { await reader.cancel(); throw new PackageFileError('artwork-too-large', 413) }
          chunks.push(chunk.value)
        }
      } finally { signal.removeEventListener('abort', abort); reader.releaseLock() }
      const bytes = Buffer.concat(chunks)
      if (resourceType(`image.${extension}`, bytes) !== type) throw new PackageFileError('invalid-resource-type', 415)
      const asset = `${createHash('sha256').update(bytes).digest('hex')}.${extension}`
      const profile = await checkedProfile(profileDirectory)
      return await withFileLock(join(profile, 'skin-engine-user-artwork-lock'), async () => {
        const directory = await ensurePackageDirectory(profile, [folder])
        const entries = await readdir(directory)
        if (!entries.includes(asset)) {
          // Bounded profile storage; never delete an image referenced by another draft/window.
          if (entries.filter(name => artworkAssetPattern.test(name)).length >= 32) throw new PackageFileError('artwork-storage-full', 409)
          signal.throwIfAborted()
          const path = join(directory, asset)
          const handle = await open(path, 'wx', 0o600).catch(error => {
            if (fsErrorCode(error) !== 'EEXIST') throw error
          })
          if (handle) {
            try {
              try { await handle.writeFile(bytes, { signal }) } finally { await handle.close() }
            } catch (error) {
              await unlink(path).catch(() => {})
              throw error
            }
          }
        }
        await readUserArtwork(profile, asset, signal)
        return Response.json({ asset }, { headers })
      }, { signal })
    } finally { uploading = false }
  }
  function route(path: string, methods: readonly ('GET' | 'HEAD' | 'POST')[], requestBody: 'buffered' | 'streaming',
    serve: (request: Request, signal: AbortSignal) => Promise<Response>) {
    register({ path: '/' + path, methods, requestBody, fetch(request) {
      const signal = AbortSignal.any([request.signal, lifetime, AbortSignal.timeout(30_000)])
      const result = serve(request, signal).catch((error: unknown) => {
        const missing = ['ENOENT', 'ENOTDIR'].includes(fsErrorCode(error) ?? '')
        const status = error instanceof PackageFileError ? error.status : missing ? 404 : 503
        if (request.method === 'HEAD') return new Response(null, { status, headers })
        const code = error instanceof PackageFileError ? error.code : missing ? 'artwork-not-found' : 'artwork-unavailable'
        return Response.json({ error: code }, { status, headers })
      })
      pending.add(result)
      void result.finally(() => pending.delete(result))
      return result
    } })
  }
  // DSH's streaming bridge attaches a request body, which Fetch disallows for GET and HEAD.
  route(USER_ARTWORK_IMAGE_PATH, ['GET', 'HEAD'], 'buffered', readImage)
  route(USER_ARTWORK_PATH, ['POST'], 'streaming', upload)
  return () => Promise.allSettled(pending)
}
