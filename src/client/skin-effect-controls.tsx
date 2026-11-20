import type { SkinEffect } from '../core/effects.js'
import { effectControls, effectPreferenceFor, type EffectPreference } from '../shared/preferences.js'
import type { TranslateSettings } from './settings-copy.js'
import { SettingsSwitch } from './settings-controls.js'
import type { SkinEditor } from './skin-editor.js'

export function SkinEffectControls({ t, effect, skinId, editor, quick = false }: {
  t: TranslateSettings
  effect: SkinEffect
  skinId: string
  editor: SkinEditor
  quick?: boolean
}) {
  const { values, edit } = editor
  const { id } = effect
  const override = effectPreferenceFor(skinId, values.effects, id)
  const control = effectControls(effect, override)
  const { enabled, minimum, maximum } = control
  const name = t(control.label)
  const magnitude = t(control.measure) + ' ' + control.percentage + '%'
  function update(change: EffectPreference) {
    edit({ ...values, effects: { ...values.effects, [id]: { ...override, ...change } } })
  }
  return <>
    <SettingsSwitch checked={enabled} label={name} onChange={enabled => update({ enabled })} />
    <label>
      {magnitude}
      <input type="range" aria-label={t('strength', { name })} aria-valuetext={magnitude}
        min={minimum} max={maximum} step={1} value={control.percentage}
        disabled={!enabled} onChange={event => update({ strength: (event.currentTarget.valueAsNumber - minimum) / (maximum - minimum) })} />
    </label>
    {control.additional.filter(option => !quick || id !== 'ambient.aurora-curtain' || option.key === 'speed').map(option => <label key={option.key}>
      {t(option.label)} {option.percentage}%
      <input type="range" aria-label={t(option.label)} aria-valuetext={option.percentage + '%'}
        min={option.minimum} max={option.maximum} step={1} value={option.percentage} disabled={!enabled}
        onChange={event => update({ [option.key]: event.currentTarget.valueAsNumber / 100 })} />
    </label>)}
    {control.hint ? <small>{t(control.hint)}</small> : null}
  </>
}
