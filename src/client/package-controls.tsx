import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { settingsError, type TranslateSettings } from './settings-copy.js'
import { skinApi, type SkinChoice } from './skin-api.js'
import type { createSkinSwitch } from './skin-switch.js'

type Notice = (t: TranslateSettings) => string

function PackageErrorDetails({ t, detail }: { t: TranslateSettings; detail: string }) {
  return detail ? <details>
    <summary>{t('error.diagnostics')}</summary>
    <p>{detail}</p>
  </details> : null
}

export function ImportSkin({ t, controller, disabled, onInstalled }: {
  t: TranslateSettings
  controller: ReturnType<typeof createSkinSwitch>
  disabled: boolean
  onInstalled(id: string): void
}) {
  const operation = useRef<AbortController | undefined>(undefined)
  const [progress, setProgress] = useState<{ received: number; total: number }>()
  const [notice, setNotice] = useState<Notice>()
  const [errorDetail, setErrorDetail] = useState('')
  useEffect(() => () => operation.current?.abort(), [])

  async function install(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file || operation.current) return
    const abort = new AbortController()
    operation.current = abort
    setProgress({ received: 0, total: file.size })
    setNotice(undefined)
    setErrorDetail('')
    try {
      const { skinId } = await skinApi.import(file, abort.signal, received => setProgress({ received, total: file.size }))
      await controller.refresh(true)
      onInstalled(skinId)
      setNotice(() => (t: TranslateSettings) => t('package.installed'))
    } catch (error) {
      if (abort.signal.aborted) await controller.refresh(true)
      const detail = error instanceof Error ? error.message : ''
      setErrorDetail(detail)
      setNotice(() => (t: TranslateSettings) => settingsError(t, detail, 'package.importFailed'))
    } finally {
      operation.current = undefined
      setProgress(undefined)
    }
  }

  return (
    <section className="dsh-skin-import" aria-label={t('package.importRegion')}>
      <label className="dsh-skin-file-button">{t('package.import')}
        <input type="file" aria-label={t('package.importFile')} accept=".zip,application/zip" disabled={disabled || Boolean(progress)}
          onChange={event => void install(event)} />
      </label>
      {progress ? (
        <div className="dsh-skin-actions">
          <progress max={progress.total || 1} value={progress.received} aria-label={t('package.uploadProgress')} />
          <span>{t(progress.received === progress.total ? 'package.validating' : 'package.uploading')}</span>
          <button type="button" onClick={() => operation.current?.abort()}>{t('package.cancelUpload')}</button>
        </div>
      ) : null}
      <p role="status">{notice?.(t)}</p>
      <PackageErrorDetails t={t} detail={errorDetail} />
    </section>
  )
}

export function PackageActions({ t, choice, controller, disabled, onVersionNotice }: {
  t: TranslateSettings
  choice: SkinChoice
  controller: ReturnType<typeof createSkinSwitch>
  disabled: boolean
  onVersionNotice(message: Notice | undefined): void
}) {
  const [assets, includeAssets] = useState(false)
  const [preferences, includePreferences] = useState(false)
  const [confirm, setConfirm] = useState<'remove' | 'rollback'>()
  const [notice, setNotice] = useState<Notice>()
  const [errorDetail, setErrorDetail] = useState('')
  const [pending, setPending] = useState(false)
  const [progress, setProgress] = useState<{ received: number; total: number }>()
  const operation = useRef<AbortController | undefined>(undefined)
  useEffect(() => () => operation.current?.abort(), [])

  async function run(action: 'export' | 'remove' | 'rollback' | File) {
    if (operation.current) return
    const abort = new AbortController()
    operation.current = abort
    setPending(true)
    setNotice(undefined)
    setErrorDetail('')
    onVersionNotice(undefined)
    const versionChange = action !== 'export' && action !== 'remove'
    try {
      if (action === 'export') {
        const archive = await skinApi.export(choice, { assets, preferences }, abort.signal)
        const url = URL.createObjectURL(archive)
        const link = document.createElement('a')
        link.href = url
        link.download = `${choice.manifest.id}.dshskin.zip`
        link.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        setNotice(() => (t: TranslateSettings) => t('package.prepared'))
      } else if (action === 'remove') {
        await skinApi.remove(choice, abort.signal)
        await controller.refresh(true)
      } else {
        let result
        if (action === 'rollback') result = await skinApi.rollback(choice, abort.signal)
        else {
          setProgress({ received: 0, total: action.size })
          result = await skinApi.update(choice, action, abort.signal, received => setProgress({ received, total: action.size }))
        }
        await controller.refresh(true)
        const visible = controller.getSnapshot().catalogue?.skins.find(skin => skin.manifest.id === result.skinId)
        const key = visible?.revision === result.revision
          ? action === 'rollback' ? 'package.rolledBack' : 'package.updated'
          : 'package.reloadToConfirm'
        onVersionNotice(t => t(key, { version: result.version }))
      }
    } catch (error) {
      if (action !== 'export') await controller.refresh(true)
      const detail = error instanceof Error ? error.message : ''
      setErrorDetail(detail)
      const notice: Notice = t => settingsError(t, detail, 'error.package')
      if (versionChange) onVersionNotice(notice)
      else setNotice(() => notice)
    } finally {
      operation.current = undefined
      setConfirm(undefined)
      setPending(false)
      setProgress(undefined)
    }
  }

  return (
    <details className="dsh-skin-disclosure dsh-skin-package-controls">
      <summary>{t('package.actions')}</summary>
      <label><input type="checkbox" checked={assets} onChange={event => includeAssets(event.currentTarget.checked)} />
        {t('package.assets')}</label>
      <label><input type="checkbox" checked={preferences} onChange={event => includePreferences(event.currentTarget.checked)} />
        {t('package.preferences')}</label>
      <div className="dsh-skin-actions">
        <button type="button" disabled={disabled || pending} onClick={() => void run('export')}>{t('package.export')}</button>
        {choice.managed && !confirm ? (
          <>
            <label className="dsh-skin-file-button">{t('package.update')}
              <input type="file" aria-label={t('package.updateFile')} accept=".zip,application/zip" disabled={disabled || pending}
                onChange={event => {
                  const file = event.currentTarget.files?.[0]
                  event.currentTarget.value = ''
                  if (file) void run(file)
                }} />
            </label>
            {choice.previousVersion ? (
              <button type="button" disabled={disabled || pending} onClick={() => setConfirm('rollback')}>
                {t('package.rollbackTo', { version: choice.previousVersion })}
              </button>
            ) : null}
            <button type="button" disabled={disabled || pending} onClick={() => setConfirm('remove')}>{t('package.uninstall')}</button>
          </>
        ) : null}
      </div>
      {progress ? (
        <div className="dsh-skin-actions">
          <progress max={progress.total || 1} value={progress.received} aria-label={t('package.updateProgress')} />
          <button type="button" onClick={() => operation.current?.abort()}>{t('package.cancelUpdate')}</button>
        </div>
      ) : null}
      {confirm === 'remove' ? (
        <div>
          <p>{t('package.confirmRemoveText', { name: choice.manifest.name })}</p>
          <div className="dsh-skin-actions">
            <button type="button" disabled={disabled || pending} onClick={() => void run('remove')}>{t('package.confirmUninstall')}</button>
            <button type="button" disabled={pending} onClick={() => setConfirm(undefined)}>{t('package.keepSkin')}</button>
          </div>
        </div>
      ) : null}
      {confirm === 'rollback' ? (
        <div>
          <p>{t('package.confirmRollbackText', { name: choice.manifest.name, version: choice.previousVersion ?? '' })}</p>
          <div className="dsh-skin-actions">
            <button type="button" disabled={disabled || pending} onClick={() => void run('rollback')}>{t('package.confirmRollback')}</button>
            <button type="button" disabled={pending} onClick={() => setConfirm(undefined)}>{t('package.keepVersion')}</button>
          </div>
        </div>
      ) : null}
      <p role="status">{notice?.(t)}</p>
      <PackageErrorDetails t={t} detail={errorDetail} />
    </details>
  )
}
