import type { SkinManifest } from '../core/manifest.js'
import type { parseSkinPackage } from '../core/skin-package.js'
import type { ColorScheme } from '../core/tokens.js'
import type { SkinPreferences } from '../shared/preferences.js'
import { APPLY_SKIN_PATH, EXPORT_SKIN_PATH, IMPORT_SKIN_PATH, REMOVE_SKIN_PATH, ROLLBACK_SKIN_PATH, SELECTION_PATH,
  SKINS_PATH, UPDATE_SKIN_PATH, UPLOAD_CHUNK_BYTES, ZIP_BYTES,
  type PackageTarget, type PackageVersionResult, type SkinArtwork, type SkinSelection } from '../shared/skins.js'

export interface SkinChoice {
  manifest: SkinManifest
  revision: string
  dataUrl: string
  previews: Record<'light' | 'dark', string>
  source: 'built-in' | 'local'
  managed?: boolean
  previousVersion?: string
  compatibility: { code?: string; message: string } | null
}

export interface SkinCatalogue {
  skins: SkinChoice[]
  issues: { source: SkinChoice['source']; directory: string; code: string; id?: string }[]
  placeholderUrl: string
}

export function canActivate(choice: SkinChoice) {
  return choice.source === 'built-in' || choice.managed === true
}

export type SkinData = ReturnType<typeof parseSkinPackage> & {
  source: 'built-in' | 'local'
  managed?: boolean
  art?: SkinArtwork & { url: string }
  sceneArtworkUrl?: string
  sceneArtworkVariants?: Partial<Record<ColorScheme, string>>
  bundledPreferences?: SkinPreferences
}

async function requireSuccess(response: Response) {
  if (response.ok) return response
  const body: { error?: string; diagnostics?: { message: string }[] } = await response.json().catch(() => ({}))
  throw new Error(body.error === 'selection-conflict'
    ? 'Another window saved a different selection or preferences.'
    : body.diagnostics?.[0]?.message ?? body.error ?? `HTTP ${response.status}`)
}

async function request<T>(path: string, signal: AbortSignal, payload?: object): Promise<T> {
  const response = await fetch(new URL(path, document.baseURI), {
    signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
    ...(payload && { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }),
  })
  return (await requireSuccess(response)).json()
}

function reference(path: string, parameters: Record<string, string>) {
  return new URL(`${path}?${new URLSearchParams(parameters)}`, document.baseURI)
}

async function uploadSkin<T extends { skinId: string }>(file: File, signal: AbortSignal, progress: (received: number) => void,
  target?: PackageTarget): Promise<T> {
  if (!file.name.toLowerCase().endsWith('.dshskin.zip')) throw new Error('Select a .dshskin.zip file.')
  if (file.size === 0 || file.size > ZIP_BYTES) throw new Error('Choose a ZIP between 1 byte and 21 MiB.')
  signal.throwIfAborted()
  const upload = crypto.randomUUID()
  const path = target ? UPDATE_SKIN_PATH : IMPORT_SKIN_PATH
  async function send(op: string, parameters: Record<string, string> = {}, body?: Blob, cancel?: AbortSignal) {
    const timeout = AbortSignal.timeout(30_000)
    const response = await fetch(reference(path, { op, upload, ...parameters }), {
      method: 'POST', body, headers: body ? { 'content-type': 'application/octet-stream' } : undefined,
      signal: cancel ? AbortSignal.any([cancel, timeout]) : timeout,
    })
    return (await requireSuccess(response)).json()
  }
  try {
    // Finish the begin handshake even if the user cancels while it is in flight.
    // The independent cancel request can then await Host cleanup.
    await send('begin', { size: String(file.size), ...target })
    for (let offset = 0; offset < file.size; offset += UPLOAD_CHUNK_BYTES) {
      signal.throwIfAborted()
      const end = Math.min(offset + UPLOAD_CHUNK_BYTES, file.size)
      const acknowledgement = await send('append', { offset: String(offset) }, file.slice(offset, end), signal)
      if (acknowledgement.received !== end) throw new Error('Upload acknowledgement did not match the file.')
      progress(end)
    }
    signal.throwIfAborted()
    return await send('finish', {}, undefined, signal) as T
  } catch (error) {
    let result: { state: string } | undefined
    try { result = await send('cancel') } catch {
      if (signal.aborted) throw new Error('Upload stopped locally. Host cleanup could not be confirmed.')
    }
    if (signal.aborted) {
      throw new Error(result?.state === 'cancelled' ? 'Upload cancelled. Host staging cleared.'
        : 'Upload stopped. The refreshed gallery shows the result.')
    }
    throw error
  }
}

export const skinApi = {
  catalogue(signal: AbortSignal, force = false) {
    return request<SkinCatalogue>(force ? `${SKINS_PATH}?refresh=1` : SKINS_PATH, signal)
  },
  read(signal: AbortSignal) { return request<SkinSelection>(SELECTION_PATH, signal) },
  load(choice: SkinChoice, signal: AbortSignal) { return request<SkinData>(choice.dataUrl, signal) },
  save(choice: SkinChoice | null, expectedRevision: number, signal: AbortSignal, preferences?: SkinPreferences | null) {
    return request<SkinSelection>(APPLY_SKIN_PATH, signal, {
      skinId: choice?.manifest.id ?? null,
      packageRevision: choice?.revision ?? null,
      expectedRevision,
      preferences,
    })
  },
  import(file: File, signal: AbortSignal, progress: (received: number) => void) {
    return uploadSkin(file, signal, progress)
  },
  update(choice: SkinChoice, file: File, signal: AbortSignal, progress: (received: number) => void) {
    return uploadSkin<PackageVersionResult>(file, signal, progress, { id: choice.manifest.id, revision: choice.revision })
  },
  rollback(choice: SkinChoice, signal: AbortSignal) {
    return request<PackageVersionResult>(`${ROLLBACK_SKIN_PATH}?${new URLSearchParams({
      id: choice.manifest.id, revision: choice.revision,
    })}`, signal, {})
  },
  async export(choice: SkinChoice, options: { assets: boolean; preferences: boolean }, signal: AbortSignal) {
    const response = await fetch(reference(EXPORT_SKIN_PATH, {
      id: choice.manifest.id, revision: choice.revision,
      ...(options.assets ? { assets: '1' } : {}), ...(options.preferences ? { preferences: '1' } : {}),
    }), { signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) })
    return (await requireSuccess(response)).blob()
  },
  remove(choice: SkinChoice, signal: AbortSignal) {
    return request<{ removed: string }>(`${REMOVE_SKIN_PATH}?${new URLSearchParams({
      id: choice.manifest.id, revision: choice.revision,
    })}`, signal, {})
  },
}
