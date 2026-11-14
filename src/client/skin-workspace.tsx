import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { ImportSkin, PackageActions, PackageOperationStatus } from './package-controls.js'
import { usePackageOperations, type PackageOperationsStore } from './package-operations.js'
import { SkinEffects } from './skin-effects.js'
import { useSkinEditor } from './skin-editor.js'
import { fallbackSettingsCopy, settingsError, type TranslateSettings } from './settings-copy.js'
import { SettingsButton, SettingsTabs } from './settings-controls.js'
import type { createAppearanceSession } from './appearance-session.js'
import type { ChatPreview } from './chat-preview.js'
import { SkinDetail } from './skin-detail.js'
import { SkinPreviewImage } from './skin-preview-image.js'
import type { createSkinSwitch } from './skin-switch.js'

declare const MANAGER_STYLES: string
declare const SKIN_ENGINE_VERSION: string

const pages = ['gallery', 'effectsPage', 'managePage'] as const
type Page = (typeof pages)[number]

export interface WorkspaceProps {
  controller: ReturnType<typeof createSkinSwitch>
  getColorScheme(): 'light' | 'dark'
  settingsSession: ReturnType<typeof createAppearanceSession>
  packageOperations: PackageOperationsStore
  backToChat?(): void
  chatPreview?: ChatPreview['start']
  t?: TranslateSettings
}

export function SkinWorkspace({ controller, getColorScheme, settingsSession, packageOperations, backToChat, chatPreview, t: translate }: WorkspaceProps) {
  const [language, setLanguage] = useState(() => document.documentElement.lang)
  const t = translate ?? fallbackSettingsCopy(language)
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  useSyncExternalStore(settingsSession.subscribe, settingsSession.getSnapshot)
  const { activePage, showDetails, query, tag, source, compatibleOnly, managedId } = settingsSession.view
  const setActivePage = (activePage: Page) => settingsSession.setView({ activePage })
  const setShowDetails = (showDetails: boolean) => settingsSession.setView({ showDetails })
  const search = (query: string) => settingsSession.setView({ query })
  const filterTag = (tag: string) => settingsSession.setView({ tag })
  const filterSource = (source: string) => settingsSession.setView({ source })
  const filterCompatibility = (compatibleOnly: boolean) => settingsSession.setView({ compatibleOnly })
  const setManagedId = (managedId: string) => settingsSession.setView({ managedId })
  const detailBack = useRef<HTMLButtonElement>(null)
  const card = useRef<HTMLButtonElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const focusTarget = useRef<'detail' | 'gallery' | undefined>(undefined)
  const tabId = useId()
  const operations = usePackageOperations(packageOperations)
  const operationActive = Boolean(operations.action)
  const busy = state.saving || operationActive
  const detailId = useId()
  const loadingGallery = state.catalogue === null && !state.catalogueNotice
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
  const effectsChoice = choices.find(item => item.manifest.id === settingsSession.editingEffects)
    ?? choices.find(item => item.manifest.id === state.saved?.skinId)
    ?? choices[0]
  const managedChoice = choices.find(item => item.manifest.id === managedId) ?? choice
  const editorState = operationActive ? { ...state, saving: true } : state
  const galleryEditor = useSkinEditor(choice, controller, settingsSession, editorState, chatPreview)
  const alternateEditor = useSkinEditor(activePage === 'effectsPage' && effectsChoice !== choice ? effectsChoice : undefined,
    controller, settingsSession, editorState, chatPreview)
  const effectsEditor = effectsChoice === choice ? galleryEditor : alternateEditor

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

  useEffect(() => {
    if (activePage === 'effectsPage' && effectsChoice && !settingsSession.editingEffects) {
      settingsSession.editEffects(effectsChoice.manifest.id)
    }
  }, [activePage, effectsChoice, settingsSession])

  function makeTab(page: Page) {
    return { value: page, label: t(page), id: `${tabId}-tab-${page}`, panelId: `${tabId}-page-${page}` }
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
    const current = controller.getSnapshot()
    if (current.preview === null && current.pending === null) void controller.refresh(true)
  }, [controller])

  useEffect(() => {
    const root = document.documentElement
    const observer = new MutationObserver(() => setLanguage(root.lang))
    observer.observe(root, { attributes: true, attributeFilter: ['lang'] })
    return () => observer.disconnect()
  }, [])

  function openManagement(id?: string) {
    if (id) setManagedId(id)
    setActivePage('managePage')
    document.getElementById(`${tabId}-tab-managePage`)?.focus()
  }

  return (
    <section data-dsh-skin-workspace=""
      style={{ maxWidth: 1120, margin: '0 auto', padding: 'clamp(16px, 3vw, 32px)' }}>
      <style>{MANAGER_STYLES}</style>
      <header className="dsh-skin-header">
        <div>
          <div className="dsh-skin-title">
            <h2>{t('appearanceCenter')}</h2>
            <span className="dsh-skin-muted">{t('clientVersion', { version: SKIN_ENGINE_VERSION })}</span>
          </div>
          <p className="dsh-skin-muted" data-saved-skin={state.saved ? state.saved.skinId ?? '' : undefined}>
            <strong>{t('saved')}</strong> {state.saved ? name(state.saved.skinId) : t('unavailable')}
            {state.rendered !== state.saved?.skinId ? <> · <strong>{t('showing')}</strong> {name(state.rendered)}</> : null}
          </p>
        </div>
        <div className="dsh-skin-actions">
          {backToChat ? <SettingsButton onClick={backToChat}>{t('backToChat')}</SettingsButton> : null}
          {previewing ? (
            <SettingsButton disabled={busy} onClick={() => void controller.cancelPreview()}>{t('cancelPreview')}</SettingsButton>
          ) : null}
          <SettingsButton disabled={busy || state.saved === null || (!state.saved.skinId && !previewing)}
            onClick={() => void controller.apply(null)}>{t('restoreDefault')}</SettingsButton>
        </div>
      </header>
      <p role="note">{t('chatPreviewHelp')}</p>
      {state.preview ? <p role="status"><strong>{t('previewing')} · {name(state.preview)}</strong> · {t('previewExpiry')}</p> : null}
      <p role="status">{state.notice ? settingsError(t, state.notice, 'error.selection') : state.saving ? t('saving') : state.pending ? t('loading') : ''}</p>
      <PackageOperationStatus t={t} operations={operations} name={displayName} />
      {state.catalogueNotice ? <p role="alert">{settingsError(t, state.catalogueNotice, 'error.selection')}</p> : null}
      <SettingsTabs<Page> items={[makeTab(pages[0]), makeTab(pages[1]), makeTab(pages[2])]} value={activePage}
        label={t('settingsPages')} onChange={setActivePage} />
      <div className="dsh-skin-layout" role="tabpanel" id={`${tabId}-page-gallery`} aria-labelledby={`${tabId}-tab-gallery`}
        hidden={activePage !== 'gallery'} data-detail={showDetails && Boolean(choice)}>
        <section className="dsh-skin-library" aria-label={t('gallery')}>
          <header className="dsh-skin-library-header">
            <h3>{t('gallery')}</h3>
            <button type="button" disabled={loadingGallery} onClick={() => openManagement()}>{t('package.import')}</button>
          </header>
          <fieldset className="dsh-skin-fields dsh-skin-filters" disabled={loadingGallery}>
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
          </fieldset>
          <div className="dsh-skin-gallery-summary">
            {state.catalogue ? <span role="status">{visible.length ? t('galleryCount', { count: visible.length }) : t('noMatches')}</span> : null}
            <label><input type="checkbox" disabled={loadingGallery} checked={compatibleOnly} onChange={event => filterCompatibility(event.currentTarget.checked)} />{t('compatibleOnly')}</label>
            {filtersActive ? <button type="button" onClick={clearFilters}>{t('clearFilters')}</button> : null}
          </div>
          {choice && !visible.includes(choice) ? <p>{t('editingOutsideFilter', { name: displayName(choice.manifest) })}</p> : null}
          {loadingGallery ? <p role="status">{t('loadingGallery')}</p> : null}
          <ul className="dsh-skin-gallery" aria-busy={loadingGallery}>
            {loadingGallery ? [0, 1, 2].map(index => <li key={index} className="dsh-skin-gallery-skeleton" aria-hidden="true" />) : null}
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
          <SkinDetail key={`${choice.manifest.id}/${choice.revision}`} t={t} id={detailId} choice={choice} scheme={scheme}
            displayName={displayName(choice.manifest)}
            placeholder={placeholder} onOpenEffects={() => {
              settingsSession.editEffects(choice.manifest.id)
              setActivePage('effectsPage')
              document.getElementById(`${tabId}-tab-effectsPage`)?.focus()
            }} onOpenManagement={() => openManagement(choice.manifest.id)}
            editor={galleryEditor} />
        </div> : null}
      </div>
      <div className="dsh-skin-utilities" role="tabpanel" id={`${tabId}-page-effectsPage`} aria-labelledby={`${tabId}-tab-effectsPage`}
        hidden={activePage !== 'effectsPage'}>
        {effectsChoice ? <>
          <label className="dsh-skin-effects-choice">{t('selectEditingSkin')}
            <select value={effectsChoice.manifest.id} onChange={event => settingsSession.editEffects(event.currentTarget.value)}>
              {choices.map(item => <option key={item.manifest.id} value={item.manifest.id}>{displayName(item.manifest)}</option>)}
            </select>
          </label>
          <SkinEffects t={t} choice={effectsChoice} editor={effectsEditor} displayName={displayName(effectsChoice.manifest)} />
        </> : null}
      </div>
      <div className="dsh-skin-utilities" role="tabpanel" id={`${tabId}-page-managePage`} aria-labelledby={`${tabId}-tab-managePage`}
        hidden={activePage !== 'managePage'}>
        <section className="dsh-skin-detail" aria-label={t('package.list')}>
          <header className="dsh-skin-library-header">
            <h3>{t('package.list')}</h3>
            <ImportSkin t={t} operations={operations} disabled={busy || loadingGallery} onInstalled={id => {
              settingsSession.select(id)
              settingsSession.setView({ managedId: id, query: '', tag: '', source: '', compatibleOnly: false })
            }} />
          </header>
          <ul className="dsh-skin-packages">
            {choices.map(item => {
              const id = item.manifest.id
              return <li key={id}>
                <button type="button" data-package-id={id} aria-pressed={managedChoice === item} disabled={operationActive}
                  onClick={() => setManagedId(id)}>
                  <strong>{displayName(item.manifest)}</strong>
                  <small>{t('skinVersion', { version: item.manifest.version })} · {t(item.source === 'built-in' ? 'builtin' : 'local')}</small>
                  <small>{t(item.compatibility ? 'incompatible' : item.managed || item.source === 'built-in' ? 'package.compatible' : 'validatedRequired')}
                    {state.preview === id ? ' · ' + t('previewing') : state.saved?.skinId === id ? ' · ' + t('saved') : ''}
                    {state.rendered === id && state.preview !== id ? ' · ' + t('showing') : ''}
                  </small>
                </button>
              </li>
            })}
          </ul>
        </section>
        {managedChoice ? <PackageActions key={managedChoice.manifest.id} t={t} choice={managedChoice}
          displayName={displayName(managedChoice.manifest)} operations={operations} disabled={busy} /> : null}
        <details className="dsh-skin-disclosure">
          <summary>{t('catalogueMaintenance')}
            {state.catalogue?.issues.length ? <> ({state.catalogue.issues.length})</> : null}
          </summary>
          <div className="dsh-skin-actions">
            <button type="button" disabled={busy} onClick={() => void controller.refresh('force')}>{t('reload')}</button>
          </div>
          {state.catalogueNotice ? <p>{settingsError(t, state.catalogueNotice, 'error.selection')}</p> : null}
          {state.catalogue?.issues.length ? (
            <ul>{state.catalogue.issues.map(issue => (
              <li key={JSON.stringify(issue)}>{issue.id ?? t(issue.source === 'built-in' ? 'builtin' : 'local')} · {issue.code}</li>
            ))}</ul>
          ) : null}
        </details>
      </div>
    </section>
  )
}
