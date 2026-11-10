import { createHash } from 'node:crypto'
import { boolean } from 'zod/mini'
import { readDshRuntimeVersion } from '../adapter/host-version.js'
import { checkSkinCompatibility, ENGINE_API_VERSION } from '../core/manifest.js'
import { AUDIT_PATH, type AuditStatus } from '../shared/audit.js'
import { readBuiltInSkins } from './built-in-skins.js'
import { registerCatalogueRoutes, type Route } from './catalogue-routes.js'
import { registerPackageRoutes } from './package-management.js'
import { createSelectionStore, registerSelectionRoutes, type DomainStorage, type SelectionDomain } from './skin-selection.js'

export { builtInSkinDirectories, readBuiltInSkins } from './built-in-skins.js'
export { checkSkinCompatibility, parseSkinManifest } from '../core/manifest.js'
export { parseSkinPackage } from '../core/skin-package.js'
export { createSelectionStore, registerSelectionRoutes } from './skin-selection.js'
export { createSkinRegistry } from './skin-registry.js'
export { registerPackageRoutes } from './package-management.js'
export { stagePackageVersion, commitPackageVersion } from './package-versions.js'

const MAX_PROBE_BYTES = 8192
const probeSchema = boolean()
declare const SKIN_ENGINE_VERSION: string

interface HostContext {
  profileContext: { name: string; dir: string }
  storageDomain: DomainStorage
  connection: { fetch: { register(route: Route): () => Promise<void> } }
  effect(setup: () => () => Promise<void>, label: string): unknown
}

function json(value: object, status = 200): Response {
  return Response.json(value, { status, headers: { 'cache-control': 'no-store' } })
}

async function readStream(request: Request, lifetime: AbortSignal): Promise<Response> {
  if (request.body === null) return json({ error: 'missing-body' }, 400)
  const signal = AbortSignal.any([request.signal, lifetime])
  const reader = request.body.getReader()
  const abort = () => { void reader.cancel(signal.reason).catch(() => {}) }
  signal.addEventListener('abort', abort, { once: true })
  let bytes = 0
  try {
    if (signal.aborted) abort()
    for (;;) {
      signal.throwIfAborted()
      const chunk = await reader.read()
      signal.throwIfAborted()
      if (chunk.done) return json({ bytes })
      bytes += chunk.value.byteLength
      if (bytes > MAX_PROBE_BYTES) {
        await reader.cancel()
        return json({ error: 'body-too-large' }, 413)
      }
    }
  } catch (error) {
    if (signal.aborted) return json({ error: 'cancelled' }, 408)
    throw error
  } finally {
    signal.removeEventListener('abort', abort)
    reader.releaseLock()
  }
}

export const name = 'dsh-skin-engine'
export const inject = ['profileContext', 'storageDomain', 'connection']

export function apply(ctx: HostContext): void {
  const lifetime = new AbortController()
  const profileKey = createHash('sha256').update(ctx.profileContext.name).digest('hex')
  const storage = ctx.storageDomain
  let opening: Promise<SelectionDomain<boolean> | undefined> | undefined
  let drainSelection: (() => Promise<unknown>) | undefined
  let drainPackages: (() => Promise<unknown>) | undefined
  ctx.effect(() => async () => {
    lifetime.abort()
    await Promise.all([drainPackages?.(), drainSelection?.(), opening?.then(domain => domain?.close())])
  }, 'skin-engine: stop audit requests and close storage')

  opening = storage.open<boolean>({
    name: `skin_engine_audit_${profileKey}`,
    version: 1,
    tables: {},
    global: { schema: probeSchema, initial: false },
  }).catch(error => {
    console.error('[skin-engine] audit storage failed to open', error)
    return undefined
  })
  const ready = opening
  const routes = ctx.connection.fetch
  routes.register({
    path: `/${AUDIT_PATH}`,
    methods: ['GET', 'HEAD'],
    requestBody: 'buffered',
    async fetch(request) {
      const domain = await ready
      if (!domain || lifetime.signal.aborted) return json({ error: 'storage-unavailable' }, 503)
      if (request.method === 'HEAD') {
        return new Response(null, { headers: { 'cache-control': 'no-store' } })
      }
      return json({ persisted: domain.global.get(), engineVersion: SKIN_ENGINE_VERSION } satisfies AuditStatus)
    },
  })
  routes.register({
    path: `/${AUDIT_PATH}/persist`,
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      const domain = await ready
      if (!domain || lifetime.signal.aborted) return json({ error: 'storage-unavailable' }, 503)
      request.signal.throwIfAborted()
      await domain.global.set(true)
      return json({ persisted: true })
    },
  })
  routes.register({
    path: `/${AUDIT_PATH}/stream`,
    methods: ['POST'],
    requestBody: 'streaming',
    fetch: request => readStream(request, lifetime.signal),
  })
  routes.register({
    path: `/${AUDIT_PATH}/contracts`,
    methods: ['GET'],
    requestBody: 'buffered',
    async fetch(request) {
      const signal = AbortSignal.any([request.signal, lifetime.signal])
      try {
        signal.throwIfAborted()
        const [dshVersion, skins] = await Promise.all([readDshRuntimeVersion(), readBuiltInSkins()])
        signal.throwIfAborted()
        return json({
          dshVersion: dshVersion ?? null,
          engineApi: ENGINE_API_VERSION,
          skins: skins.map(({ manifest, effects, diagnostics }) => ({
            id: manifest.id,
            colorScheme: manifest.colorScheme,
            effects: effects.length,
            diagnostics,
            compatibility: checkSkinCompatibility(manifest, dshVersion) ?? null,
          })),
        })
      } catch (error) {
        if (signal.aborted) return json({ error: 'cancelled' }, 408)
        console.error('[skin-engine] could not validate built-in skin data', error)
        return json({ error: 'invalid-built-in-skin' }, 500)
      }
    },
  })
  const register = (route: Route) => routes.register(route)
  const registry = registerCatalogueRoutes(register, ctx.profileContext.dir, lifetime.signal)
  const transact = createSelectionStore(ctx.profileContext.dir, storage)
  drainSelection = registerSelectionRoutes(register, ctx.profileContext.dir, storage, registry, lifetime.signal, transact)
  drainPackages = registerPackageRoutes(register, ctx.profileContext.dir, registry, transact, lifetime.signal)
}
