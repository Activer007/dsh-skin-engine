import { useEffect, useRef, useSyncExternalStore } from 'react'
import { SettingsButton } from './settings-controls.js'
import { fallbackSettingsCopy, settingsError, type TranslateSettings } from './settings-copy.js'
import type { createAppearanceSession, SettingsDraft } from './appearance-session.js'
import type { createSkinSwitch } from './skin-switch.js'
import type { PackageOperationsStore } from './package-operations.js'

type Controller = ReturnType<typeof createSkinSwitch>
export interface PreviewLayout {
  selectPanel(panel: null): void
  beginNavigation(): AbortSignal
  panelInfo: {
    getSnapshot(): { activePanelId: string | null }
    subscribe(listener: () => void): () => void
  }
}

function chatVisible() {
  if (document.visibilityState !== 'visible') return false
  const composer = document.querySelector('[data-slot="main.conversation"] [data-phase="active"] [data-composer-input]')
    ?? document.querySelector('[data-slot="main.conversation"] [data-composer-input]')
  return Boolean(composer?.getClientRects().length && getComputedStyle(composer).visibility === 'visible'
    && !composer.closest('[data-global-panel],[inert],[hidden]'))
}

function waitForChat(signal: AbortSignal) {
  if (signal.aborted || chatVisible()) return Promise.resolve(!signal.aborted)
  return new Promise<boolean>(resolve => {
    function settle(ready: boolean) {
      observer.disconnect()
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      document.removeEventListener('visibilitychange', check)
      resolve(ready)
    }
    function abort() { settle(false) }
    function check() { if (chatVisible()) settle(true) }
    const observer = new MutationObserver(check)
    const timer = setTimeout(abort, 5000)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true,
      attributeFilter: ['data-global-panel', 'data-phase', 'hidden', 'inert'] })
    signal.addEventListener('abort', abort, { once: true })
    document.addEventListener('visibilitychange', check)
  })
}

interface Request { id: string; draft?: SettingsDraft; packageRevision: string; profileRevision: number }
type Status = { request?: Request; error?: 'previewChatUnavailable' | 'previewChanged' | 'previewStartFailed' }

export function createChatPreview(layout: PreviewLayout, controller: Controller,
  session: ReturnType<typeof createAppearanceSession>, packages: PackageOperationsStore) {
  let status: Status = {}
  let operation: AbortController | undefined
  let started = false
  let disposed = false
  const previewOwner = Symbol('chat preview')
  const listeners = new Set<() => void>()
  function publish(next: Status) {
    status = next
    for (const listener of listeners) listener()
  }
  const inChat = () => layout.panelInfo.getSnapshot().activePanelId === null
  const current = (request: Request) => {
    const state = controller.getSnapshot()
    return state.saved?.revision === request.profileRevision
      && state.catalogue?.skins.some(skin => skin.manifest.id === request.id && skin.revision === request.packageRevision)
      && !packages.getSnapshot().action
  }
  function cancel() {
    const shouldCancel = started && status.request
    release()
    if (shouldCancel) void controller.cancelPreview()
    publish({})
  }
  function release() {
    const active = operation
    operation = undefined
    started = false
    active?.abort()
  }
  async function start(request: Request) {
    if (disposed || operation || status.request || !current(request) || controller.getSnapshot().saving) return
    layout.selectPanel(null)
    const owner = new AbortController()
    operation = owner
    const signal = AbortSignal.any([owner.signal, layout.beginNavigation()])
    publish({ request })
    const stop = () => { if (operation === owner) cancel() }
    signal.addEventListener('abort', stop, { once: true })
    const ready = await waitForChat(signal)
    if (operation !== owner || disposed) return
    if (!ready || !inChat() || !current(request)) {
      operation = undefined
      publish({ error: ready && inChat() ? 'previewChanged' : 'previewChatUnavailable' })
      return
    }
    started = true
    await controller.preview(request.id, request.draft,
      () => !signal.aborted && inChat() && chatVisible() && Boolean(current(request)), previewOwner)
    if (operation !== owner || disposed) return
    if (controller.getSnapshot().preview !== request.id) {
      operation = undefined
      started = false
      publish({ error: 'previewStartFailed' })
    }
  }
  async function apply() {
    const request = status.request
    if (!request || !inChat() || !chatVisible() || controller.getSnapshot().preview !== request.id || controller.getSnapshot().pending) return
    if (!current(request)) { cancel(); publish({ error: 'previewChanged' }); return }
    const saved = await controller.apply(request.id, request.draft)
    if (disposed) return
    if (saved && session.getDraft(request.id) === request.draft) session.setDraft(request.id, undefined)
    operation = undefined
    started = false
    publish(saved ? {} : { error: 'previewStartFailed' })
  }
  const unsubscribeLayout = layout.panelInfo.subscribe(() => { if (!inChat() && operation) cancel() })
  const unsubscribeSwitch = controller.subscribe(() => {
    const state = controller.getSnapshot()
    if (status.request && state.pending === 'preview' && state.pendingPreviewOwner !== previewOwner) {
      release()
      publish({})
    } else if (started && status.request && !state.preview && !state.pending) {
      release()
      publish(state.notice ? { error: 'previewStartFailed' } : {})
    }
  })
  return {
    start, apply, cancel, getSnapshot: () => status,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() {
      disposed = true
      unsubscribeLayout()
      unsubscribeSwitch()
      cancel()
      listeners.clear()
    },
  }
}

export type ChatPreview = ReturnType<typeof createChatPreview>

export function ChatPreviewBar({ preview, controller, t = fallbackSettingsCopy(document.documentElement.lang) }: {
  preview: ChatPreview
  controller: Controller
  t?: TranslateSettings
}) {
  const { request, error } = useSyncExternalStore(preview.subscribe, preview.getSnapshot)
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const ready = Boolean(request && state.preview === request.id)
  const bar = useRef<HTMLElement>(null)
  useEffect(() => {
    if (ready && (document.activeElement === document.body || document.activeElement === null)) bar.current?.focus()
  }, [ready])
  if (!ready && !error && !request) return null
  const name = state.catalogue?.skins.find(skin => skin.manifest.id === request?.id)?.manifest
  const displayName = /^en(?:-|$)/i.test(document.documentElement.lang) ? name?.nameEn ?? name?.name : name?.name
  return <section ref={bar} data-dsh-skin-chat-preview="" tabIndex={-1} aria-label={t('chatPreview')}
    style={{ position: 'absolute', insetBlockStart: 56, insetInlineEnd: 16, maxWidth: 'min(360px, calc(100% - 32px))',
      background: 'var(--dsw-alias-bg-layer-2, Canvas)', color: 'var(--dsw-alias-label-primary, CanvasText)',
      border: '1px solid var(--dsw-alias-settings-card-stroke, GrayText)', borderRadius: 10, padding: 12 }}>
    <div role="status">{error ? settingsError(t, state.notice, error) : ready
      ? t('previewing') + ' · ' + (displayName ?? request?.id) + '. ' + t('previewExpiry') : t('loading')}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBlockStart: 8 }}>
      {ready ? <SettingsButton primary disabled={state.pending === 'apply'} onClick={() => void preview.apply()}>{t('apply')}</SettingsButton> : null}
      <SettingsButton disabled={state.pending === 'apply'} onClick={preview.cancel}>{t(error ? 'dismissPreviewNotice' : 'cancelPreview')}</SettingsButton>
    </div>
  </section>
}
