import { useEffect, useId, useState } from 'react'
import type { ColorScheme } from '../core/tokens.js'
import { editableColors, effectStrength, qualityLevels, resolveSkinColors, samePreferences, type EditableEffect, type QualityChoice,
  type SkinPreferences } from '../shared/preferences.js'
import { PackageActions } from './package-controls.js'
import { canActivate, type SkinChoice, type SkinData } from './skin-api.js'
import type { createSkinSwitch, PreferenceDraft } from './skin-switch.js'

const effectNames: Record<EditableEffect, string> = {
  'glass.liquid': 'Liquid Glass',
  'ambient.aurora': 'Aurora',
  'particles.dust': 'Floating Dust',
  'light.flow': 'Light Flow',
  'interaction.ripple': 'Click Ripple',
  'particles.starfield': 'Starfield',
  'glass.holographic': 'Holographic Glass',
  'glass.refraction': 'Liquid Refraction',
}
const colorNames = { canvas: 'Background', surface: 'Sidebar fill', accent: 'Particle accent' }

function pickerColor(color: string | undefined) {
  if (!color) return '#000000'
  if (color.length >= 7) return color.slice(0, 7)
  const [red, green, blue] = color.slice(1)
  return `#${red}${red}${green}${green}${blue}${blue}`
}

interface DetailProps {
  id: string
  choice: SkinChoice
  scheme: ColorScheme
  controller: ReturnType<typeof createSkinSwitch>
  preferences?: SkinPreferences
  revision?: number
  applied: boolean
  busy: boolean
  onVersionNotice(message: string): void
}

export function SkinDetail({ id, choice, scheme, controller, preferences, revision, applied, busy, onVersionNotice }: DetailProps) {
  const [result, setResult] = useState<{ data?: SkinData; error?: string }>()
  const [draft, setDraft] = useState<PreferenceDraft>()
  const statusId = useId()
  const { manifest, compatibility } = choice
  const colors = result?.data && resolveSkinColors(result.data.tokens, scheme)
  const blocked = compatibility?.message ?? (!canActivate(choice) ? 'Local activation requires a validated installation.' : undefined)
  const values = (draft ? draft.value : preferences) ?? {}
  const disabled = busy || revision === undefined || Boolean(blocked) || !result?.data
  const previewBlock = !blocked ? controller.getAppearanceBlock(choice) : undefined
  const applyBlock = !blocked ? controller.getAppearanceBlock(choice, 'apply') : undefined
  const activationStatus = applyBlock ?? (busy ? 'Saving…' : previewBlock
    ? `Apply switches DSH to ${manifest.colorScheme} appearance.` : applied && !draft ? 'Skin applied.' : '')
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
    <section id={id} className="dsh-skin-detail" aria-label={`${manifest.name} details`}>
      <header>
        <h3>{manifest.name}</h3>
        <p className="dsh-skin-muted">Skin package v{manifest.version} · {manifest.author ?? 'Unknown author'} · {manifest.colorScheme ?? 'Any'} appearance</p>
        {manifest.description ? <p>{manifest.description}</p> : null}
      </header>
      {blocked ? <p>{blocked}</p> : null}
      {result?.error ? <p role="alert">{result.error}</p> : null}
      {!blocked && !result ? <p role="status">Loading skin details…</p> : null}
      <div className="dsh-skin-actions">
        <button type="button" disabled={disabled || Boolean(previewBlock)} aria-describedby={statusId}
          onClick={() => void controller.preview(manifest.id, draft)}>Preview</button>
        <button type="button" className="dsh-skin-primary" disabled={disabled || Boolean(applyBlock)} aria-describedby={statusId}
          onClick={() => void apply()}>Apply</button>
      </div>
      <p id={statusId} role="status">{activationStatus}</p>
      {draft ? <p role="status">Unsaved preferences. Preview in this window or apply to save.</p> : null}
      {result?.data ? (
        <details open className="dsh-skin-disclosure">
          <summary>Customize skin</summary>
          <fieldset disabled={disabled}>
            <legend>Preferences</legend>
            <div className="dsh-skin-fields">
              {editableColors.filter(key => colors?.[key] !== undefined || values.colors?.[key] !== undefined).map(key => (
                <label key={key}>{colorNames[key]}
                  <input type="color" value={pickerColor(values.colors?.[key] ?? colors?.[key])}
                    onChange={event => edit({ ...values, colors: { ...values.colors, [key]: event.currentTarget.value } })} />
                </label>
              ))}
              <label>Skin effect quality
                <select value={values.quality ?? ''} onChange={event => edit({ ...values, quality: event.currentTarget.value as QualityChoice || undefined })}>
                  <option value="">Default (Balanced)</option>
                  {qualityLevels.map(level => <option key={level} value={level}>{level}</option>)}
                </select>
              </label>
            </div>
            <ul className="dsh-skin-effects">
              {result.data.effects.map(effect => {
                const strength = effectStrength(effect)
                if (strength === undefined) return <li key={effect.id}>{effect.id} · renderer pending</li>
                const id = effect.id as EditableEffect
                const override = values.effects?.[id]
                const name = effectNames[id]
                const enabled = override?.enabled ?? (id !== 'glass.refraction' && effect.enabled)
                const value = Math.round((override?.strength ?? strength) * 100)
                const magnitude = id === 'interaction.ripple' ? `Radius ${Math.round(80 + (override?.strength ?? strength) * 140)} px`
                  : `${id === 'glass.liquid' ? 'Blur' : id === 'particles.dust' ? 'Density'
                    : id === 'particles.starfield' ? 'Brightness' : id === 'glass.refraction' ? 'Distortion' : 'Intensity'} ${value}%`
                function update(change: { enabled?: boolean; strength?: number }) {
                  edit({ ...values, effects: { ...values.effects, [id]: { ...override, ...change } } })
                }
                return (
                  <li key={id}>
                    <label><input type="checkbox" checked={enabled} onChange={event => update({ enabled: event.currentTarget.checked })} />{name}</label>
                    <label>
                      {magnitude}
                      <input type="range" aria-label={`${name} strength`} min={0} max={100} step={1} value={value}
                        disabled={!enabled} onChange={event => update({ strength: event.currentTarget.valueAsNumber / 100 })} />
                    </label>
                    {id === 'glass.refraction' ? <small>Optional WebGL</small> : null}
                  </li>
                )
              })}
            </ul>
            {result.data.diagnostics.map(issue => <p key={issue.path}>{issue.message}</p>)}
          </fieldset>
          <div className="dsh-skin-actions">
            <button type="button" disabled={disabled || samePreferences(values)} onClick={() => edit(null)}>Reset preferences</button>
            {result.data.bundledPreferences ? (
              <button type="button" disabled={disabled} onClick={() => edit(result.data?.bundledPreferences ?? null)}>
                Use included preferences
              </button>
            ) : null}
            {draft ? (
              <button type="button" disabled={busy} onClick={() => {
                setDraft(undefined)
                if (controller.getSnapshot().preview === manifest.id) void controller.cancelPreview()
              }}>Discard changes</button>
            ) : null}
          </div>
        </details>
      ) : null}
      {canActivate(choice) ? <PackageActions choice={choice} controller={controller} disabled={busy} onVersionNotice={onVersionNotice} /> : null}
      <p className="dsh-skin-muted">Engine API {manifest.engineApi}{manifest.dshCompatibility ? ` · DSH ${manifest.dshCompatibility}` : ''}</p>
    </section>
  )
}
