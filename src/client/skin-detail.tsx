import { ArtworkEditor } from './artwork-editor.js'
import { useState } from 'react'
import type { ColorScheme } from '../core/tokens.js'
import { MINIMUM_DSH_VERSION } from '../shared/compatibility.js'
import { editableColors, resolveSkinColors, samePreferences } from '../shared/preferences.js'
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
  const { result, blocked, values, disabled, packageChanged, draft, busy, edit } = editor
  const colors = result?.data && resolveSkinColors(result.data.tokens, scheme)
  const appearance = t(`appearance.${manifest.colorScheme ?? 'any'}`)
  const imageScheme = manifest.colorScheme === 'both' ? previewScheme ?? scheme : manifest.colorScheme ?? scheme

  return (
    <section id={id} tabIndex={-1} className="dsh-skin-detail" data-skin-detail={manifest.id} aria-label={t('details', { name: displayName })}>
      <header>
        <h3>{displayName}</h3>
        <p className="dsh-skin-muted">{t('editingSkin', { name: displayName })}</p>
        <p className="dsh-skin-muted">{t('skinVersion', { version: manifest.version })} · {manifest.author ?? t('unknownAuthor')} · {t('appearance', { scheme: appearance })} · {t(choice.source === 'built-in' ? 'builtin' : 'local')}</p>
        {manifest.description ? <p>{manifest.description}</p> : null}
      </header>
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
      {blocked ? <p>{compatibility?.code === 'unsupported-host'
        ? t('error.unsupportedHost', { version: MINIMUM_DSH_VERSION })
        : t(compatibility ? 'error.compatibility' : 'validatedRequired')}</p> : null}
      {compatibility ? <details>
        <summary>{t('error.diagnostics')}</summary>
        <p>{compatibility.code ? `${compatibility.code} · ` : ''}{compatibility.message}</p>
      </details> : null}
      {artworkEditorVisible && choice.source === 'built-in' ? <ArtworkEditor id={manifest.id} editor={editor} t={t} /> : null}
      <SkinEditorActions t={t} editor={editor} appearance={appearance} />
      {result?.data ? (
        <details open className="dsh-skin-disclosure">
          <summary>{t('customize')}</summary>
          <fieldset disabled={disabled || packageChanged}>
            <legend>{t('preferences')}</legend>
            <div className="dsh-skin-fields">
              {editableColors.filter(key => colors?.[key] !== undefined || values.colors?.[key] !== undefined).map(key => (
                <label key={key}>{t(`color.${key}`)}
                  <input type="color" value={pickerColor(values.colors?.[key] ?? colors?.[key])}
                    onChange={event => edit({ ...values, colors: { ...values.colors, [key]: event.currentTarget.value } })} />
                </label>
              ))}
            </div>
          </fieldset>
          <div className="dsh-skin-actions">
            <button type="button" disabled={disabled || packageChanged || samePreferences(values)} onClick={() => edit(null)}>{t('resetPreferences')}</button>
            {result.data.bundledPreferences ? (
              <button type="button" disabled={disabled || packageChanged} onClick={() => edit(result.data?.bundledPreferences ?? null)}>
                {t('useIncluded')}
              </button>
            ) : null}
            {draft ? (
              <button type="button" disabled={busy} onClick={editor.discard}>{t('discard')}</button>
            ) : null}
          </div>
        </details>
      ) : null}
      <div className="dsh-skin-actions">
        <button type="button" onClick={onOpenEffects}>{t('openEffects')}</button>
        <button type="button" onClick={onOpenManagement}>{t('openManagement')}</button>
      </div>
      <p className="dsh-skin-muted">{t('engineApi')} {manifest.engineApi}{manifest.dshCompatibility ? ` · DSH ${manifest.dshCompatibility}` : ''}</p>
    </section>
  )
}
