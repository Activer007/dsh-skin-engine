import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import type { SkinSelection } from '../shared/skins.js'
import type { PackageOperationsStore } from './package-operations.js'
import type { TranslateSettings } from './settings-copy.js'
import type { createSkinSwitch } from './skin-switch.js'

type Selection = Pick<SkinSelection, 'skinId' | 'revision'>

function matches(selection: Selection | null, confirmation: Selection) {
  return selection?.skinId === confirmation.skinId && selection.revision === confirmation.revision
}

export function RestoreDefault({ controller, packageOperations, t }: {
  controller: ReturnType<typeof createSkinSwitch>
  packageOperations: PackageOperationsStore
  t: TranslateSettings
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const { action } = useSyncExternalStore(packageOperations.subscribe, packageOperations.getSnapshot)
  const [confirmation, setConfirmation] = useState<Selection>()
  const [message, setMessage] = useState<'defaultRestored' | 'restoreSelectionChanged'>()
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const group = useRef<HTMLDivElement>(null)
  const status = useRef<HTMLParagraphElement>(null)
  const canRestore = !!state.saved?.skinId && !state.pending && !state.saving && !action

  useEffect(() => {
    if (confirmation) cancel.current?.focus()
  }, [confirmation])

  useEffect(() => {
    if (confirmation && !matches(state.saved, confirmation)) {
      if (group.current?.contains(document.activeElement)) status.current?.focus()
      setConfirmation(undefined)
      setMessage('restoreSelectionChanged')
    }
  }, [confirmation, state.saved])

  function dismiss() {
    if (trigger.current?.disabled) status.current?.focus()
    else trigger.current?.focus()
    setConfirmation(undefined)
  }

  function currentSelection() {
    const { saved, pending, saving } = controller.getSnapshot()
    return saved?.skinId && !pending && !saving && !packageOperations.getSnapshot().action ? saved : null
  }

  async function restore() {
    const saved = currentSelection()
    if (!confirmation || !saved || !matches(saved, confirmation)) return
    status.current?.focus()
    setConfirmation(undefined)
    setMessage(undefined)
    if (await controller.apply(null)) {
      setMessage('defaultRestored')
    } else if (document.activeElement === status.current && !trigger.current?.disabled) {
      trigger.current?.focus()
    }
  }

  return <div className="dsh-skin-restore">
    <button type="button" ref={trigger} disabled={!canRestore} aria-expanded={Boolean(confirmation)} aria-controls={id}
      onClick={() => {
        const saved = currentSelection()
        if (!saved) return
        if (confirmation) { dismiss(); return }
        setMessage(undefined)
        setConfirmation({ skinId: saved.skinId, revision: saved.revision })
      }}>{t('restoreDefault')}</button>
    <div ref={group} id={id} className="dsh-skin-confirmation" role="group" aria-label={t('restoreDefault')}
      aria-describedby={id + '-warning'} hidden={!confirmation}
      onKeyDown={event => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
        dismiss()
      }}>
      {confirmation ? <>
        <p id={id + '-warning'}>{t('restoreDefaultWarning')}</p>
        <div className="dsh-skin-actions">
          <button type="button" ref={cancel} onClick={dismiss}>{t('keepSelection')}</button>
          <button type="button" className="dsh-skin-primary" disabled={!canRestore || !matches(state.saved, confirmation)}
            onClick={() => void restore()}>{t('confirmRestoreDefault')}</button>
        </div>
      </> : null}
    </div>
    <p ref={status} tabIndex={-1} role="status" aria-label={t('restoreDefault')}>
      {message && (message !== 'defaultRestored' || state.saved?.skinId === null) ? t(message) : ''}
    </p>
  </div>
}
