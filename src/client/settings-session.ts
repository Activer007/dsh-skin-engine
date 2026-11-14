import { settingsDialogSelector } from '../adapter/surface-map.js'
import { createAppearanceSession } from './appearance-session.js'
export type { SettingsDraft } from './appearance-session.js'

/** Legacy settings keeps its close-to-discard contract, independent of main. */
export function createSettingsSession(document: Document, onClose: () => void) {
  const session = createAppearanceSession()
  let dialog: Element | null = null
  let observer: MutationObserver | undefined
  function clear() {
    observer?.disconnect()
    observer = undefined
    dialog = null
    session.clear()
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

  return { ...session,
    get view() { return session.view },
    get selected() { return session.selected },
    get editingEffects() { return session.editingEffects },
    attach, clear,
  }
}
