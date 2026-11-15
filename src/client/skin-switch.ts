import { artworkUrl, portraitSkinIds, sameArtwork, type ArtworkPreference } from '../shared/user-artwork.js'
import type { ColorScheme } from '../core/tokens.js'
import type { PreparedArtwork, SkinSelection } from '../shared/skins.js'
import { applyPreferences, preferencesFor, samePreferences, type SkinPreferences } from '../shared/preferences.js'
import { canActivate, type skinApi, type SkinCatalogue, type SkinChoice, type SkinData } from './skin-api.js'

interface PreparedSkin {
  choice: SkinChoice
  data: SkinData
  preferences?: SkinPreferences
  artwork?: PreparedArtwork | Record<ColorScheme, PreparedArtwork | undefined>
}

interface MountedSkin {
  update(data: SkinData, artwork?: PreparedArtwork): void
  release(): void
}

export interface PreferenceDraft { value: SkinPreferences | null; revision: number }

type OperationKind = 'refresh' | 'preview' | 'apply'

interface SwitchState {
  catalogue: SkinCatalogue | null
  catalogueNotice: string
  saved: SkinSelection | null
  rendered: string | null
  preview: string | null
  previewDeadline?: number
  pending: OperationKind | null
  pendingPreviewOwner?: symbol
  saving: boolean
  notice: string
}

interface SwitchOptions {
  api: typeof skinApi
  getColorScheme(): ColorScheme
  blockReason(choice: SkinChoice, intent?: 'render' | 'apply'): string | undefined
  switchAppearance(choice: SkinChoice): (() => void) | undefined
  mount(skin: PreparedSkin, data: SkinData, artwork?: PreparedArtwork): MountedSkin
  onApplied?(id: string): void
  previewMs?: number
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Skin operation failed.'
}

function samePackageRevision(previous: SkinChoice, next: SkinChoice) {
  return previous.manifest.id === next.manifest.id && previous.revision === next.revision
    && previous.source === next.source && Boolean(previous.managed) === Boolean(next.managed)
    && previous.dataUrl === next.dataUrl
}

async function decodeArtwork(url: string, signal: AbortSignal) {
  signal.throwIfAborted()
  const image = new Image()
  image.alt = ''
  image.draggable = false
  const abort = () => image.removeAttribute('src')
  signal.addEventListener('abort', abort, { once: true })
  try {
    image.src = new URL(url, document.baseURI).href
    await image.decode()
    signal.throwIfAborted()
    return image
  } finally {
    signal.removeEventListener('abort', abort)
  }
}

async function prepareArtwork(data: SkinData, signal: AbortSignal, custom?: ArtworkPreference): Promise<PreparedSkin['artwork']> {
  if (custom && portraitSkinIds.includes(data.manifest.id)) {
    try {
      const image = await decodeArtwork(artworkUrl(custom.asset), AbortSignal.any([signal, AbortSignal.timeout(10_000)]))
      if (data.scene) return { kind: 'scene', image, layout: { ...data.scene.layout,
        artwork: { ...data.scene.layout.artwork, fit: custom.fit, scale: custom.scale, opacity: custom.opacity,
          focalPoint: [custom.x / 100, custom.y / 100] },
      } }
      return { kind: 'legacy', image, style: { path: custom.asset, size: custom.fit, opacity: custom.opacity,
        position: [custom.x, custom.y], scale: custom.scale } }
    } catch { signal.throwIfAborted() } // Missing/corrupt personal image falls back to the original.
  }
  if (data.scene) {
    const { layout } = data.scene
    async function decode(url: string | undefined): Promise<PreparedArtwork | undefined> {
      if (!url) return
      try {
        const image = await decodeArtwork(url, AbortSignal.any([signal, AbortSignal.timeout(10_000)]))
        return { kind: 'scene', image, layout }
      } catch {
        signal.throwIfAborted()
        return // A scene's canvas remains usable if its decorative image cannot decode.
      }
    }
    const light = data.sceneArtworkVariants?.light ?? data.sceneArtworkUrl
    const dark = data.sceneArtworkVariants?.dark ?? data.sceneArtworkUrl
    if (light === dark) return decode(light)
    const [lightArtwork, darkArtwork] = await Promise.all([decode(light), decode(dark)])
    return { light: lightArtwork, dark: darkArtwork }
  }
  if (!data.art) return
  try {
    return { kind: 'legacy', image: await decodeArtwork(data.art.url, signal), style: data.art }
  } catch (error) {
    signal.throwIfAborted()
    throw new Error('The skin background could not be loaded.', { cause: error })
  }
}

export function createSkinSwitch({ api, getColorScheme, blockReason, switchAppearance, mount, onApplied, previewMs = 30_000 }: SwitchOptions) {
  let state: SwitchState = {
    catalogue: null, catalogueNotice: '', saved: null, rendered: null, preview: null, pending: null, saving: false, notice: '',
  }
  const listeners = new Set<() => void>()
  let operation: AbortController | undefined
  let committed: PreparedSkin | null = null
  let preview: PreparedSkin | null = null
  let details: { choice: SkinChoice; data: SkinData } | undefined
  let active: { skin: PreparedSkin; scheme?: ColorScheme; mount: MountedSkin } | undefined
  let failedRender: { skin: PreparedSkin; scheme?: ColorScheme; reason: string } | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let catalogueRefreshQueued: boolean | 'force' = false
  let disposed = false

  function publish(change: Partial<SwitchState>) {
    if (disposed) return
    state = { ...state, ...change }
    for (const listener of listeners) listener()
  }

  function releaseActive() {
    const previous = active
    active = undefined
    previous?.mount.release()
  }

  function render(skin: PreparedSkin | null): string | undefined {
    const scheme = skin && (skin.data.tokens.variants || skin.data.sceneArtworkVariants) ? getColorScheme() : undefined
    const failure = failedRender?.skin === skin && failedRender.scheme === scheme ? failedRender.reason : undefined
    const reason = skin ? blockReason(skin.choice) ?? failure : undefined
    if (skin && !reason && active?.skin === skin && active.scheme === scheme) return
    try {
      if (skin && !reason) {
        if (active?.skin !== skin) releaseActive()
        const art = skin.artwork
        const artwork = art && ('kind' in art ? art : scheme && art[scheme])
        const data = applyPreferences(skin.data, skin.preferences, scheme)
        if (active) {
          active.mount.update(data, artwork)
          active.scheme = scheme
        } else active = { skin, scheme, mount: mount(skin, data, artwork) }
        failedRender = undefined
      } else releaseActive()
    } catch (error) {
      if (skin) failedRender = { skin, scheme, reason: describe(error) }
      releaseActive()
      throw error
    } finally {
      const rendered = active?.skin.choice.manifest.id ?? null
      if (rendered !== state.rendered) publish({ rendered })
    }
    return reason
  }

  function clearPreview() {
    clearTimeout(timer)
    timer = undefined
    preview = null
    if (state.preview !== null) publish({ preview: null, previewDeadline: undefined })
  }

  function begin(kind: OperationKind, pendingPreviewOwner?: symbol) {
    operation?.abort()
    failedRender = undefined
    clearTimeout(timer)
    operation = new AbortController()
    publish({ pending: kind, pendingPreviewOwner, notice: '' })
    return operation.signal
  }

  function finish(signal: AbortSignal) {
    if (operation?.signal !== signal) return
    operation = undefined
    publish({ pending: null, pendingPreviewOwner: undefined, saving: false })
    if (catalogueRefreshQueued) {
      const queued = catalogueRefreshQueued
      catalogueRefreshQueued = false
      void refresh(queued)
    }
  }

  async function loadDetails(choice: SkinChoice, signal: AbortSignal): Promise<SkinData> {
    for (const cached of [committed, preview, details]) {
      if (cached && samePackageRevision(cached.choice, choice)) return cached.data
    }
    const data = await api.load(choice, signal)
    signal.throwIfAborted()
    if (data.source !== choice.source || Boolean(data.managed) !== Boolean(choice.managed) || data.manifest.id !== choice.manifest.id) {
      throw new Error('Skin data did not match the catalogue.')
    }
    details = { choice, data }
    return data
  }

  async function prepare(id: string | null, preferences: SkinPreferences | undefined, signal: AbortSignal,
    hint?: PreparedSkin | null): Promise<PreparedSkin | null> {
    if (id === null) return null
    const choice = state.catalogue?.skins.find(item => item.manifest.id === id)
    if (!choice) throw new Error('The saved skin is unavailable.')
    if (choice.compatibility) throw new Error(choice.compatibility.message)
    if (!canActivate(choice)) throw new Error('Local skin activation requires a validated installation.')
    for (const candidate of [hint, preview, committed]) {
      if (candidate && samePackageRevision(candidate.choice, choice) && sameArtwork(preferences?.artwork, candidate.preferences?.artwork)) {
        return samePreferences(preferences, candidate.preferences) ? candidate : { ...candidate, preferences }
      }
    }
    const data = await loadDetails(choice, signal)
    signal.throwIfAborted()
    const artwork = await prepareArtwork(data, signal, preferences?.artwork)
    return { choice, data, preferences, artwork }
  }

  function restore() {
    try {
      return render(committed)
    } catch (error) {
      render(null)
      return describe(error)
    }
  }

  async function adopt(saved: SkinSelection, signal: AbortSignal, hint?: PreparedSkin | null) {
    signal.throwIfAborted()
    publish({ saved })
    try {
      const skin = await prepare(saved.skinId, saved.skinId ? preferencesFor(saved.preferences, saved.skinId) : undefined, signal, hint)
      signal.throwIfAborted()
      committed = skin
      publish({ notice: restore() ?? '' })
    } catch (error) {
      if (signal.aborted) return
      committed = null
      render(null)
      publish({ notice: describe(error) })
    }
  }

  async function refresh(reloadChoices: boolean | 'force' = false, previewNotice?: string) {
    if (disposed) return
    if (state.saving) {
      if (reloadChoices && catalogueRefreshQueued !== 'force') catalogueRefreshQueued = reloadChoices
      return
    }
    const signal = begin('refresh')
    clearPreview()
    restore()
    try {
      const [saved, catalogue] = await Promise.allSettled([
        api.read(signal), reloadChoices || !state.catalogue ? api.catalogue(signal, reloadChoices === 'force') : state.catalogue,
      ])
      signal.throwIfAborted()
      if (catalogue.status === 'fulfilled') publish({ catalogue: catalogue.value, catalogueNotice: '' })
      else publish({ catalogueNotice: describe(catalogue.reason) })
      if (saved.status === 'rejected') throw saved.reason
      await adopt(saved.value, signal)
      if (!signal.aborted && previewNotice && !state.notice) publish({ notice: previewNotice })
    } catch (error) {
      if (signal.aborted) return
      committed = null
      render(null)
      publish({ saved: null, notice: describe(error) })
    } finally {
      finish(signal)
    }
  }

  function cancelPreview() {
    if (preview || state.pending === 'preview') return refresh()
  }

  async function select(id: string | null, kind: 'preview' | 'apply', draft?: PreferenceDraft,
    canPreview?: () => boolean, owner?: symbol) {
    if (disposed || state.saving || !state.saved) return
    const signal = begin(kind, owner)
    const expected = draft?.revision ?? state.saved.revision
    const preferences = draft ? draft.value ?? undefined : id ? preferencesFor(state.saved.preferences, id) : undefined
    let undoAppearance: (() => void) | undefined
    function rollbackAppearance() {
      const undo = undoAppearance
      undoAppearance = undefined
      undo?.()
    }
    try {
      const candidate = await prepare(id, preferences, signal)
      signal.throwIfAborted()
      if (canPreview && !canPreview()) throw new Error('Chat preview is no longer available.')
      if (kind === 'apply' && candidate) {
        const reason = blockReason(candidate.choice, 'apply')
        if (reason) throw new Error(reason)
        undoAppearance = switchAppearance(candidate.choice)
        if (undoAppearance) signal.addEventListener('abort', rollbackAppearance, { once: true })
      }
      const reason = render(candidate)
      if (reason) throw new Error(reason)
      clearPreview()
      if (kind === 'preview' && candidate) {
        preview = candidate
        const previewDeadline = performance.now() + previewMs
        timer = setTimeout(() => { if (preview === candidate) void cancelPreview() }, previewMs)
        publish({ preview: candidate.choice.manifest.id, previewDeadline })
        return
      }
      publish({ saving: true })
      try {
        const saved = await api.save(candidate?.choice ?? null, expected, signal, draft?.value)
        undoAppearance = undefined
        await adopt(saved, signal, candidate)
        if (!signal.aborted && id) { try { onApplied?.(id) } catch { /* UI history must not affect saving. */ } }
        return !signal.aborted
      } catch (error) {
        if (signal.aborted) return
        try {
          const actual = await api.read(signal)
          const confirmed = actual.skinId === id && (!draft || id === null
            || samePreferences(preferencesFor(actual.preferences, id), draft.value))
          if (confirmed) undoAppearance = undefined
          else rollbackAppearance()
          await adopt(actual, signal, candidate)
          if (!signal.aborted && !confirmed) publish({ notice: describe(error) })
          return !signal.aborted && confirmed
        } catch (readError) {
          if (signal.aborted) return
          rollbackAppearance()
          committed = null
          render(null)
          publish({ saved: null, notice: describe(readError) })
        }
      }
    } catch (error) {
      if (signal.aborted) return
      rollbackAppearance()
      clearPreview()
      restore()
      publish({ notice: describe(error) })
    } finally {
      signal.removeEventListener('abort', rollbackAppearance)
      finish(signal)
    }
  }

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    getAppearanceBlock: blockReason,
    refresh,
    loadDetails,
    preview: (id: string, draft?: PreferenceDraft, canPreview?: () => boolean, owner?: symbol) =>
      select(id, 'preview', draft, canPreview, owner),
    apply: (id: string | null, draft?: PreferenceDraft) => select(id, 'apply', draft),
    cancelPreview,
    appearanceChanged() {
      if (disposed) return
      const affected = active?.skin ?? preview ?? committed
      const reason = affected ? blockReason(affected.choice) : undefined
      if (reason) {
        if (preview || state.pending === 'preview') { void refresh(false, reason); return }
        render(null)
        publish({ notice: reason })
      } else if (!active && !state.pending) {
        publish({ notice: restore() ?? '' })
      } else {
        try {
          if (active) render(active.skin)
          // The selected card can have a different appearance requirement from the rendered skin.
          publish({})
        } catch (error) {
          if (preview) {
            clearPreview()
            restore()
          }
          publish({ notice: describe(error) })
        }
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      operation?.abort()
      clearPreview()
      releaseActive()
      listeners.clear()
    },
  }
}
