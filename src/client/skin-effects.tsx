import { useSyncExternalStore } from 'react'
import { MINIMUM_DSH_VERSION } from '../shared/compatibility.js'
import { describeEffect } from '../core/effect-descriptors.js'
import { effectStrength, qualityLevels, type EditableEffect, type QualityChoice, type EffectPreference } from '../shared/preferences.js'
import type { createEffectsRuntime, EffectMode } from './effects/p0.js'
import type { ScenePreset } from './scene/presets.js'
import type { TranslateSettings } from './settings-copy.js'
import { SettingsSwitch } from './settings-controls.js'
import type { SkinChoice } from './skin-api.js'
import { SkinEditorActions, type SkinEditor } from './skin-editor.js'

const scenePresets = ['static', 'light', 'dynamic'] as const
const windowModes = ['dynamic', 'static', 'economy', 'off'] as const
const effectGroups = {
  'group.environment': ['scene.brightness', 'ambient.aurora', 'particles.dust', 'particles.bubbles', 'particles.starfield', 'light.flow', 'ambient.light'],
  'group.materials': ['glass.liquid', 'glass.holographic', 'glass.refraction'],
  'group.interaction': ['interaction.ripple'],
} as const satisfies Record<string, readonly EditableEffect[]>
const motionQuery = '(prefers-reduced-motion: reduce)'

function subscribeMotion(listener: () => void) {
  const media = window.matchMedia(motionQuery)
  media.addEventListener('change', listener)
  return () => media.removeEventListener('change', listener)
}

export function WindowEffects({ t, runtime, showing }: {
  t: TranslateSettings
  runtime: ReturnType<typeof createEffectsRuntime>
  showing?: string
}) {
  const mode = useSyncExternalStore(runtime.subscribe, runtime.getMode)
  const sidebarEffects = useSyncExternalStore(runtime.subscribe, runtime.getSidebarEffects)
  const sidebarPersistent = useSyncExternalStore(runtime.subscribe, runtime.getSidebarEffectsPersistent)
  const scenePreset = useSyncExternalStore(runtime.subscribe, runtime.getScenePreset)
  const effectiveScene = useSyncExternalStore(runtime.subscribe, runtime.getEffectiveScenePreset)
  const quality = useSyncExternalStore(runtime.subscribe, runtime.getQuality)
  const effectiveQuality = useSyncExternalStore(runtime.subscribe, runtime.getEffectiveQuality)
  const refraction = useSyncExternalStore(runtime.subscribe, runtime.getRefraction)
  const reducedMotion = useSyncExternalStore(subscribeMotion, () => window.matchMedia(motionQuery).matches)
  const off = mode === 'off'
  const economy = mode === 'economy'
  return <section className="dsh-skin-detail" aria-label={t('windowEffects')}>
    <header>
      <h3>{t('windowEffects')}</h3>
      <p className="dsh-skin-muted">{t('windowEffectsScope')}</p>
    </header>
    <div className="dsh-skin-fields">
      <label>{t('windowMode')}
        <select value={mode} onChange={event => runtime.setMode(event.currentTarget.value as EffectMode)}>
          {windowModes.map(value => <option key={value} value={value}>{t(`mode.${value}`)}</option>)}
        </select>
      </label>
      <label>{t('windowQuality')}
        <select value={quality ?? ''} disabled={economy || off}
          onChange={event => runtime.setQuality(event.currentTarget.value as QualityChoice || undefined)}>
          <option value="">{t('useSkinQuality')}</option>
          {qualityLevels.map(level => <option key={level} value={level}>{t(`quality.${level}`)}</option>)}
        </select>
      </label>
      {scenePreset ? <label>{t('scenePreset')}
        <select value={scenePreset} disabled={off} onChange={event => runtime.setScenePreset(event.currentTarget.value as ScenePreset)}>
          {scenePresets.map(value => <option key={value} value={value}>{t(`scene.${value}`)}</option>)}
        </select>
      </label> : null}
    </div>
    <SettingsSwitch checked={sidebarEffects} label={t('sidebarEffects')} onChange={runtime.setSidebarEffects} />
    <p className="dsh-skin-muted">{t('sidebarEffectsHelp')}</p>
    {sidebarEffects && !sidebarPersistent ? <p className="dsh-skin-muted">{t('sidebarEffectsMemoryOnly')}</p> : null}
    {off ? <p>{t('windowEffectsOff')}</p> : null}
    {!off && !showing ? <p>{t('noActiveSkinEffects')}</p> : null}
    {!off && showing ? <>
      <p>{t('showing')} · {showing}</p>
      {effectiveScene ? <p>{t('effectivePreset')} · {t(`scene.${effectiveScene}`)}</p> : null}
      <p>{t('effectiveQuality')} · <strong data-dsh-skin-effective-quality>{t(`quality.${effectiveQuality}`)}</strong>
        {refraction !== 'off' ? <> · {t('effect.glass.refraction')} · {refraction === 'webgl' ? 'WebGL' : t('cssFallback')}</> : null}
      </p>
      {reducedMotion ? <p className="dsh-skin-muted">{t('reducedMotionReason')}</p> : null}
      {economy ? <p className="dsh-skin-muted">{t('economyReason')}</p> : null}
      {mode === 'static' ? <p className="dsh-skin-muted">{t('staticReason')}</p> : null}
    </> : null}
  </section>
}

export function SkinEffects({ t, choice, editor, displayName }: {
  t: TranslateSettings
  choice: SkinChoice
  editor: SkinEditor
  displayName: string
}) {
  const { result, values, disabled, packageChanged, blocked, edit } = editor
  const appearance = t(`appearance.${choice.manifest.colorScheme ?? 'any'}`)
  const effects = result?.data?.effects
  return <section className="dsh-skin-detail" data-skin-effects={choice.manifest.id} aria-label={t('skinEffects')}>
    <header>
      <h3>{t('skinEffects')}</h3>
      <p>{t('editingSkin', { name: displayName })}</p>
      <p className="dsh-skin-muted">{t('skinEffectsScope')}</p>
    </header>
    <div className="dsh-skin-primary-actions"><SkinEditorActions t={t} editor={editor} appearance={appearance} canDiscard /></div>
    {blocked ? <p>{choice.compatibility?.code === 'unsupported-host'
      ? t('error.unsupportedHost', { version: MINIMUM_DSH_VERSION })
      : t(choice.compatibility ? 'error.compatibility' : 'validatedRequired')}</p> : null}
    {effects ? <>
      <fieldset disabled={disabled || packageChanged} className="dsh-skin-effect-fields">
        <div className="dsh-skin-fields">
          <label>{t('skinQuality')}
            <select value={values.quality ?? ''} onChange={event => edit({ ...values, quality: event.currentTarget.value as QualityChoice || undefined })}>
              <option value="">{t('defaultQuality')}</option>
              {qualityLevels.map(level => <option key={level} value={level}>{t(`quality.${level}`)}</option>)}
            </select>
          </label>
        </div>
        {effects.length === 0 ? <p>{t('noDeclaredEffects')}</p> : null}
        {(Object.keys(effectGroups) as (keyof typeof effectGroups)[]).map(group => {
          const ids: readonly EditableEffect[] = effectGroups[group]
          const declared = effects.filter(effect => {
            const descriptor = describeEffect(effect.id)
            return descriptor ? descriptor.group === group : (ids as readonly string[]).includes(effect.id)
          })
          if (!declared.length) return null
          return <fieldset key={group}>
            <legend>{t(group)}</legend>
            <ul className="dsh-skin-effects">
              {declared.map(effect => {
                const strength = effectStrength(effect)
                if (strength === undefined) return <li key={effect.id}>{effect.id} · {t('rendererPending')}</li>
                const id = effect.id as EditableEffect
                const override = values.effects?.[id]
                const artworkLight = effect.id === 'ambient.light' && effect.params.illuminateArtwork
                const multiplier = effect.id === 'particles.dust' || effect.id === 'particles.bubbles'
                  ? effect.params.densityMultiplier ?? 1 : artworkLight ? 2 : 1
                const minimum = id === 'scene.brightness' ? 50 : 0
                const span = 100 * multiplier
                const maximum = minimum + span
                const fixedStars = effect.id === 'particles.starfield' && effect.params.parallax === 0
                const name = artworkLight ? t('effect.artworkLight') : fixedStars ? t('effect.fixedStars') : t(`effect.${id}`)
                const enabled = override?.enabled ?? (id !== 'glass.refraction' && effect.enabled)
                const value = minimum + Math.round((override?.strength ?? strength) * span)
                const measure = describeEffect(id)?.strength.measure ?? (id === 'particles.dust' || id === 'particles.bubbles' ? 'density'
                  : id === 'particles.starfield' || artworkLight || id === 'scene.brightness' ? 'brightness'
                  : id === 'glass.refraction' ? 'distortion' : 'intensity')
                const magnitude = t(measure) + ' ' + value + '%'
                function update(change: EffectPreference) {
                  edit({ ...values, effects: { ...values.effects, [id]: { ...override, ...change } } })
                }
                return <li key={id}>
                  <SettingsSwitch checked={enabled} label={name} onChange={enabled => update({ enabled })} />
                  <label>
                    {magnitude}
                    <input type="range" aria-label={t('strength', { name })} aria-valuetext={magnitude} min={minimum} max={maximum} step={1} value={value}
                      disabled={!enabled} onChange={event => update({ strength: (event.currentTarget.valueAsNumber - minimum) / span })} />
                  </label>
                  {effect.id === 'ambient.aurora' && effect.params.movement !== undefined
                    ? (['movement', 'speed'] as const).map(option => {
                      const label = t(`aurora.${option}`)
                      const percent = Math.round(100 * (override?.[option] ?? effect.params[option] ?? 0))
                      return <label key={option}>
                        {label} {percent}%
                        <input type="range" aria-label={label} aria-valuetext={percent + '%'} min={option === 'speed' ? 10 : 0} max={100}
                          step={1} value={percent} disabled={!enabled}
                          onChange={event => update({ [option]: event.currentTarget.valueAsNumber / 100 })} />
                      </label>
                    }) : null}
                  {id === 'glass.refraction' ? <small>{t('optionalWebgl')}</small> : null}
                </li>
              })}
            </ul>
          </fieldset>
        })}
      </fieldset>
      {result?.data?.diagnostics.length ? <details>
        <summary>{t('error.diagnostics')}</summary>
        {result.data.diagnostics.map(issue => <p key={issue.path}>{issue.code} · {issue.message}</p>)}
      </details> : null}
    </> : null}
  </section>
}
