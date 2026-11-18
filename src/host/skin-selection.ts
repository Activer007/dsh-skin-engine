import { sameArtwork, supportsUserArtwork } from '../shared/user-artwork.js'
import { readUserArtwork } from './user-artwork.js'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { withFileLock } from '@deepseek-ai/dsh-atomic-write'
import * as z from 'zod/mini'
import { skinIdSchema } from '../core/manifest.js'
import { SkinValidationError } from '../core/validation.js'
import { editableEffects, preferencesFor, sameEffectPreference, samePreferences } from '../shared/preferences.js'
import { APPLY_SKIN_PATH, SELECTION_PATH, type SkinSelection } from '../shared/skins.js'
import type { Register } from './catalogue-routes.js'
import { checkedProfile, PackageFileError } from './package-files.js'
import { profilePreferencesSchema, skinPreferencesSchema } from './preference-schema.js'
import type { createSkinRegistry } from './skin-registry.js'

const revision = z.int().check(z.minimum(0))
const selectionSchema = z.strictObject({
  skinId: z.nullable(skinIdSchema), revision, preferences: z.optional(profilePreferencesSchema),
})
const applySchema = z.strictObject({
  skinId: z.nullable(skinIdSchema),
  packageRevision: z.nullable(z.string().check(z.regex(/^[a-f0-9]{64}$/))),
  expectedRevision: revision,
  preferences: z.optional(z.nullable(skinPreferencesSchema)),
}).check(z.refine(value => (value.skinId === null) === (value.packageRevision === null)
  && (value.skinId !== null || value.preferences === undefined)))

export interface SelectionDomain<Value> {
  global: { get(): Value; set(value: Value): Promise<void> }
  close(): Promise<void>
}

export interface DomainStorage {
  open<Value>(spec: {
    name: string
    version: number
    compatibleVersions?: readonly number[]
    tables: Record<string, never>
    global: { schema: z.ZodMiniType<Value>; initial: Value }
  }): Promise<SelectionDomain<Value>>
}

const headers = { 'cache-control': 'no-store' }

interface SelectionTransaction {
  profile: string
  read(): Promise<SkinSelection>
  write(selection: SkinSelection): Promise<SkinSelection>
}

export function createSelectionStore(profileDirectory: string, storage: DomainStorage) {
  return async function transact<T>(signal: AbortSignal, run: (transaction: SelectionTransaction) => Promise<T>) {
    const profile = await checkedProfile(profileDirectory)
    const key = createHash('sha256').update(process.platform === 'win32' ? profile.toLowerCase() : profile).digest('hex')
    async function useDomain<T>(operation: (domain: SelectionDomain<SkinSelection>) => Promise<T> | T) {
      const domain = await storage.open<SkinSelection>({
        name: `skin_engine_selection_${key}`, version: 4, compatibleVersions: [1, 2, 3],
        tables: {}, global: { schema: selectionSchema, initial: { skinId: null, revision: 0 } },
      })
      try { return await operation(domain) } finally { await domain.close() }
    }
    const read = () => useDomain(domain => domain.global.get())
    return withFileLock(join(profile, 'skin-engine-selection'), () => run({
      profile, read,
      async write(selection) {
        signal.throwIfAborted()
        try {
          await useDomain(domain => domain.global.set(selection))
          return selection
        } catch {
          // Replacement may have succeeded before rejection. Reopen under the lock.
          return read()
        }
      },
    }), { signal })
  }
}

async function readApply(request: Request) {
  if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
    throw new PackageFileError('invalid-content-type', 415)
  }
  const text = await request.text()
  if (Buffer.byteLength(text) > 2048) throw new PackageFileError('selection-body-too-large', 413)
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new PackageFileError('invalid-selection', 400) }
  const parsed = applySchema.safeParse(value)
  if (!parsed.success) throw new PackageFileError('invalid-selection', 400)
  return parsed.data
}

export function registerSelectionRoutes(
  register: Register,
  profileDirectory: string,
  storage: DomainStorage,
  registry: ReturnType<typeof createSkinRegistry>,
  lifetime: AbortSignal,
  transact = createSelectionStore(profileDirectory, storage),
) {
  const inFlight = new Set<Promise<Response>>()

  async function serve(request: Request, signal: AbortSignal): Promise<Response> {
    if (new URL(request.url).search) throw new PackageFileError('invalid-query', 400)
    const change = request.method === 'POST' ? await readApply(request) : undefined
    return transact(signal, async ({ read, write }) => {
      const current = await read()
      if (!change) return Response.json(current, { headers })
      if (change.expectedRevision !== current.revision) {
        return Response.json({ error: 'selection-conflict', selection: current }, { status: 409, headers })
      }
      const id = change.skinId
      const previous = id ? preferencesFor(current.preferences, id) : undefined
      const artwork = change.preferences?.artwork
      if (change.skinId && change.packageRevision) {
        const candidate = await registry.load(change.skinId, change.packageRevision, signal)
        if (candidate.source !== 'built-in' && !candidate.managed) throw new PackageFileError('skin-unavailable', 409)
        if (artwork && !sameArtwork(artwork, previous?.artwork) && !supportsUserArtwork(candidate)) {
          throw new PackageFileError('unsupported-artwork-skin', 400)
        }
        if (editableEffects.some(id => {
          const next = change.preferences?.effects?.[id]
          const before = previous?.effects?.[id]
          return next && !candidate.effects.some(effect => effect.id === id)
            && !sameEffectPreference(next, before)
        })) {
          throw new PackageFileError('undeclared-effect-preference', 400)
        }
      }
      if (artwork && artwork.asset !== previous?.artwork?.asset) await readUserArtwork(profileDirectory, artwork.asset, signal)
      const preferencesChanged = change.preferences !== undefined && !samePreferences(previous, change.preferences)
      if (id === current.skinId && !preferencesChanged) return Response.json(current, { headers })
      if (current.revision === Number.MAX_SAFE_INTEGER) throw new PackageFileError('revision-exhausted', 409)
      const next = { ...current, skinId: id, revision: current.revision + 1 }
      if (id && preferencesChanged) {
        const preferences = { ...current.preferences }
        if (change.preferences && !samePreferences(change.preferences)) preferences[id] = change.preferences
        else delete preferences[id]
        if (!profilePreferencesSchema.safeParse(preferences).success) throw new PackageFileError('preferences-limit', 409)
        if (Object.keys(preferences).length > 0) next.preferences = preferences
        else delete next.preferences
      }
      const actual = await write(next)
      if (actual.skinId === id && actual.revision === next.revision
        && (!id || samePreferences(preferencesFor(actual.preferences, id), preferencesFor(next.preferences, id)))) {
        return Response.json(actual, { headers })
      }
      return Response.json({ error: 'selection-write-failed', selection: actual }, { status: 503, headers })
    })
  }

  function fetch(request: Request) {
    const signal = AbortSignal.any([request.signal, lifetime])
    const result = serve(request, signal).catch(error => {
      if (signal.aborted) return Response.json({ error: 'cancelled' }, { status: 408, headers })
      if (error instanceof PackageFileError) return Response.json({ error: error.code }, { status: error.status, headers })
      if (error instanceof SkinValidationError) return Response.json({ error: 'invalid-skin-data' }, { status: 422, headers })
      console.warn('[skin-engine] selection storage unavailable', error)
      return Response.json({ error: 'selection-unavailable' }, { status: 503, headers })
    })
    inFlight.add(result)
    void result.then(() => inFlight.delete(result))
    return result
  }

  register({ path: `/${SELECTION_PATH}`, methods: ['GET'], requestBody: 'buffered', fetch })
  register({ path: `/${APPLY_SKIN_PATH}`, methods: ['POST'], requestBody: 'buffered', fetch })
  return () => Promise.allSettled(inFlight)
}
