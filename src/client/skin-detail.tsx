import { useEffect, useId, useState } from 'react'
import type { ColorScheme } from '../core/tokens.js'
import { MINIMUM_DSH_VERSION } from '../shared/compatibility.js'
import { editableColors, effectStrength, qualityLevels, resolveSkinColors, samePreferences, type EditableEffect, type QualityChoice,
  type SkinPreferences } from '../shared/preferences.js'
import { PackageActions } from './package-controls.js'
import { settingsError, type TranslateSettings } from './settings-copy.js'
import { canActivate, type SkinChoice, type SkinData } from './skin-api.js'
import type { createSkinSwitch, PreferenceDraft } from './skin-switch.js'

function pickerColor(color: string | undefined) {
  if (!color) return '#000000'
  if (color.length >= 7) return color.slice(0, 7)
  const [red, green, blue] = color.slice(1)
  return `#${red}${red}${green}${green}${blue}${blue}`
}

interface DetailProps {
  t: TranslateSettings
  id: string
  choice: SkinChoice
  scheme: ColorScheme
  controller: ReturnType<typeof createSkinSwitch>
  preferences?: SkinPreferences
  revision?: number
  applied: boolean
  busy: boolean
  onVersionNotice(message: ((t: TranslateSettings) => string) | undefined): void
}

export function SkinDetail({ t, id, choice, scheme, controller, preferences, revision, applied, busy, onVersionNotice }: DetailProps) {
  const [result, setResult] = useState<{ data?: SkinData; error?: string }>()
  const [draft, setDraft] = useState<PreferenceDraft>()
  const statusId = useId()
  const { manifest, compatibility } = choice
  const colors = result?.data && resolveSkinColors(result.data.tokens, scheme)
  const blocked = Boolean(compatibility) || !canActivate(choice)
  const values = (draft ? draft.value : preferences) ?? {}
  const disabled = busy || revision === undefined || Boolean(blocked) || !result?.data
  const previewBlock = !blocked ? controller.getAppearanceBlock(choice) : undefined
  const applyBlock = !blocked ? controller.getAppearanceBlock(choice, 'apply') : undefined
  const appearance = t(`appearance.${manifest.colorScheme ?? 'any'}`)
  const activationStatus = applyBlock ? settingsError(t, applyBlock, 'error.generic') : busy ? t('saving') : previewBlock
    ? t('appearanceSwitch', { scheme: appearance }) : applied && !draft ? t('skinApplied') : ''
  useEffect(() => {
    if (blocked) return
    const request = new AbortController()
    void controller.loadDetails(choice, request.signal).then(data => {
      if (!request.signal.aborted) setResult({ data })
    }, (error: unknown) => {
      if (!request.signal.aborted) setResult({ error: error instanceof Error ? error.message : 'Could not read the skin.' })
    })
    return () => request.abort()
  }, [choice, blocked, controller])

  function edit(value: SkinPreferences | null) {
    if (revision !== undefined) setDraft(previous => ({ value, revision: previous?.revision ?? revision }))
  }

  async function apply() {
    if (await controller.apply(manifest.id, draft)) setDraft(undefined)
  }

  return (
    <section id={id} className="dsh-skin-detail" aria-label={t('details', { name: manifest.name })}>
      <header>
        <h3>{manifest.name}</h3>
        <p className="dsh-skin-muted">{t('skinVersion', { version: manifest.version })} · {manifest.author ?? t('unknownAuthor')} · {t('appearance', { scheme: appearance })}</p>
        {manifest.description ? <p>{manifest.description}</p> : null}
      </header>
      {blocked ? <p>{compatibility?.code === 'unsupported-host'
        ? t('error.unsupportedHost', { version: MINIMUM_DSH_VERSION })
        : t(compatibility ? 'error.compatibility' : 'validatedRequired')}</p> : null}
      {compatibility ? <details>
        <summary>{t('error.diagnostics')}</summary>
        <p>{compatibility.code ? `${compatibility.code} · ` : ''}{compatibility.message}</p>
      </details> : null}
      {result?.error ? <p role="alert">{settingsError(t, result.error, 'readSkinFailed')}</p> : null}
      {!blocked && !result ? <p role="status">{t('loadingDetails')}</p> : null}
      <div className="dsh-skin-actions">
        <button type="button" disabled={disabled || Boolean(previewBlock)} aria-describedby={statusId}
          onClick={() => void controller.preview(manifest.id, draft)}>{t('preview')}</button>
        <button type="button" className="dsh-skin-primary" disabled={disabled || Boolean(applyBlock)} aria-describedby={statusId}
          onClick={() => void apply()}>{t('apply')}</button>
      </div>
      <p id={statusId} role="status">{activationStatus}</p>
      {draft ? <p role="status">{t('unsaved')}</p> : null}
      {result?.data ? (
        <details open className="dsh-skin-disclosure">
          <summary>{t('customize')}</summary>
          <fieldset disabled={disabled}>
            <legend>{t('preferences')}</legend>
            <div className="dsh-skin-fields">
              {editableColors.filter(key => colors?.[key] !== undefined || values.colors?.[key] !== undefined).map(key => (
                <label key={key}>{t(`color.${key}`)}
                  <input type="color" value={pickerColor(values.colors?.[key] ?? colors?.[key])}
                    onChange={event => edit({ ...values, colors: { ...values.colors, [key]: event.currentTarget.value } })} />
                </label>
              ))}
              <label>{t('skinQuality')}
                <select value={values.quality ?? ''} onChange={event => edit({ ...values, quality: event.currentTarget.value as QualityChoice || undefined })}>
                  <option value="">{t('defaultQuality')}</option>
                  {qualityLevels.map(level => <option key={level} value={level}>{t(`quality.${level}`)}</option>)}
                </select>
              </label>
            </div>
            <ul className="dsh-skin-effects">
              {result.data.effects.map(effect => {
                const strength = effectStrength(effect)
                if (strength === undefined) return <li key={effect.id}>{effect.id} · {t('rendererPending')}</li>
                const id = effect.id as EditableEffect
                const override = values.effects?.[id]
                const name = t(`effect.${id}`)
                const enabled = override?.enabled ?? (id !== 'glass.refraction' && effect.enabled)
                const value = Math.round((override?.strength ?? strength) * 100)
                const magnitude = id === 'interaction.ripple' ? `${t('radius')} ${Math.round(80 + (override?.strength ?? strength) * 140)} px`
                  : `${t(id === 'glass.liquid' ? 'blur' : id === 'particles.dust' ? 'density'
                    : id === 'particles.starfield' ? 'brightness' : id === 'glass.refraction' ? 'distortion' : 'intensity')} ${value}%`
                function update(change: { enabled?: boolean; strength?: number }) {
                  edit({ ...values, effects: { ...values.effects, [id]: { ...override, ...change } } })
                }
                return (
                  <li key={id}>
                    <label><input type="checkbox" checked={enabled} onChange={event => update({ enabled: event.currentTarget.checked })} />{name}</label>
                    <label>
                      {magnitude}
                      <input type="range" aria-label={t('strength', { name })} aria-valuetext={magnitude} min={0} max={100} step={1} value={value}
                        disabled={!enabled} onChange={event => update({ strength: event.currentTarget.valueAsNumber / 100 })} />
                    </label>
                    {id === 'glass.refraction' ? <small>{t('optionalWebgl')}</small> : null}
                  </li>
                )
              })}
            </ul>
            {result.data.diagnostics.length ? <details>
              <summary>{t('error.diagnostics')}</summary>
              {result.data.diagnostics.map(issue => <p key={issue.path}>{issue.code} · {issue.message}</p>)}
            </details> : null}
          </fieldset>
          <div className="dsh-skin-actions">
            <button type="button" disabled={disabled || samePreferences(values)} onClick={() => edit(null)}>{t('resetPreferences')}</button>
            {result.data.bundledPreferences ? (
              <button type="button" disabled={disabled} onClick={() => edit(result.data?.bundledPreferences ?? null)}>
                {t('useIncluded')}
              </button>
            ) : null}
            {draft ? (
              <button type="button" disabled={busy} onClick={() => {
                setDraft(undefined)
                if (controller.getSnapshot().preview === manifest.id) void controller.cancelPreview()
              }}>{t('discard')}</button>
            ) : null}
          </div>
        </details>
      ) : null}
      {canActivate(choice) ? <PackageActions t={t} choice={choice} controller={controller} disabled={busy} onVersionNotice={onVersionNotice} /> : null}
      <p className="dsh-skin-muted">{t('engineApi')} {manifest.engineApi}{manifest.dshCompatibility ? ` · DSH ${manifest.dshCompatibility}` : ''}</p>
    </section>
  )
}
