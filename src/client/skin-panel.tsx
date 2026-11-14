import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { AUDIT_PATH, type AuditStatus } from '../shared/audit.js'
import type { ChatPreview } from './chat-preview.js'
import type { createEffectsRuntime } from './effects/p0.js'
import type { PackageOperationsStore } from './package-operations.js'
import { SettingsButton } from './settings-controls.js'
import { fallbackSettingsCopy, settingsError, type TranslateSettings } from './settings-copy.js'
import { WindowEffects } from './skin-effects.js'
import type { createSkinSwitch } from './skin-switch.js'

declare const MANAGER_STYLES: string
declare const SKIN_ENGINE_VERSION: string

interface PanelProps {
  controller: ReturnType<typeof createSkinSwitch>
  effects: ReturnType<typeof createEffectsRuntime>
  packageOperations: PackageOperationsStore
  preview?: ChatPreview
  t?: TranslateSettings
}

type HostCheck = AuditStatus | { error: string }
const noopSubscribe = () => () => {}
const noPreview = () => undefined

export function SkinPanel({ controller, effects, packageOperations, preview, t = fallbackSettingsCopy(document.documentElement.lang) }: PanelProps) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const { action: packageAction } = useSyncExternalStore(packageOperations.subscribe, packageOperations.getSnapshot)
  const chatPreview = useSyncExternalStore(preview?.subscribe ?? noopSubscribe, preview?.getSnapshot ?? noPreview)
  const name = (id: string) => {
    const manifest = state.catalogue?.skins.find(choice => choice.manifest.id === id)?.manifest
    return (/^en(?:-|$)/i.test(document.documentElement.lang) ? manifest?.nameEn : undefined) || manifest?.name || id
  }
  const previewing = Boolean(chatPreview?.request || state.preview || state.pending === 'preview')
  const busy = Boolean(packageAction || state.pending || state.saving)
  const canRestore = !busy && Boolean(state.saved?.skinId)
  const [confirmation, setConfirmation] = useState<number>()
  const confirmedRevision = confirmation !== undefined && state.saved?.revision === confirmation
  const [restored, setRestored] = useState(false)
  const confirmId = useId()
  const [hostStatus, setHostStatus] = useState<HostCheck | null>()
  const hostRequest = useRef<AbortController>(undefined)
  useEffect(() => () => hostRequest.current?.abort(), [])

  async function checkHost() {
    if (hostRequest.current) return
    const request = new AbortController()
    hostRequest.current = request
    setHostStatus(null)
    try {
      const response = await fetch(new URL(AUDIT_PATH, document.baseURI), {
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const result: AuditStatus = await response.json()
      if (!request.signal.aborted) setHostStatus(result)
    } catch (error) {
      if (!request.signal.aborted) setHostStatus({ error: error instanceof Error && /^HTTP \d{3}$/.test(error.message) ? error.message : '' })
    } finally {
      hostRequest.current = undefined
    }
  }

  const hostMessage = hostStatus === null ? t('checkingHost') : hostStatus === undefined ? ''
    : 'error' in hostStatus ? [t('hostUnavailable'), hostStatus.error].filter(Boolean).join(' ')
      : [
          hostStatus.engineVersion ? t('hostVersion', { version: hostStatus.engineVersion }) : t('hostNoVersion'),
          t('probeSaved', { saved: t(hostStatus.persisted ? 'yes' : 'no') }),
          hostStatus.engineVersion && hostStatus.engineVersion !== SKIN_ENGINE_VERSION ? t('versionMismatch') : '',
          hostStatus.engineVersion === SKIN_ENGINE_VERSION ? '' : t('restart'),
        ].filter(Boolean).join(' ')

  async function restore() {
    if (!canRestore || !confirmedRevision) return
    setConfirmation(undefined)
    setRestored(false)
    if (await controller.apply(null)) setRestored(true)
  }

  return <section data-dsh-skin-engine="" data-dsh-skin-controls="">
    <style>{MANAGER_STYLES}</style>
    <header>
      <h2>{t('title')}</h2>
      <p className="dsh-skin-muted" data-saved-skin={state.saved ? state.saved.skinId ?? '' : undefined}>
        <strong>{t('saved')}</strong> {state.saved ? state.saved.skinId ? name(state.saved.skinId) : t('defaultSkin') : t('unavailable')}
        {state.rendered !== state.saved?.skinId ? <> · <strong>{t('showing')}</strong> {state.rendered ? name(state.rendered) : t('defaultSkin')}</> : null}
      </p>
    </header>
    <WindowEffects t={t} runtime={effects} showing={state.rendered ? name(state.rendered) : undefined} />
    <section className="dsh-skin-detail" aria-label={t('recovery')}>
      <h3>{t('recovery')}</h3>
      <div className="dsh-skin-actions">
        <SettingsButton disabled={!previewing || state.pending === 'apply'} onClick={() => {
          if (chatPreview?.request) preview?.cancel()
          else void controller.cancelPreview()
        }}>{t('cancelPreview')}</SettingsButton>
        <SettingsButton disabled={!canRestore} aria-expanded={confirmedRevision} aria-controls={confirmId}
          onClick={() => setConfirmation(state.saved?.revision)}>{t('restoreDefault')}</SettingsButton>
      </div>
      <div id={confirmId} className="dsh-skin-confirmation" hidden={!confirmedRevision}>
        {confirmedRevision ? <>
          <p>{t('restoreDefaultWarning')}</p>
          <div className="dsh-skin-actions">
            <SettingsButton primary disabled={!canRestore} onClick={() => void restore()}>{t('confirmRestoreDefault')}</SettingsButton>
            <SettingsButton onClick={() => setConfirmation(undefined)}>{t('keepSelection')}</SettingsButton>
          </div>
        </> : null}
      </div>
      <p role="status">{state.notice ? settingsError(t, state.notice, 'error.selection') : state.saving ? t('saving')
        : restored && state.saved?.skinId === null ? t('defaultRestored') : ''}</p>
    </section>
    <section className="dsh-skin-detail" aria-label={t('diagnostics')}>
      <h3>{t('diagnostics')}</h3>
      <p className="dsh-skin-muted">{t('clientVersion', { version: SKIN_ENGINE_VERSION })}</p>
      <div className="dsh-skin-actions">
        <SettingsButton disabled={hostStatus === null} onClick={() => void checkHost()}>{t('checkHost')}</SettingsButton>
      </div>
      <p role="status">{hostMessage}</p>
      {state.catalogueNotice ? <p role="alert">{settingsError(t, state.catalogueNotice, 'error.selection')}</p> : null}
      {state.catalogue?.issues.length ? <p>{t('catalogueIssueCount', { count: state.catalogue.issues.length })}</p> : null}
    </section>
  </section>
}
