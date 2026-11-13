import { useEffect, useId, useState } from 'react'
import { preferencesFor, type SkinPreferences } from '../shared/preferences.js'
import { settingsError, type TranslateSettings } from './settings-copy.js'
import type { createSettingsSession } from './settings-session.js'
import { canActivate, type SkinChoice, type SkinData } from './skin-api.js'
import type { createSkinSwitch } from './skin-switch.js'

type Controller = ReturnType<typeof createSkinSwitch>
type Session = ReturnType<typeof createSettingsSession>
type Snapshot = ReturnType<Controller['getSnapshot']>

export function useSkinEditor(choice: SkinChoice | undefined, controller: Controller, session: Session, state: Snapshot) {
  const [loaded, setLoaded] = useState<{ choice: SkinChoice; data?: SkinData; error?: string }>()
  const blocked = Boolean(choice && (choice.compatibility || !canActivate(choice)))
  const result = loaded?.choice === choice ? loaded : undefined
  useEffect(() => {
    if (!choice || blocked) return
    const request = new AbortController()
    void controller.loadDetails(choice, request.signal).then(data => {
      if (!request.signal.aborted) setLoaded({ choice, data })
    }, (error: unknown) => {
      if (!request.signal.aborted) setLoaded({ choice, error: error instanceof Error ? error.message : 'Could not read the skin.' })
    })
    return () => request.abort()
  }, [choice, blocked, controller])

  const id = choice?.manifest.id
  const revision = state.saved?.revision
  const draft = id ? session.getDraft(id) : undefined
  const preferences = id ? preferencesFor(state.saved?.preferences, id) : undefined
  const values = (draft ? draft.value : preferences) ?? {}
  const busy = state.saving
  const disabled = busy || revision === undefined || blocked || !result?.data
  const packageChanged = Boolean(draft && draft.packageRevision !== choice?.revision)
  const profileChanged = Boolean(draft && revision !== undefined && draft.revision !== revision)
  const stale = packageChanged || profileChanged
  const previewBlock = choice && !blocked ? controller.getAppearanceBlock(choice) : undefined
  const applyBlock = choice && !blocked ? controller.getAppearanceBlock(choice, 'apply') : undefined
  const applied = Boolean(id && state.preview === null && state.rendered === id && state.saved?.skinId === id)

  function edit(value: SkinPreferences | null) {
    if (choice && revision !== undefined) session.setDraft(choice.manifest.id, {
      value, revision: draft?.revision ?? revision, packageRevision: draft?.packageRevision ?? choice.revision,
    })
  }

  async function apply() {
    if (!id || stale) return
    if (await controller.apply(id, draft) && session.getDraft(id) === draft) session.setDraft(id, undefined)
  }

  function reviewDraft() {
    if (!choice || !draft || revision === undefined || !result?.data) return
    const value = draft.value
    const declared = new Set<string>(result.data.effects.map(effect => effect.id))
    const effects = packageChanged && value?.effects
      ? { ...preferences?.effects, ...Object.fromEntries(Object.entries(value.effects).filter(([id]) => declared.has(id))) }
      : value?.effects
    session.setDraft(choice.manifest.id, { value: value && { ...value, effects }, revision, packageRevision: choice.revision })
  }

  function discard() {
    if (!id) return
    session.setDraft(id, undefined)
    if (controller.getSnapshot().preview === id) void controller.cancelPreview()
  }

  return { blocked, result, draft, values, busy, disabled, packageChanged, stale, previewBlock, applyBlock, applied, edit, apply, reviewDraft,
    discard, preview: () => { if (id) void controller.preview(id, draft) } }
}

export type SkinEditor = ReturnType<typeof useSkinEditor>

export function SkinEditorActions({ t, editor, appearance, canDiscard = false }: {
  t: TranslateSettings
  editor: SkinEditor
  appearance: string
  canDiscard?: boolean
}) {
  const statusId = useId()
  const { result, blocked, disabled, stale, packageChanged, draft, busy, applyBlock, previewBlock, applied } = editor
  const activationStatus = applyBlock ? settingsError(t, applyBlock, 'error.generic') : busy ? t('saving') : previewBlock
    ? t('appearanceSwitch', { scheme: appearance }) : applied && !draft ? t('skinApplied') : ''
  return <>
    {result?.error ? <p role="alert">{settingsError(t, result.error, 'readSkinFailed')}</p> : null}
    {!blocked && !result ? <p role="status">{t('loadingDetails')}</p> : null}
    <div className="dsh-skin-actions">
      <button type="button" disabled={disabled || packageChanged || Boolean(previewBlock)} aria-describedby={statusId}
        onClick={editor.preview}>{t('preview')}</button>
      <button type="button" className="dsh-skin-primary" disabled={disabled || stale || Boolean(applyBlock)} aria-describedby={statusId}
        onClick={() => void editor.apply()}>{t('apply')}</button>
      {canDiscard && draft ? <button type="button" disabled={busy} onClick={editor.discard}>{t('discard')}</button> : null}
    </div>
    <p id={statusId} role="status">{activationStatus}</p>
    {draft ? <p role="status">{t('unsaved')}</p> : null}
    {draft ? <p className="dsh-skin-muted">{t('draftLifetime')}</p> : null}
    {stale ? <div role="status">
      <p>{t(packageChanged ? 'draftPackageChanged' : 'draftProfileChanged')}</p>
      {result?.data ? (
        <button type="button" disabled={disabled} onClick={editor.reviewDraft}>{t(packageChanged ? 'rebasePackageDraft' : 'rebaseDraft')}</button>
      ) : null}
    </div> : null}
  </>
}
