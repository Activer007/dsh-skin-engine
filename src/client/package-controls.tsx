import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { skinApi, type SkinChoice } from './skin-api.js'
import type { createSkinSwitch } from './skin-switch.js'

export function ImportSkin({ controller, disabled, onInstalled }: {
  controller: ReturnType<typeof createSkinSwitch>
  disabled: boolean
  onInstalled(id: string): void
}) {
  const operation = useRef<AbortController | undefined>(undefined)
  const [progress, setProgress] = useState<{ received: number; total: number }>()
  const [notice, setNotice] = useState('')
  useEffect(() => () => operation.current?.abort(), [])

  async function install(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file || operation.current) return
    const abort = new AbortController()
    operation.current = abort
    setProgress({ received: 0, total: file.size })
    setNotice('')
    try {
      const { skinId } = await skinApi.import(file, abort.signal, received => setProgress({ received, total: file.size }))
      await controller.refresh(true)
      onInstalled(skinId)
      setNotice('Skin installed.')
    } catch (error) {
      if (abort.signal.aborted) await controller.refresh(true)
      setNotice(error instanceof Error ? error.message : 'Skin import failed.')
    } finally {
      operation.current = undefined
      setProgress(undefined)
    }
  }

  return (
    <section className="dsh-skin-import" aria-label="Import skin package">
      <label className="dsh-skin-file-button">Import ZIP
        <input type="file" aria-label="Import .dshskin.zip" accept=".zip,application/zip" disabled={disabled || Boolean(progress)}
          onChange={event => void install(event)} />
      </label>
      {progress ? (
        <div className="dsh-skin-actions">
          <progress max={progress.total || 1} value={progress.received} aria-label="ZIP upload progress" />
          <span>{progress.received === progress.total ? 'Validating ZIP…' : 'Uploading ZIP…'}</span>
          <button type="button" onClick={() => operation.current?.abort()}>Cancel upload</button>
        </div>
      ) : null}
      <p role="status">{notice}</p>
    </section>
  )
}

export function PackageActions({ choice, controller, disabled, onVersionNotice }: {
  choice: SkinChoice
  controller: ReturnType<typeof createSkinSwitch>
  disabled: boolean
  onVersionNotice(message: string): void
}) {
  const [assets, includeAssets] = useState(false)
  const [preferences, includePreferences] = useState(false)
  const [confirm, setConfirm] = useState<'remove' | 'rollback'>()
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(false)
  const [progress, setProgress] = useState<{ received: number; total: number }>()
  const operation = useRef<AbortController | undefined>(undefined)
  useEffect(() => () => operation.current?.abort(), [])

  async function run(action: 'export' | 'remove' | 'rollback' | File) {
    if (operation.current) return
    const abort = new AbortController()
    operation.current = abort
    setPending(true)
    setNotice('')
    onVersionNotice('')
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
        setNotice('Skin archive prepared.')
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
        onVersionNotice(visible?.revision === result.revision
          ? `Skin ${action === 'rollback' ? 'rolled back' : 'updated'} to v${result.version}.`
          : `Host committed v${result.version}. Reload skins to confirm the current version.`)
      }
    } catch (error) {
      if (action !== 'export') await controller.refresh(true)
      const message = error instanceof Error ? error.message : 'Skin package operation failed.'
      if (versionChange) onVersionNotice(message)
      else setNotice(message)
    } finally {
      operation.current = undefined
      setConfirm(undefined)
      setPending(false)
      setProgress(undefined)
    }
  }

  return (
    <details className="dsh-skin-disclosure dsh-skin-package-controls">
      <summary>Package actions</summary>
      <label><input type="checkbox" checked={assets} onChange={event => includeAssets(event.currentTarget.checked)} />
        Include package images and other assets</label>
      <label><input type="checkbox" checked={preferences} onChange={event => includePreferences(event.currentTarget.checked)} />
        Include saved preferences</label>
      <div className="dsh-skin-actions">
        <button type="button" disabled={disabled || pending} onClick={() => void run('export')}>Export ZIP</button>
        {choice.managed && !confirm ? (
          <>
            <label className="dsh-skin-file-button">Update ZIP
              <input type="file" aria-label="Update from .dshskin.zip" accept=".zip,application/zip" disabled={disabled || pending}
                onChange={event => {
                  const file = event.currentTarget.files?.[0]
                  event.currentTarget.value = ''
                  if (file) void run(file)
                }} />
            </label>
            {choice.previousVersion ? (
              <button type="button" disabled={disabled || pending} onClick={() => setConfirm('rollback')}>
                Roll back to v{choice.previousVersion}…
              </button>
            ) : null}
            <button type="button" disabled={disabled || pending} onClick={() => setConfirm('remove')}>Uninstall…</button>
          </>
        ) : null}
      </div>
      {progress ? (
        <div className="dsh-skin-actions">
          <progress max={progress.total || 1} value={progress.received} aria-label="ZIP update progress" />
          <button type="button" onClick={() => operation.current?.abort()}>Cancel update</button>
        </div>
      ) : null}
      {confirm === 'remove' ? (
        <div>
          <p>Remove {choice.manifest.name} from this profile? If it is active, the window will return to Default.</p>
          <div className="dsh-skin-actions">
            <button type="button" disabled={disabled || pending} onClick={() => void run('remove')}>Confirm uninstall</button>
            <button type="button" disabled={pending} onClick={() => setConfirm(undefined)}>Keep skin</button>
          </div>
        </div>
      ) : null}
      {confirm === 'rollback' ? (
        <div>
          <p>Restore {choice.manifest.name} v{choice.previousVersion}? Saved preferences will be kept.</p>
          <div className="dsh-skin-actions">
            <button type="button" disabled={disabled || pending} onClick={() => void run('rollback')}>Confirm rollback</button>
            <button type="button" disabled={pending} onClick={() => setConfirm(undefined)}>Keep current version</button>
          </div>
        </div>
      ) : null}
      <p role="status">{notice}</p>
    </details>
  )
}
