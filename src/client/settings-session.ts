import { settingsDialogSelector } from '../adapter/surface-map.js'
import type { PreferenceDraft } from './skin-switch.js'

export interface SettingsDraft extends PreferenceDraft {
  packageRevision: string
}

export function createSettingsSession(document: Document, onClose: () => void) {
  const drafts = new Map<string, SettingsDraft>()
  const listeners = new Set<() => void>()
  let revision = 0
  let selected = ''
  let editingEffects = ''
  let dialog: Element | null = null
  let observer: MutationObserver | undefined

  function publish() {
    revision++
    for (const listener of listeners) listener()
  }

  function clear() {
    observer?.disconnect()
    observer = undefined
    dialog = null
    selected = ''
    editingEffects = ''
    drafts.clear()
    publish()
  }

  function attach(panel: HTMLElement) {
    const next = panel.closest(settingsDialogSelector)
    if (next === dialog && next?.isConnected) return () => {}
    clear()
    if (!next) return () => { clear(); onClose() }
    dialog = next
    const parent = next.parentElement!
    observer = new MutationObserver(() => {
      if (next.isConnected) return
      clear()
      onClose()
    })
    observer.observe(parent, { childList: true })
    observer.observe(document.body, { childList: true })
    return () => {}
  }

  return {
    attach, clear,
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
    setDraft(id: string, value: SettingsDraft | undefined) {
      if (value) drafts.set(id, value)
      else drafts.delete(id)
      publish()
    },
  }
}
