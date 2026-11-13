import { useEffect, useRef, useState } from 'react'
import { settingsError, type TranslateSettings } from './settings-copy.js'
import { skinApi, type SkinChoice } from './skin-api.js'
import type { createSkinSwitch } from './skin-switch.js'

type Action =
  | { kind: 'import'; file: File }
  | { kind: 'update'; file: File; choice: SkinChoice }
  | { kind: 'export'; choice: SkinChoice; assets: boolean; preferences: boolean }
  | { kind: 'remove' | 'rollback'; choice: SkinChoice }
type Notice = (t: TranslateSettings) => string
type Progress = { received: number; total: number; filename: string }

interface DesktopFiles {
  save(request: { url: string; name: string; mediaType: string; mode: 'download' }): Promise<{ status: 'requested' | 'saved' | 'cancelled' }>
}

async function downloadArchive(archive: Blob, name: string) {
  const desktop = (window as Window & { dshDesktop?: { fileActions?: DesktopFiles } }).dshDesktop?.fileActions
  const url = URL.createObjectURL(archive)
  if (desktop) {
    try { return (await desktop.save({ url, name, mediaType: archive.type, mode: 'download' })).status }
    finally { URL.revokeObjectURL(url) }
  }
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return 'requested'
}

export function usePackageOperations(controller: ReturnType<typeof createSkinSwitch>, onInstalled: (id: string) => void) {
  const operation = useRef<AbortController | undefined>(undefined)
  const [action, setAction] = useState<Action>()
  const [progress, setProgress] = useState<Progress>()
  const [phase, setPhase] = useState<'cancelling' | 'readback'>()
  const [notice, setNotice] = useState<{ message: Notice; target?: SkinChoice }>()
  const [errorCode, setErrorCode] = useState('')
  useEffect(() => () => operation.current?.abort(), [])

  async function readback() {
    setPhase('readback')
    await controller.refresh(true)
    const { catalogue, catalogueNotice } = controller.getSnapshot()
    return catalogueNotice ? undefined : catalogue
  }

  async function run(next: Action) {
    if (operation.current || controller.getSnapshot().saving) return
    const abort = new AbortController()
    operation.current = abort
    setAction(next)
    setNotice(undefined)
    setErrorCode('')
    const signal = abort.signal
    function publish(message: Notice) {
      setNotice({ message, target: 'choice' in next ? next.choice : undefined })
    }
    try {
      if (next.kind === 'export') {
        const archive = await skinApi.export(next.choice, next, signal)
        signal.throwIfAborted()
        const status = await downloadArchive(archive, next.choice.manifest.id + '.dshskin.zip')
        publish(t => t(status === 'saved' ? 'package.exportSaved' : status === 'cancelled' ? 'package.exportCancelled' : 'package.prepared'))
      } else if (next.kind === 'remove') {
        const { removed } = await skinApi.remove(next.choice, signal)
        const catalogue = await readback()
        const state = controller.getSnapshot()
        const verified = catalogue && state.saved && state.saved.skinId !== removed && !catalogue.skins.some(item => item.manifest.id === removed)
        publish(t => t(verified ? 'package.removed' : 'package.confirmByReload'))
      } else if (next.kind === 'rollback') {
        const result = await skinApi.rollback(next.choice, signal)
        await showVersion(result, 'package.rolledBack')
      } else if ('file' in next) {
        const { file } = next
        const report = (received: number) => setProgress({ received, total: file.size, filename: file.name })
        report(0)
        if (next.kind === 'import') {
          const { skinId } = await skinApi.import(file, signal, report)
          const catalogue = await readback()
          const verified = catalogue?.skins.some(item => item.manifest.id === skinId && item.managed)
          if (verified && !signal.aborted) onInstalled(skinId)
          publish(t => t(verified ? 'package.installed' : 'package.confirmByReload'))
        } else {
          await showVersion(await skinApi.update(next.choice, file, signal, report), 'package.updated')
        }
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : ''
      const catalogue = next.kind !== 'export' ? await readback() : undefined
      if (/^[a-z][a-z0-9-]{1,79}$/.test(detail)) setErrorCode(detail)
      const fallback = next.kind === 'import' ? 'package.importFailed' : 'error.package'
      publish(t => signal.aborted && !catalogue
        ? t('error.cancelUncertain') : settingsError(t, detail, fallback))
    } finally {
      operation.current = undefined
      setAction(undefined)
      setProgress(undefined)
      setPhase(undefined)
    }

    async function showVersion(result: { skinId: string; revision: string; version: string }, key: 'package.updated' | 'package.rolledBack') {
      const catalogue = await readback()
      const visible = catalogue?.skins.find(item => item.manifest.id === result.skinId)
      publish(t => t(visible?.revision === result.revision ? key : 'package.reloadToConfirm',
        { version: result.version }))
    }
  }

  function cancel() {
    if (!operation.current || !progress || phase) return
    setPhase('cancelling')
    operation.current.abort()
  }

  return { action, progress, phase, notice, errorCode, run, cancel }
}

export type PackageOperations = ReturnType<typeof usePackageOperations>
