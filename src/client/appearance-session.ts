import type { PreferenceDraft } from './skin-switch.js'

export interface SettingsDraft extends PreferenceDraft { packageRevision: string }
export interface WorkspaceView {
  activePage: 'gallery' | 'effectsPage' | 'managePage'
  showDetails: boolean
  query: string
  tag: string
  source: string
  compatibleOnly: boolean
  favoritesOnly: boolean
  managedId: string
}
function initialView(): WorkspaceView {
  return { activePage: 'gallery', showDetails: false, query: '', tag: '', source: '', compatibleOnly: false, favoritesOnly: false, managedId: '' }
}

/** Window-scoped UI only. Never persists a profile or starts an effect. */
export function createAppearanceSession() {
  const drafts = new Map<string, SettingsDraft>()
  const listeners = new Set<() => void>()
  let revision = 0
  let selected = ''
  let editingEffects = ''
  let view = initialView()

  function publish() {
    revision++
    for (const listener of listeners) listener()
  }

  function clear() {
    view = initialView()
    selected = ''
    editingEffects = ''
    drafts.clear()
    publish()
  }

  return {
    clear,
    get view() { return view },
    setView(change: Partial<WorkspaceView>) { view = { ...view, ...change }; publish() },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    getSnapshot: () => revision,
    get selected() { return selected },
    select(id: string) {
      if (selected === id) return
      selected = id
      publish()
    },
    get editingEffects() { return editingEffects },
    editEffects(id: string) {
      if (editingEffects === id) return
      editingEffects = id
      publish()
    },
    getDraft(id: string) { return drafts.get(id) },
    usesArtwork(asset: string) {
      return [...drafts.values()].some(draft => draft.value?.artwork?.asset === asset)
    },
    setDraft(id: string, value: SettingsDraft | undefined) {
      if (value) drafts.set(id, value)
      else drafts.delete(id)
      publish()
    },
  }
}
