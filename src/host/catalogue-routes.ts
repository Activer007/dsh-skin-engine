import { readDshRuntimeVersion } from '../adapter/host-version.js'
import { SkinValidationError } from '../core/validation.js'
import { SKINS_PATH, SKIN_PATH, SKIN_ASSET_PATH } from '../shared/skins.js'
import { fsErrorCode, PackageFileError } from './package-files.js'
import { createSkinRegistry } from './skin-registry.js'

declare const PREVIEW_PLACEHOLDER_PATH: string
declare const PREVIEW_PLACEHOLDER_SVG: string

export interface Route {
  path: string
  methods: readonly ('GET' | 'HEAD' | 'POST')[]
  requestBody: 'buffered' | 'streaming'
  fetch(request: Request): Promise<Response>
}

export type Register = (route: Route) => () => Promise<void>

const privateHeaders = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'content-security-policy': "sandbox; default-src 'none'",
}

function reference(path: string, query: Record<string, string>) {
  return `${path}?${new URLSearchParams(query)}`
}

function queryOf(request: Request, keys: readonly string[]): URLSearchParams {
  const query = new URL(request.url).searchParams
  if (query.size !== keys.length || keys.some(key => !query.get(key))) {
    throw new PackageFileError('invalid-query', 400)
  }
  return query
}

export function registerCatalogueRoutes(register: Register, profileDirectory: string, lifetime: AbortSignal) {
  let hostVersion: ReturnType<typeof readDshRuntimeVersion> | undefined
  const registry = createSkinRegistry(profileDirectory, () => hostVersion ??= readDshRuntimeVersion(), lifetime)

  function route(path: string, methods: Route['methods'], serve: (request: Request, signal: AbortSignal) => Promise<Response>) {
    register({
      path: `/${path}`, methods, requestBody: 'buffered',
      async fetch(request) {
        const signal = AbortSignal.any([request.signal, lifetime])
        try {
          signal.throwIfAborted()
          const response = await serve(request, signal)
          signal.throwIfAborted()
          return response
        } catch (error) {
          let code = 'skin-read-failed'
          let status = 500
          if (signal.aborted) {
            code = 'cancelled'
            status = 408
          } else if (error instanceof PackageFileError) {
            code = error.code
            status = error.status
          } else if (error instanceof SkinValidationError) {
            code = 'invalid-skin-data'
            status = 422
          } else if (['ENOENT', 'ENOTDIR', 'ELOOP'].includes(fsErrorCode(error) ?? '')) {
            code = 'file-not-found'
            status = 404
          } else {
            console.error('[skin-engine] skin read failed', error)
          }
          if (request.method === 'HEAD') return new Response(null, { status, headers: privateHeaders })
          return Response.json({ error: code }, { status, headers: privateHeaders })
        }
      },
    })
  }

  route(SKINS_PATH, ['GET'], async (request, signal) => {
    queryOf(request, [])
    const { skins, issues } = await registry.catalogue(signal)
    return Response.json({
      placeholderUrl: PREVIEW_PLACEHOLDER_PATH,
      skins: skins.map(({ manifest, revision, location, compatibility, previousVersion }) => {
        const key = { id: manifest.id, revision }
        return {
          manifest, revision, source: location.source, managed: Boolean(location.managed), compatibility: compatibility ?? null, previousVersion,
          dataUrl: reference(SKIN_PATH, key),
          previews: {
            light: reference(SKIN_ASSET_PATH, { ...key, scheme: 'light' }),
            dark: reference(SKIN_ASSET_PATH, { ...key, scheme: 'dark' }),
          },
        }
      }),
      issues,
    }, { headers: privateHeaders })
  })

  route(SKIN_PATH, ['GET'], async (request, signal) => {
    const query = queryOf(request, ['id', 'revision'])
    const key = { id: query.get('id')!, revision: query.get('revision')! }
    const { sceneArtwork, ...data } = await registry.load(key.id, key.revision, signal)
    const art = 'art' in data && data.art
      ? { ...data.art, url: reference(SKIN_ASSET_PATH, { ...key, path: data.art.path }) } : undefined
    const sceneArtworkUrl = sceneArtwork && reference(SKIN_ASSET_PATH, { ...key, path: sceneArtwork })
    return Response.json({ ...data, art, sceneArtworkUrl }, { headers: privateHeaders })
  })

  route(SKIN_ASSET_PATH, ['GET', 'HEAD'], async (request, signal) => {
    const preview = new URL(request.url).searchParams.has('scheme')
    const query = queryOf(request, ['id', 'revision', preview ? 'scheme' : 'path'])
    const scheme = query.get('scheme')
    if (preview && scheme !== 'light' && scheme !== 'dark') throw new PackageFileError('invalid-query', 400)
    const selector = scheme === 'light' || scheme === 'dark' ? { scheme } as const : { path: query.get('path')! }
    const asset = await registry.asset(query.get('id')!, query.get('revision')!, selector, signal)
    const headers = {
      ...privateHeaders,
      'content-type': asset?.type ?? 'image/svg+xml',
      ...(asset ? {} : { 'x-dsh-skin-placeholder': '1' }),
    }
    return new Response(request.method === 'HEAD' ? null : asset?.bytes ?? PREVIEW_PLACEHOLDER_SVG, { headers })
  })
  return registry
}
