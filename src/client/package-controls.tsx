import { useEffect, useRef, useState } from 'react'
import { MINIMUM_DSH_VERSION } from '../shared/compatibility.js'
import type { PackageOperations } from './package-operations.js'
import type { TranslateSettings } from './settings-copy.js'
import { canActivate, type SkinChoice } from './skin-api.js'

export function ImportSkin({ t, operations, disabled }: {
  t: TranslateSettings
  operations: PackageOperations
  disabled: boolean
}) {
  return <section className="dsh-skin-import" aria-label={t('package.importRegion')}>
    <label className="dsh-skin-file-button">{t('package.import')}
      <input type="file" aria-label={t('package.importFile')} accept=".zip,application/zip" disabled={disabled}
        onChange={event => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (file) void operations.run({ kind: 'import', file })
        }} />
    </label>
  </section>
}

export function PackageOperationStatus({ t, operations, name }: {
  t: TranslateSettings
  operations: PackageOperations
  name(manifest: SkinChoice['manifest']): string
}) {
  const { action, progress, phase, notice, errorCode, cancel } = operations
  if (!action && !notice) return null
  const target = action && 'choice' in action ? action.choice : notice?.target
  const message = phase === 'cancelling' ? t('package.cancelling') : phase === 'readback' ? t('package.readback')
    : progress ? t(progress.received === progress.total ? 'package.validating' : 'package.uploading')
      : action ? t('package.working') : notice?.message(t)
  return <div className="dsh-skin-package-status">
    <p role="status">{target ? name(target.manifest) + ' · ' : ''}{message}</p>
    {progress ? <div className="dsh-skin-actions">
      <span>{progress.filename}</span>
      <progress max={progress.total || 1} value={progress.received} aria-label={t(action?.kind === 'update'
        ? 'package.updateProgress' : 'package.uploadProgress')} />
      {!phase ? <button type="button" onClick={cancel}>{t(action?.kind === 'update' ? 'package.cancelUpdate' : 'package.cancelUpload')}</button> : null}
    </div> : null}
    {errorCode ? <details>
      <summary>{t('error.diagnostics')}</summary>
      <p>{errorCode}</p>
    </details> : null}
  </div>
}

export function PackageActions({ t, choice, displayName, operations, disabled }: {
  t: TranslateSettings
  choice: SkinChoice
  displayName: string
  operations: PackageOperations
  disabled: boolean
}) {
  const [assets, includeAssets] = useState(false)
  const [preferences, includePreferences] = useState(false)
  const [confirm, setConfirm] = useState<'remove' | 'rollback'>()
  const trigger = useRef<HTMLButtonElement>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  const allowed = canActivate(choice)
  useEffect(() => { if (confirm) cancelButton.current?.focus() }, [confirm])
  useEffect(() => { setConfirm(undefined) }, [choice.revision])

  function cancelConfirmation() {
    const previous = trigger.current
    setConfirm(undefined)
    requestAnimationFrame(() => previous?.focus())
  }

  return <section className="dsh-skin-detail dsh-skin-package-controls" data-managed-package={choice.manifest.id} aria-label={t('package.actions')}>
    <header>
      <h3>{displayName}</h3>
      <p className="dsh-skin-muted">{t('skinVersion', { version: choice.manifest.version })}</p>
      {choice.previousVersion ? <p className="dsh-skin-muted">{t('package.previousVersion', { version: choice.previousVersion })}</p> : null}
    </header>
    {choice.compatibility || !allowed ? <p>{choice.compatibility?.code === 'unsupported-host'
      ? t('error.unsupportedHost', { version: MINIMUM_DSH_VERSION })
      : t(choice.compatibility ? 'error.compatibility' : 'validatedRequired')}</p> : null}
    {allowed ? <>
      <label><input type="checkbox" checked={assets} disabled={disabled} onChange={event => includeAssets(event.currentTarget.checked)} />
        {t('package.assets')}</label>
      <label><input type="checkbox" checked={preferences} disabled={disabled} onChange={event => includePreferences(event.currentTarget.checked)} />
        {t('package.preferences')}</label>
      <div className="dsh-skin-actions">
        <button type="button" disabled={disabled || Boolean(confirm)}
          onClick={() => void operations.run({ kind: 'export', choice, assets, preferences })}>{t('package.export')}</button>
        {choice.managed ? <>
          <label className="dsh-skin-file-button">{t('package.update')}
            <input type="file" aria-label={t('package.updateFile')} accept=".zip,application/zip" disabled={disabled || Boolean(confirm)}
              onChange={event => {
                const file = event.currentTarget.files?.[0]
                event.currentTarget.value = ''
                if (file) void operations.run({ kind: 'update', choice, file })
              }} />
          </label>
          {choice.previousVersion ? <button type="button" disabled={disabled || Boolean(confirm)} onClick={event => {
            trigger.current = event.currentTarget
            setConfirm('rollback')
          }}>{t('package.rollbackTo', { version: choice.previousVersion })}</button> : null}
          <button type="button" disabled={disabled || Boolean(confirm)} onClick={event => {
            trigger.current = event.currentTarget
            setConfirm('remove')
          }}>{t('package.uninstall')}</button>
        </> : <p>{t('package.builtInReadOnly')}</p>}
      </div>
    </> : null}
    {allowed && confirm ? (
      <div className="dsh-skin-confirm" role="group" aria-label={t(confirm === 'remove' ? 'package.confirmUninstall' : 'package.confirmRollback')}>
        <p>{confirm === 'remove' ? t('package.confirmRemoveText', { name: displayName })
          : t('package.confirmRollbackText', { name: displayName, version: choice.previousVersion ?? '' })}</p>
        <div className="dsh-skin-actions">
          <button type="button" disabled={disabled} onClick={() => {
            setConfirm(undefined)
            void operations.run({ kind: confirm, choice })
          }}>{t(confirm === 'remove' ? 'package.confirmUninstall' : 'package.confirmRollback')}</button>
          <button ref={cancelButton} type="button" onClick={cancelConfirmation}>
            {t(confirm === 'remove' ? 'package.keepSkin' : 'package.keepVersion')}
          </button>
        </div>
      </div>
    ) : null}
  </section>
}
