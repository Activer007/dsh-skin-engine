import { useSyncExternalStore } from 'react'
import { settingsError, type TranslateSettings } from './settings-copy.js'
import { skinApi, type SkinChoice } from './skin-api.js'
import type { createSkinSwitch } from './skin-switch.js'

type Action =
  | { kind: 'import'; file: File; onInstalled?(id: string): void }
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

interface OperationSnapshot {
  action?: Action
  progress?: Progress
  phase?: 'cancelling' | 'readback'
  notice?: { message: Notice; target?: SkinChoice }
  errorCode: string
}

/** A single transaction owner per plugin, independent of mounted UI surfaces. */
export function createPackageOperations(controller: ReturnType<typeof createSkinSwitch>,
  dependencies: { api?: typeof skinApi; download?: typeof downloadArchive } = {}) {
  const api = dependencies.api ?? skinApi
  const download = dependencies.download ?? downloadArchive
  const listeners = new Set<() => void>()
  let operation: AbortController | undefined
  let disposed = false
  let state: OperationSnapshot = { errorCode: '' }
  function update(change: Partial<OperationSnapshot>) {
    if (disposed) return
    state = { ...state, ...change }
    for (const listener of listeners) listener()
  }
  const setProgress = (progress: OperationSnapshot['progress']) => update({ progress })
  const setPhase = (phase: OperationSnapshot['phase']) => update({ phase })
  const setNotice = (notice: OperationSnapshot['notice']) => update({ notice })
  const setErrorCode = (errorCode: string) => update({ errorCode })

  async function readback() {
    if (disposed) return undefined
    setPhase('readback')
    await controller.refresh(true)
    if (disposed) return undefined
    const { catalogue, catalogueNotice } = controller.getSnapshot()
    return catalogueNotice ? undefined : catalogue
  }

  async function run(next: Action) {
    if (disposed || operation || controller.getSnapshot().saving) return
    const abort = new AbortController()
    operation = abort
    update({ action: next, notice: undefined, errorCode: '', progress: undefined, phase: undefined })
    const signal = abort.signal
    function publish(message: Notice) {
      setNotice({ message, target: 'choice' in next ? next.choice : undefined })
    }
    try {
      if (next.kind === 'export') {
        const archive = await api.export(next.choice, next, signal)
        signal.throwIfAborted()
        const status = await download(archive, next.choice.manifest.id + '.dshskin.zip')
        publish(t => t(status === 'saved' ? 'package.exportSaved' : status === 'cancelled' ? 'package.exportCancelled' : 'package.prepared'))
      } else if (next.kind === 'remove') {
        const { removed } = await api.remove(next.choice, signal)
        const catalogue = await readback()
        if (disposed) return
        const state = controller.getSnapshot()
        const verified = catalogue && state.saved && state.saved.skinId !== removed && !catalogue.skins.some(item => item.manifest.id === removed)
        publish(t => t(verified ? 'package.removed' : 'package.confirmByReload'))
      } else if (next.kind === 'rollback') {
        const result = await api.rollback(next.choice, signal)
        await showVersion(result, 'package.rolledBack')
      } else if ('file' in next) {
        const { file } = next
        const report = (received: number) => setProgress({ received, total: file.size, filename: file.name })
        report(0)
        if (next.kind === 'import') {
          const { skinId } = await api.import(file, signal, report)
          const catalogue = await readback()
          const verified = catalogue?.skins.some(item => item.manifest.id === skinId && item.managed)
          if (verified && !signal.aborted && !disposed) next.onInstalled?.(skinId)
          publish(t => t(verified ? 'package.installed' : 'package.confirmByReload'))
        } else {
          await showVersion(await api.update(next.choice, file, signal, report), 'package.updated')
        }
      }
    } catch (error) {
      if (disposed) return
      const detail = error instanceof Error ? error.message : ''
      const catalogue = next.kind !== 'export' ? await readback() : undefined
      if (/^[a-z][a-z0-9-]{1,79}$/.test(detail)) setErrorCode(detail)
      const fallback = next.kind === 'import' ? 'package.importFailed' : 'error.package'
      publish(t => signal.aborted && !catalogue
        ? t('error.cancelUncertain') : settingsError(t, detail, fallback))
    } finally {
      operation = undefined
      update({ action: undefined, progress: undefined, phase: undefined })
    }

    async function showVersion(result: { skinId: string; revision: string; version: string }, key: 'package.updated' | 'package.rolledBack') {
      const catalogue = await readback()
      const visible = catalogue?.skins.find(item => item.manifest.id === result.skinId)
      publish(t => t(visible?.revision === result.revision ? key : 'package.reloadToConfirm',
        { version: result.version }))
    }
  }

  function cancel() {
    if (disposed || !operation || !state.progress || state.phase) return
    setPhase('cancelling')
    operation.abort()
  }

  return {
    run, cancel,
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      if (disposed) return () => {}
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    dispose() {
      if (disposed) return
      disposed = true
      operation?.abort()
      operation = undefined
      state = { errorCode: '' }
      listeners.clear()
    },
  }
}

export type PackageOperationsStore = ReturnType<typeof createPackageOperations>

export function usePackageOperations(store: PackageOperationsStore) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)
  return { ...snapshot, run: store.run, cancel: store.cancel }
}

export type PackageOperations = ReturnType<typeof usePackageOperations>
