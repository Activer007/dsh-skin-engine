import type { PreparedArtwork, SkinSelection } from '../shared/skins.js'
import { applyPreferences, preferencesFor, samePreferences, type SkinPreferences } from '../shared/preferences.js'
import { canActivate, type skinApi, type SkinCatalogue, type SkinChoice, type SkinData } from './skin-api.js'

interface PreparedSkin {
  choice: SkinChoice
  data: SkinData
  preferences?: SkinPreferences
  artwork?: PreparedArtwork
}

export interface PreferenceDraft { value: SkinPreferences | null; revision: number }

type OperationKind = 'refresh' | 'preview' | 'apply'

interface SwitchState {
  catalogue: SkinCatalogue | null
  catalogueNotice: string
  saved: SkinSelection | null
  rendered: string | null
  preview: string | null
  pending: OperationKind | null
  saving: boolean
  notice: string
}

interface SwitchOptions {
  api: typeof skinApi
  blockReason(choice: SkinChoice, intent?: 'render' | 'apply'): string | undefined
  switchAppearance(choice: SkinChoice): (() => void) | undefined
  mount(data: SkinData, preferences?: SkinPreferences, artwork?: PreparedArtwork): () => void
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

async function prepareArtwork(art: NonNullable<SkinData['art']>, signal: AbortSignal): Promise<PreparedArtwork> {
  signal.throwIfAborted()
  const image = new Image()
  image.alt = ''
  image.draggable = false
  const abort = () => image.removeAttribute('src')
  signal.addEventListener('abort', abort, { once: true })
  try {
    image.src = new URL(art.url, document.baseURI).href
    await image.decode()
    signal.throwIfAborted()
    return { image, style: art }
  } catch (error) {
    signal.throwIfAborted()
    throw new Error('The skin background could not be loaded.', { cause: error })
  } finally {
    signal.removeEventListener('abort', abort)
  }
}

export function createSkinSwitch({ api, blockReason, switchAppearance, mount, previewMs = 30_000 }: SwitchOptions) {
  let state: SwitchState = {
    catalogue: null, catalogueNotice: '', saved: null, rendered: null, preview: null, pending: null, saving: false, notice: '',
  }
  const listeners = new Set<() => void>()
  let operation: AbortController | undefined
  let committed: PreparedSkin | null = null
  let preview: PreparedSkin | null = null
  let details: { choice: SkinChoice; data: SkinData } | undefined
  let active: { skin: PreparedSkin; release: () => void } | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let catalogueRefreshQueued = false
  let disposed = false

  function publish(change: Partial<SwitchState>) {
    if (disposed) return
    state = { ...state, ...change }
    for (const listener of listeners) listener()
  }

  function releaseActive() {
    const previous = active
    active = undefined
    previous?.release()
  }

  function render(skin: PreparedSkin | null): string | undefined {
    const reason = skin ? blockReason(skin.choice) : undefined
    if (skin && !reason && active?.skin === skin) return
    releaseActive()
    publish({ rendered: null })
    if (skin && !reason) {
      active = { skin, release: mount(applyPreferences(skin.data, skin.preferences), skin.preferences, skin.artwork) }
      publish({ rendered: skin.choice.manifest.id })
    }
    return reason
  }

  function clearPreview() {
    clearTimeout(timer)
    timer = undefined
    preview = null
    if (state.preview !== null) publish({ preview: null })
  }

  function begin(kind: OperationKind) {
    operation?.abort()
    clearTimeout(timer)
    operation = new AbortController()
    publish({ pending: kind, notice: '' })
    return operation.signal
  }

  function finish(signal: AbortSignal) {
    if (operation?.signal !== signal) return
    operation = undefined
    publish({ pending: null, saving: false })
    if (catalogueRefreshQueued) {
      catalogueRefreshQueued = false
      void refresh(true)
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
      if (candidate && samePackageRevision(candidate.choice, choice)) {
        return samePreferences(preferences, candidate.preferences) ? candidate : { ...candidate, preferences }
      }
    }
    const data = await loadDetails(choice, signal)
    signal.throwIfAborted()
    const artwork = data.art ? await prepareArtwork(data.art, signal) : undefined
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

  async function refresh(reloadChoices = false) {
    if (disposed) return
    if (state.saving) {
      if (reloadChoices) catalogueRefreshQueued = true
      return
    }
    const signal = begin('refresh')
    clearPreview()
    restore()
    try {
      const [saved, catalogue] = await Promise.allSettled([
        api.read(signal), reloadChoices || !state.catalogue ? api.catalogue(signal) : state.catalogue,
      ])
      signal.throwIfAborted()
      if (catalogue.status === 'fulfilled') publish({ catalogue: catalogue.value, catalogueNotice: '' })
      else publish({ catalogueNotice: describe(catalogue.reason) })
      if (saved.status === 'rejected') throw saved.reason
      await adopt(saved.value, signal)
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

  async function select(id: string | null, kind: 'preview' | 'apply', draft?: PreferenceDraft) {
    if (disposed || state.saving || !state.saved) return
    const signal = begin(kind)
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
        publish({ preview: candidate.choice.manifest.id })
        timer = setTimeout(() => { if (preview === candidate) void cancelPreview() }, previewMs)
        return
      }
      publish({ saving: true })
      try {
        const saved = await api.save(candidate?.choice ?? null, expected, signal, draft?.value)
        undoAppearance = undefined
        await adopt(saved, signal, candidate)
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
    preview: (id: string, draft?: PreferenceDraft) => select(id, 'preview', draft),
    apply: (id: string | null, draft?: PreferenceDraft) => select(id, 'apply', draft),
    cancelPreview,
    appearanceChanged() {
      if (disposed) return
      const affected = active?.skin ?? preview ?? committed
      const reason = affected ? blockReason(affected.choice) : undefined
      if (reason) {
        if (preview || state.pending === 'preview') { void cancelPreview(); return }
        render(null)
        publish({ notice: reason })
      } else if (!active && !state.pending) {
        publish({ notice: restore() ?? '' })
      } else {
        // The selected card may have a different appearance requirement from the rendered skin.
        publish({})
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
