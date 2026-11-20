import { useSyncExternalStore } from 'react'
import { describeEffect, effectGroups } from '../core/effect-descriptors.js'
import { qualityLevels, type QualityChoice } from '../shared/preferences.js'
import type { createEffectsRuntime, EffectMode, WindowExperience } from './effects/p0.js'
import type { ScenePreset } from './scene/presets.js'
import { compatibilityMessage, type TranslateSettings } from './settings-copy.js'
import { SkinEffectControls } from './skin-effect-controls.js'
import { SettingsSwitch } from './settings-controls.js'
import type { SkinChoice } from './skin-api.js'
import { SkinEditorActions, type SkinEditor } from './skin-editor.js'

const scenePresets = ['static', 'light', 'dynamic'] as const
const windowModes = ['dynamic', 'static', 'economy', 'off'] as const
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
  const experience = useSyncExternalStore(runtime.subscribe, runtime.getExperience)
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
      <label>{t('windowExperience')}
        <select value={experience} onChange={event => runtime.setExperience(event.currentTarget.value as WindowExperience)}>
          {(['follow', 'focus', 'balanced', 'immersive'] as const).map(key =>
            <option key={key} value={key}>{t(`experience.${key}`)}</option>)}
          {experience === 'custom' && <option value="custom" disabled>{t('experience.custom')}</option>}
        </select>
      </label>
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
    {blocked ? <p>{compatibilityMessage(t, choice.compatibility)}</p> : null}
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
        {effectGroups.map(group => {
          const declared = effects.filter(effect => describeEffect(effect.id).group === group)
          if (!declared.length) return null
          return <fieldset key={group}>
            <legend>{t(group)}</legend>
            <ul className="dsh-skin-effects">
              {declared.map(effect => <li key={effect.id}>
                <SkinEffectControls t={t} effect={effect} skinId={choice.manifest.id} editor={editor} />
              </li>)}
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
