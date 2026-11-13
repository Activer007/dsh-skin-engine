import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react'
import { auditedSurfaceStyles } from '../adapter/surface-map.js'
import { AUDIT_PATH, type AuditStatus } from '../shared/audit.js'
import { preferencesFor, qualityLevels, type QualityChoice } from '../shared/preferences.js'
import type { createEffectsRuntime, EffectMode } from './effects/p0.js'
import { ImportSkin } from './package-controls.js'
import type { ScenePreset } from './scene/presets.js'
import { fallbackSettingsCopy, settingsError, type TranslateSettings } from './settings-copy.js'
import type { createSettingsSession } from './settings-session.js'
import { SkinDetail } from './skin-detail.js'
import { SkinPreviewImage } from './skin-preview-image.js'
import type { createSkinSwitch } from './skin-switch.js'

declare const MANAGER_STYLES: string
declare const PROBE_ASSET: string
declare const SKIN_ENGINE_VERSION: string

const scenePresets = ['static', 'light', 'dynamic'] as const
const windowModes = ['dynamic', 'static', 'economy', 'off'] as const
const pages = ['gallery', 'effectsPage', 'managePage'] as const
type Page = (typeof pages)[number]
type HostCheck = { version?: string; persisted: boolean } | { error: string }

export interface PanelProps {
  controller: ReturnType<typeof createSkinSwitch>
  effects: ReturnType<typeof createEffectsRuntime>
  getColorScheme(): 'light' | 'dark'
  settingsSession: ReturnType<typeof createSettingsSession>
  t?: TranslateSettings
}

export function SkinPanel({ controller, effects, getColorScheme, settingsSession, t: translate }: PanelProps) {
  const [language, setLanguage] = useState(() => document.documentElement.lang)
  const t = translate ?? fallbackSettingsCopy(language)
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const effectMode = useSyncExternalStore(effects.subscribe, effects.getMode)
  const scenePreset = useSyncExternalStore(effects.subscribe, effects.getScenePreset)
  const effectiveScenePreset = useSyncExternalStore(effects.subscribe, effects.getEffectiveScenePreset)
  const quality = useSyncExternalStore(effects.subscribe, effects.getQuality)
  const effectiveQuality = useSyncExternalStore(effects.subscribe, effects.getEffectiveQuality)
  const refraction = useSyncExternalStore(effects.subscribe, effects.getRefraction)
  useSyncExternalStore(settingsSession.subscribe, settingsSession.getSnapshot)
  const panel = useRef<HTMLElement>(null)
  const [activePage, setActivePage] = useState<Page>('gallery')
  const [showDetails, setShowDetails] = useState(false)
  const detailBack = useRef<HTMLButtonElement>(null)
  const card = useRef<HTMLButtonElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const focusTarget = useRef<'detail' | 'gallery' | undefined>(undefined)
  const tabId = useId()
  const [query, search] = useState('')
  const [tag, filterTag] = useState('')
  const [source, filterSource] = useState('')
  const [compatibleOnly, filterCompatibility] = useState(false)
  const [hostStatus, setHostStatus] = useState<HostCheck | null>()
  const [versionNotice, setVersionNotice] = useState<((t: TranslateSettings) => string) | undefined>()
  const detailId = useId()
  const choices = state.catalogue?.skins ?? []
  const tags = [...new Set(choices.flatMap(item => item.manifest.tags ?? []))].sort()
  const term = query.trim().toLowerCase()
  const visible = choices.filter(({ manifest, source: origin, compatibility }) => {
    if (source && source !== origin) return false
    if (compatibleOnly && compatibility) return false
    if (tag && !manifest.tags?.includes(tag)) return false
    return !term || [manifest.name, manifest.nameEn, manifest.author, manifest.id, ...(manifest.tags ?? [])]
      .some(value => value?.toLowerCase().includes(term))
  })
  const choice = choices.find(item => item.manifest.id === settingsSession.selected)
    ?? choices.find(item => item.manifest.id === state.saved?.skinId)
    ?? choices[0]
  const editingId = choice?.manifest.id
  const draft = editingId ? settingsSession.getDraft(editingId) : undefined
  const displayName = (manifest: { name: string; nameEn?: string }) =>
    /^en(?:-|$)/i.test(language) ? manifest.nameEn || manifest.name : manifest.name
  const name = (id: string | null | undefined) => {
    const item = choices.find(item => item.manifest.id === id)
    return item ? displayName(item.manifest) : id ?? t('defaultSkin')
  }
  const scheme = getColorScheme()
  const previewing = state.preview !== null || state.pending === 'preview'
  const filtersActive = Boolean(query || tag || source || compatibleOnly)
  const placeholder = state.catalogue?.placeholderUrl

  function moveTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number
    switch (event.key) {
      case 'ArrowLeft': next = (index + pages.length - 1) % pages.length; break
      case 'ArrowRight': next = (index + 1) % pages.length; break
      case 'Home': next = 0; break
      case 'End': next = pages.length - 1; break
      default: return
    }
    event.preventDefault()
    const page = pages[next]!
    setActivePage(page)
    document.getElementById(`${tabId}-tab-${page}`)?.focus()
  }

  useEffect(() => {
    const target = focusTarget.current
    focusTarget.current = undefined
    if (target === 'detail') detailBack.current?.focus()
    if (target === 'gallery') (card.current ?? searchInput.current)?.focus()
  }, [showDetails])

  function clearFilters() {
    search('')
    filterTag('')
    filterSource('')
    filterCompatibility(false)
  }

  useEffect(() => {
    if (!panel.current) return
    const release = settingsSession.attach(panel.current)
    const current = controller.getSnapshot()
    if (current.preview === null && current.pending === null) void controller.refresh(true)
    return release
  }, [controller, settingsSession])

  useEffect(() => {
    const root = document.documentElement
    const observer = new MutationObserver(() => setLanguage(root.lang))
    observer.observe(root, { attributes: true, attributeFilter: ['lang'] })
    return () => observer.disconnect()
  }, [])

  async function checkHost() {
    setHostStatus(null)
    try {
      const response = await fetch(new URL(AUDIT_PATH, document.baseURI), { signal: AbortSignal.timeout(10_000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const result: AuditStatus = await response.json()
      setHostStatus({ version: result.engineVersion, persisted: result.persisted })
    } catch (error) {
      setHostStatus({ error: error instanceof Error ? error.message : '' })
    }
  }

  const hostMessage = hostStatus === null ? t('checkingHost') : hostStatus === undefined ? ''
    : 'error' in hostStatus ? [t('hostUnavailable'), hostStatus.error].filter(Boolean).join(' ')
      : [
          hostStatus.version ? t('hostVersion', { version: hostStatus.version }) : t('hostNoVersion'),
          t('probeSaved', { saved: t(hostStatus.persisted ? 'yes' : 'no') }),
          hostStatus.version && hostStatus.version !== SKIN_ENGINE_VERSION ? t('versionMismatch') : '',
          hostStatus.version === SKIN_ENGINE_VERSION ? '' : t('restart'),
        ].filter(Boolean).join(' ')

  return (
    <section ref={panel} data-dsh-skin-engine>
      <style>{auditedSurfaceStyles.settings + MANAGER_STYLES}</style>
      <header className="dsh-skin-header">
        <div>
          <div className="dsh-skin-title">
            <h2>{t('title')}</h2>
            <span className="dsh-skin-muted">{t('clientVersion', { version: SKIN_ENGINE_VERSION })}</span>
          </div>
          <p className="dsh-skin-muted" data-saved-skin={state.saved ? state.saved.skinId ?? '' : undefined}>
            <strong>{t('saved')}</strong> {state.saved ? name(state.saved.skinId) : t('unavailable')}
            {state.rendered !== state.saved?.skinId ? <> · <strong>{t('showing')}</strong> {name(state.rendered)}</> : null}
          </p>
        </div>
        <div className="dsh-skin-actions">
          {previewing ? (
            <button type="button" disabled={state.saving} onClick={() => void controller.cancelPreview()}>{t('cancelPreview')}</button>
          ) : null}
          <button type="button" disabled={state.saving || state.saved === null || (!state.saved.skinId && !previewing)}
            onClick={() => void controller.apply(null)}>{t('restoreDefault')}</button>
        </div>
      </header>
      {state.preview ? <p role="status"><strong>{t('previewing')} · {name(state.preview)}</strong> · {t('previewExpiry')}</p> : null}
      <p role="status">{state.notice ? settingsError(t, state.notice, 'error.selection') : state.saving ? t('saving') : state.pending ? t('loading')
        : versionNotice?.(t)}</p>
      {state.catalogueNotice ? <p role="alert">{settingsError(t, state.catalogueNotice, 'error.selection')}</p> : null}
      <div className="dsh-skin-tabs" role="tablist" aria-label={t('settingsPages')}>
        {pages.map((page, index) => <button key={page} type="button" role="tab" id={`${tabId}-tab-${page}`}
          aria-controls={`${tabId}-page-${page}`} aria-selected={activePage === page} tabIndex={activePage === page ? 0 : -1}
          onClick={() => setActivePage(page)} onKeyDown={event => moveTab(event, index)}>{t(page)}</button>)}
      </div>
      <div className="dsh-skin-layout" role="tabpanel" id={`${tabId}-page-gallery`} aria-labelledby={`${tabId}-tab-gallery`}
        hidden={activePage !== 'gallery'} data-detail={showDetails && Boolean(choice)}>
        <section className="dsh-skin-library" aria-label={t('gallery')}>
          <header className="dsh-skin-library-header">
            <h3>{t('gallery')}</h3>
            <ImportSkin t={t} controller={controller} disabled={state.saving} onInstalled={id => {
              clearFilters()
              settingsSession.select(id)
            }} />
          </header>
          <div className="dsh-skin-fields">
            <label>{t('search')}<input ref={searchInput} type="search" value={query} onChange={event => search(event.currentTarget.value)} /></label>
            <label>{t('tag')}
              <select value={tag} onChange={event => filterTag(event.currentTarget.value)}>
                <option value="">{t('allTags')}</option>
                {tags.map(value => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label>{t('source')}
              <select value={source} onChange={event => filterSource(event.currentTarget.value)}>
                <option value="">{t('allSkins')}</option>
                <option value="built-in">{t('builtin')}</option>
                <option value="local">{t('local')}</option>
              </select>
            </label>
          </div>
          <div className="dsh-skin-gallery-summary">
            {state.catalogue ? <span role="status">{visible.length ? t('galleryCount', { count: visible.length }) : t('noMatches')}</span> : null}
            <label><input type="checkbox" checked={compatibleOnly} onChange={event => filterCompatibility(event.currentTarget.checked)} />{t('compatibleOnly')}</label>
            {filtersActive ? <button type="button" onClick={clearFilters}>{t('clearFilters')}</button> : null}
          </div>
          {choice && !visible.includes(choice) ? <p>{t('editingOutsideFilter', { name: displayName(choice.manifest) })}</p> : null}
          <ul className="dsh-skin-gallery">
            {visible.map(item => {
              const { manifest } = item
              const status = item.compatibility ? 'incompatible'
                : state.preview === manifest.id ? 'previewing'
                  : state.saved?.skinId === manifest.id ? (state.rendered === manifest.id ? 'applied' : 'saved')
                    : item.managed ? 'installed' : item.source === 'local' ? 'local' : 'builtin'
              return (
                <li key={manifest.id}>
                  <button ref={choice === item ? card : undefined} type="button" data-skin-card={manifest.id}
                    aria-pressed={choice === item} aria-controls={detailId}
                    onClick={() => {
                      settingsSession.select(manifest.id)
                      if (!showDetails) focusTarget.current = 'detail'
                      setShowDetails(true)
                    }}>
                    <SkinPreviewImage path={item.previews[manifest.colorScheme === 'both' ? scheme : manifest.colorScheme ?? scheme]}
                      placeholder={placeholder} />
                    <span className="dsh-skin-card-caption">
                      <strong>{displayName(manifest)}</strong>
                      <small className="dsh-skin-badge" data-status={status}>{t(status)}</small>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
        {choice ? <div className="dsh-skin-inspector">
          <button ref={detailBack} type="button" className="dsh-skin-back" onClick={() => {
            focusTarget.current = 'gallery'
            setShowDetails(false)
          }}>{t('backToGallery')}</button>
          <SkinDetail key={`${choice.manifest.id}/${choice.revision}`} t={t} id={detailId} choice={choice} scheme={scheme} controller={controller}
          displayName={displayName(choice.manifest)}
          placeholder={placeholder} onOpenEffects={() => setActivePage('effectsPage')} onOpenManagement={() => setActivePage('managePage')}
          preferences={preferencesFor(state.saved?.preferences, choice.manifest.id)} revision={state.saved?.revision}
          draft={draft} onDraft={value => settingsSession.setDraft(choice.manifest.id, value)}
          readDraft={() => settingsSession.getDraft(choice.manifest.id)}
          applied={state.preview === null && state.rendered === choice.manifest.id && state.saved?.skinId === choice.manifest.id}
          busy={state.saving} onVersionNotice={message => setVersionNotice(() => message)} />
        </div> : null}
      </div>
      <div className="dsh-skin-utilities" role="tabpanel" id={`${tabId}-page-effectsPage`} aria-labelledby={`${tabId}-tab-effectsPage`}
        hidden={activePage !== 'effectsPage'}>
        <details open className="dsh-skin-disclosure">
          <summary>{t('windowEffects')}</summary>
          <div className="dsh-skin-fields">
            <label>{t('windowMode')}
              <select value={effectMode} onChange={event => effects.setMode(event.currentTarget.value as EffectMode)}>
                {windowModes.map(mode => <option key={mode} value={mode}>{t(`mode.${mode}`)}</option>)}
              </select>
            </label>
            <label>{t('windowQuality')}
              <select value={quality ?? ''} disabled={effectMode === 'economy' || effectMode === 'off'}
                onChange={event => effects.setQuality(event.currentTarget.value as QualityChoice || undefined)}>
                <option value="">{t('useSkinQuality')}</option>
                {qualityLevels.map(level => <option key={level} value={level}>{t(`quality.${level}`)}</option>)}
              </select>
            </label>
            {scenePreset ? (
              <label>{t('scenePreset')}
                <select value={scenePreset} onChange={event => effects.setScenePreset(event.currentTarget.value as ScenePreset)}>
                  {scenePresets.map(value => <option key={value} value={value}>{t(`scene.${value}`)}</option>)}
                </select>
              </label>
            ) : null}
          </div>
          {effectiveScenePreset ? <p className="dsh-skin-muted">{t('effectivePreset')} · {t(`scene.${effectiveScenePreset}`)}</p> : null}
          {state.rendered && effectMode !== 'off' ? (
            <p className="dsh-skin-muted">{t('effectiveQuality')} · <strong data-dsh-skin-effective-quality>{t(`quality.${effectiveQuality}`)}</strong>
              {refraction !== 'off' ? <> · {t('effect.glass.refraction')} · {refraction === 'webgl' ? 'WebGL' : t('cssFallback')}</> : null}
            </p>
          ) : null}
        </details>
      </div>
      <div className="dsh-skin-utilities" role="tabpanel" id={`${tabId}-page-managePage`} aria-labelledby={`${tabId}-tab-managePage`}
        hidden={activePage !== 'managePage'}>
        <details open className="dsh-skin-disclosure">
          <summary>{t('maintenance')}
            {state.catalogue?.issues.length ? <> ({state.catalogue.issues.length})</> : null}
          </summary>
          <div className="dsh-skin-actions">
            <button type="button" disabled={state.saving} onClick={() => void controller.refresh('force')}>{t('reload')}</button>
            <button type="button" disabled={hostStatus === null} onClick={() => void checkHost()}>{t('checkHost')}</button>
            <img src={PROBE_ASSET} alt="" width="28" height="28" />
          </div>
          <p role="status">{hostMessage}</p>
          {state.notice || state.catalogueNotice ? <details>
            <summary>{t('error.diagnostics')}</summary>
            {state.notice ? <p>{state.notice}</p> : null}
            {state.catalogueNotice ? <p>{state.catalogueNotice}</p> : null}
          </details> : null}
          {state.catalogue?.issues.length ? (
            <ul>{state.catalogue.issues.map(issue => (
              <li key={JSON.stringify(issue)}>{issue.id ?? (issue.directory || issue.source)} · {issue.code}</li>
            ))}</ul>
          ) : null}
        </details>
      </div>
    </section>
  )
}
