import { packageLabel } from './skin-package-label.js'
import { ArtworkEditor } from './artwork-editor.js'
import { supportsUserArtwork } from '../shared/user-artwork.js'
import { useState } from 'react'
import type { ColorScheme } from '../core/tokens.js'
import { MINIMUM_DSH_VERSION } from '../shared/compatibility.js'
import { defaultComposerTransparency, editableColors, resolveSkinColors, samePreferences } from '../shared/preferences.js'
import type { TranslateSettings } from './settings-copy.js'
import { SkinEditorActions, type SkinEditor } from './skin-editor.js'
import type { SkinChoice } from './skin-api.js'
import { SkinPreviewImage } from './skin-preview-image.js'

function pickerColor(color: string | undefined) {
  if (!color) return '#000000'
  if (color.length >= 7) return color.slice(0, 7)
  const [red, green, blue] = color.slice(1)
  return `#${red}${red}${green}${green}${blue}${blue}`
}

interface DetailProps {
  t: TranslateSettings
  id: string
  displayName: string
  choice: SkinChoice
  scheme: ColorScheme
  placeholder?: string
  artworkEditorVisible: boolean
  onOpenEffects(): void
  onOpenManagement(): void
  editor: SkinEditor
}

export function SkinDetail({ t, id, displayName, choice, scheme, placeholder, artworkEditorVisible, onOpenEffects, onOpenManagement, editor }: DetailProps) {
  const [previewScheme, setPreviewScheme] = useState<ColorScheme>()
  const { manifest, compatibility } = choice
  const { result, blocked, values, disabled, packageChanged, edit } = editor
  const defaultTransparency = defaultComposerTransparency(manifest.id)
  const transparency = values.composerTransparency ?? defaultTransparency
  const colors = result?.data && resolveSkinColors(result.data.tokens, scheme)
  const appearance = t(`appearance.${manifest.colorScheme ?? 'any'}`)
  const imageScheme = manifest.colorScheme === 'both' ? previewScheme ?? scheme : manifest.colorScheme ?? scheme

  return (
    <section id={id} tabIndex={-1} className="dsh-skin-detail" data-skin-detail={manifest.id} aria-label={t('details', { name: displayName })}>
      <div className="dsh-skin-preview-art">
        <SkinPreviewImage path={choice.previews[imageScheme]} placeholder={placeholder}
          alt={t('previewImage', { name: displayName, scheme: t(`appearance.${imageScheme}`) })} />
        {manifest.colorScheme === 'both' ? <label>{t('previewImageAppearance')}
          <select value={previewScheme ?? ''} onChange={event => setPreviewScheme(event.currentTarget.value as ColorScheme || undefined)}>
            <option value="">{t('followDshAppearance')}</option>
            <option value="light">{t('appearance.light')}</option>
            <option value="dark">{t('appearance.dark')}</option>
          </select>
        </label> : null}
      </div>
      <header>
        <h3>{displayName}</h3>
        <p className="dsh-skin-muted">{packageLabel(choice, t)} · {t('skinVersion', { version: manifest.version })} · {t('requiresEngineApi', { range: manifest.engineApi })}</p>
        {manifest.description ? <p>{manifest.description}</p> : null}
      </header>
      <div className="dsh-skin-primary-actions"><SkinEditorActions t={t} editor={editor} appearance={appearance} canDiscard /></div>
      {blocked ? <p>{compatibility?.code === 'unsupported-host'
        ? t('error.unsupportedHost', { version: MINIMUM_DSH_VERSION })
        : t(compatibility ? 'error.compatibility' : 'validatedRequired')}</p> : null}
      {compatibility ? <details>
        <summary>{t('error.diagnostics')}</summary>
        <p>{compatibility.code ? `${compatibility.code} · ` : ''}{compatibility.message}</p>
      </details> : null}
      {result?.data ? (
        <details className="dsh-skin-disclosure" data-skin-customization>
          <summary>{t('customize')}</summary>
          {artworkEditorVisible && supportsUserArtwork(choice) ? <ArtworkEditor id={manifest.id} editor={editor} t={t} /> : null}
          <fieldset disabled={disabled || packageChanged}>
            <legend>{t('preferences')}</legend>
            <div className="dsh-skin-fields">
              {editableColors.filter(key => colors?.[key] !== undefined || values.colors?.[key] !== undefined).map(key => (
                <label key={key}>{t(`color.${key}`)}
                  <input type="color" value={pickerColor(values.colors?.[key] ?? colors?.[key])}
                    onChange={event => edit({ ...values, colors: { ...values.colors, [key]: event.currentTarget.value } })} />
                </label>
              ))}
              <label>{t('composerTransparency')} · {transparency}%
                <input type="range" min={0} max={100} step={1} value={transparency}
                  aria-label={t('composerTransparency')} aria-valuetext={`${transparency}%`}
                  onChange={event => {
                    const next = event.currentTarget.valueAsNumber
                    const { composerTransparency: _previous, ...remaining } = values
                    edit(next === defaultTransparency ? remaining : { ...remaining, composerTransparency: next })
                  }} />
              </label>
            </div>
          </fieldset>
          <div className="dsh-skin-actions">
            <button type="button" disabled={disabled || packageChanged || samePreferences(values)} onClick={() => edit(null)}>{t('resetPreferences')}</button>
            {result.data.bundledPreferences ? (
              <button type="button" disabled={disabled || packageChanged} onClick={() => edit(result.data?.bundledPreferences ?? null)}>
                {t('useIncluded')}
              </button>
            ) : null}
          </div>
        </details>
      ) : null}
      <div className="dsh-skin-actions">
        <button type="button" onClick={onOpenEffects}>{t('openEffects')}</button>
      </div>
      <details className="dsh-skin-disclosure" data-skin-technical>
        <summary>{t('packageInformation')}</summary>
        <p className="dsh-skin-muted">{manifest.author ?? t('unknownAuthor')} · {t('appearance', { scheme: appearance })}</p>
        {manifest.dshCompatibility ? <p className="dsh-skin-muted">DSH {manifest.dshCompatibility}</p> : null}
        <div className="dsh-skin-actions">
          <button type="button" onClick={onOpenManagement}>{t('openManagement')}</button>
        </div>
      </details>
    </section>
  )
}
