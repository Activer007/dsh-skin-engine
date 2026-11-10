import { useEffect, useId, useState, useSyncExternalStore } from 'react'
import { auditedSurfaceStyles } from '../adapter/surface-map.js'
import { AUDIT_PATH, type AuditStatus } from '../shared/audit.js'
import { preferencesFor, qualityLevels, type QualityChoice } from '../shared/preferences.js'
import type { createEffectsRuntime, EffectMode } from './effects/p0.js'
import { ImportSkin } from './package-controls.js'
import { scenePresetLabels, type ScenePreset } from './scene/presets.js'
import { SkinDetail } from './skin-detail.js'
import type { createSkinSwitch } from './skin-switch.js'

declare const MANAGER_STYLES: string
declare const PROBE_ASSET: string
declare const SKIN_ENGINE_VERSION: string

const restartInstructions = 'Quit and reopen DSH Desktop, or restart the DSH Web Host and reload this page.'

export interface PanelProps {
  controller: ReturnType<typeof createSkinSwitch>
  effects: ReturnType<typeof createEffectsRuntime>
  getColorScheme(): 'light' | 'dark'
}

export function SkinPanel({ controller, effects, getColorScheme }: PanelProps) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const effectMode = useSyncExternalStore(effects.subscribe, effects.getMode)
  const scenePreset = useSyncExternalStore(effects.subscribe, effects.getScenePreset)
  const effectiveScenePreset = useSyncExternalStore(effects.subscribe, effects.getEffectiveScenePreset)
  const quality = useSyncExternalStore(effects.subscribe, effects.getQuality)
  const effectiveQuality = useSyncExternalStore(effects.subscribe, effects.getEffectiveQuality)
  const refraction = useSyncExternalStore(effects.subscribe, effects.getRefraction)
  const [choiceId, choose] = useState('')
  const [query, search] = useState('')
  const [tag, filterTag] = useState('')
  const [source, filterSource] = useState('')
  const [hostStatus, setHostStatus] = useState<string | null>('')
  const [versionNotice, setVersionNotice] = useState('')
  const detailId = useId()
  const choices = state.catalogue?.skins ?? []
  const tags = [...new Set(choices.flatMap(item => item.manifest.tags ?? []))].sort()
  const term = query.trim().toLowerCase()
  const visible = choices.filter(({ manifest, source: origin }) => {
    if (source && source !== origin) return false
    if (tag && !manifest.tags?.includes(tag)) return false
    return !term || [manifest.name, manifest.nameEn, manifest.author, manifest.id, ...(manifest.tags ?? [])]
      .some(value => value?.toLowerCase().includes(term))
  })
  const choice = visible.find(item => item.manifest.id === choiceId)
    ?? visible.find(item => item.manifest.id === state.saved?.skinId)
    ?? visible[0]
  const name = (id: string | null | undefined) => choices.find(item => item.manifest.id === id)?.manifest.name ?? id ?? 'Default'
  const scheme = getColorScheme()
  const previewing = state.preview !== null || state.pending === 'preview'

  useEffect(() => {
    void controller.refresh(true)
    return () => { void controller.cancelPreview() }
  }, [controller])

  async function checkHost() {
    setHostStatus(null)
    try {
      const response = await fetch(new URL(AUDIT_PATH, document.baseURI), { signal: AbortSignal.timeout(10_000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const result: AuditStatus = await response.json()
      const version = result.engineVersion
      const probe = `Saved probe ${result.persisted}.`
      if (typeof version !== 'string' || version.length === 0) {
        setHostStatus(`Host engine version unavailable. ${probe} ${restartInstructions}`)
      } else {
        const mismatch = version === SKIN_ENGINE_VERSION ? '' : ` Client and Host versions differ. ${restartInstructions}`
        setHostStatus(`Host engine v${version}. ${probe}${mismatch}`)
      }
    } catch (error) {
      const detail = error instanceof Error ? ` ${error.message}` : ''
      setHostStatus(`Host unavailable.${detail}`)
    }
  }

  return (
    <section data-dsh-skin-engine>
      <style>{auditedSurfaceStyles.settings + MANAGER_STYLES}</style>
      <header className="dsh-skin-header">
        <div>
          <div className="dsh-skin-title">
            <h2>Skin Engine</h2>
            <span className="dsh-skin-muted">Client engine v{SKIN_ENGINE_VERSION}</span>
          </div>
          <p className="dsh-skin-muted">
            <strong>Saved</strong> {state.saved ? name(state.saved.skinId) : 'Unavailable'}
            {state.saved && state.rendered !== state.saved.skinId ? <> · <strong>Showing</strong> {name(state.rendered)}</> : null}
          </p>
        </div>
        <div className="dsh-skin-actions">
          {previewing ? (
            <button type="button" disabled={state.saving} onClick={() => void controller.cancelPreview()}>Cancel preview</button>
          ) : null}
          <button type="button" disabled={state.saving || state.saved === null || (!state.saved.skinId && !previewing)}
            onClick={() => void controller.apply(null)}>Restore Default</button>
        </div>
      </header>
      <p role="status">{state.notice || (state.saving ? 'Saving…' : state.pending ? 'Loading…'
        : state.preview ? 'Window preview · expires after 30 seconds.' : versionNotice)}</p>
      {state.catalogueNotice ? <p role="alert">{state.catalogueNotice}</p> : null}
      <div className="dsh-skin-layout">
        <section className="dsh-skin-library" aria-label="Skin gallery">
          <header className="dsh-skin-library-header">
            <h3>Skin gallery</h3>
            <ImportSkin controller={controller} disabled={state.saving} onInstalled={id => {
              search('')
              filterTag('')
              filterSource('')
              choose(id)
            }} />
          </header>
          <div className="dsh-skin-fields">
            <label>Search skins<input type="search" value={query} onChange={event => search(event.currentTarget.value)} /></label>
            <label>Tag
              <select value={tag} onChange={event => filterTag(event.currentTarget.value)}>
                <option value="">All tags</option>
                {tags.map(value => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label>Source
              <select value={source} onChange={event => filterSource(event.currentTarget.value)}>
                <option value="">All skins</option>
                <option value="built-in">Built-in</option>
                <option value="local">Local</option>
              </select>
            </label>
          </div>
          {state.catalogue && visible.length === 0 ? <p>No matching skins.</p> : null}
          <ul className="dsh-skin-gallery">
            {visible.map(item => {
              const { manifest } = item
              const status = item.compatibility ? 'Incompatible'
                : state.preview === manifest.id ? 'Previewing'
                  : state.saved?.skinId === manifest.id ? (state.rendered === manifest.id ? 'Applied' : 'Saved')
                    : item.managed ? 'Installed' : item.source === 'local' ? 'Local' : 'Built-in'
              return (
                <li key={manifest.id}>
                  <button type="button" aria-pressed={choice === item} aria-controls={detailId} onClick={() => choose(manifest.id)}>
                    <img alt="" loading="lazy" decoding="async" width="320" height="180"
                      src={new URL(item.previews[manifest.colorScheme === 'both' ? scheme : manifest.colorScheme ?? scheme], document.baseURI).href}
                      onError={event => {
                        const fallback = state.catalogue?.placeholderUrl
                        if (!fallback) return
                        const url = new URL(fallback, document.baseURI).href
                        if (event.currentTarget.src !== url) event.currentTarget.src = url
                      }} />
                    <span className="dsh-skin-card-caption">
                      <strong>{manifest.name}</strong>
                      <small className="dsh-skin-badge" data-status={status}>{status}</small>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
        {choice ? <SkinDetail key={`${choice.manifest.id}/${choice.revision}`} id={detailId} choice={choice} scheme={scheme} controller={controller}
          preferences={preferencesFor(state.saved?.preferences, choice.manifest.id)} revision={state.saved?.revision}
          applied={state.preview === null && state.rendered === choice.manifest.id && state.saved?.skinId === choice.manifest.id}
          busy={state.saving} onVersionNotice={setVersionNotice} /> : null}
      </div>
      <div className="dsh-skin-utilities">
        <details open className="dsh-skin-disclosure">
          <summary>Window effects</summary>
          <div className="dsh-skin-fields">
            <label>Effects in this window
              <select value={effectMode} onChange={event => effects.setMode(event.currentTarget.value as EffectMode)}>
                <option value="dynamic">Dynamic</option>
                <option value="static">Static</option>
                <option value="economy">Economy</option>
                <option value="off">Off</option>
              </select>
            </label>
            <label>Effect quality in this window
              <select value={quality ?? ''} disabled={effectMode === 'economy' || effectMode === 'off'}
                onChange={event => effects.setQuality(event.currentTarget.value as QualityChoice || undefined)}>
                <option value="">Use skin preference</option>
                {qualityLevels.map(level => <option key={level} value={level}>{level}</option>)}
              </select>
            </label>
            {scenePreset ? (
              <label>Scene motion preset
                <select value={scenePreset} onChange={event => effects.setScenePreset(event.currentTarget.value as ScenePreset)}>
                  {Object.entries(scenePresetLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            ) : null}
          </div>
          {effectiveScenePreset ? <p className="dsh-skin-muted">Effective scene preset · {scenePresetLabels[effectiveScenePreset]}</p> : null}
          {state.rendered && effectMode !== 'off' ? (
            <p className="dsh-skin-muted">Effective quality · <strong data-dsh-skin-effective-quality>{effectiveQuality}</strong>
              {refraction !== 'off' ? <> · Liquid Refraction · {refraction === 'webgl' ? 'WebGL' : 'CSS fallback'}</> : null}
            </p>
          ) : null}
        </details>
        <details open className="dsh-skin-disclosure">
          <summary>Maintenance and diagnostics
            {state.catalogue?.issues.length ? <> ({state.catalogue.issues.length})</> : null}
          </summary>
          <div className="dsh-skin-actions">
            <button type="button" disabled={state.saving} onClick={() => void controller.refresh('force')}>Reload skins</button>
            <button type="button" disabled={hostStatus === null} onClick={() => void checkHost()}>Check Host</button>
            <img src={PROBE_ASSET} alt="" width="28" height="28" />
          </div>
          <p role="status">{hostStatus ?? 'Checking Host…'}</p>
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
