import { useEffect, useRef, useState } from 'react'
import { artworkUrl, type UserArtworkLibrary } from '../shared/user-artwork.js'
import type { createAppearanceSession } from './appearance-session.js'
import type { TranslateSettings } from './settings-copy.js'
import { skinApi } from './skin-api.js'

interface ArtworkLibraryProps {
  session: ReturnType<typeof createAppearanceSession>
  busy: boolean
  t: TranslateSettings
  name(id: string): string
}

export function ArtworkLibrary(props: ArtworkLibraryProps) {
  const [open, setOpen] = useState(false)
  return <details className="dsh-skin-disclosure" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{props.t('artworkLibrary')}</summary>
    {open ? <ArtworkLibraryContents {...props} /> : null}
  </details>
}

function ArtworkLibraryContents({ session, busy, t, name }: ArtworkLibraryProps) {
  const [library, setLibrary] = useState<UserArtworkLibrary>()
  const [refresh, setRefresh] = useState(0)
  const [loading, setLoading] = useState(true)
  const [confirm, setConfirm] = useState<string>()
  const [removing, setRemoving] = useState(false)
  const [message, setMessage] = useState<'artworkLibraryUnavailable' | 'artworkRemoveFailed' | 'artworkInUse' | 'artworkRemoved'>()
  const removal = useRef<AbortController | undefined>(undefined)
  const refreshButton = useRef<HTMLButtonElement>(null)
  const confirmButton = useRef<HTMLButtonElement>(null)
  const number = new Intl.NumberFormat(document.documentElement.lang || 'en')
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    void skinApi.artworkLibrary(controller.signal).then(result => {
      if (!controller.signal.aborted) setLibrary(result)
    }).catch(() => {
      if (!controller.signal.aborted) {
        setLibrary(undefined)
        setMessage('artworkLibraryUnavailable')
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [refresh])
  useEffect(() => () => removal.current?.abort(), [])
  useEffect(() => { if (confirm) confirmButton.current?.focus() }, [confirm])

  function canRemove(image: UserArtworkLibrary['images'][number]) {
    return !busy && !loading && !removing && !image.references.length && !session.usesArtwork(image.asset)
  }

  async function remove(image: UserArtworkLibrary['images'][number]) {
    if (confirm !== image.asset || !canRemove(image) || removal.current) return
    const controller = new AbortController()
    removal.current = controller
    setRemoving(true)
    setMessage(undefined)
    try {
      const result = await skinApi.removeArtwork(image.asset, controller.signal)
      if (controller.signal.aborted) return
      setLibrary(result)
      setMessage('artworkRemoved')
    } catch (error) {
      if (controller.signal.aborted) return
      setMessage(error instanceof Error && error.message === 'artwork-in-use' ? 'artworkInUse' : 'artworkRemoveFailed')
      setRefresh(value => value + 1)
    } finally {
      removal.current = undefined
      if (!controller.signal.aborted) {
        setRemoving(false)
        setConfirm(undefined)
        requestAnimationFrame(() => refreshButton.current?.focus())
      }
    }
  }

  return <>
    <div className="dsh-skin-actions">
      <button ref={refreshButton} type="button" disabled={loading || removing || !!confirm} onClick={() => {
        setMessage(undefined)
        setRefresh(value => value + 1)
      }}>{t('artworkLibraryRefresh')}</button>
      {library ? <span>{t('artworkQuota', { count: number.format(library.count), limit: number.format(library.limit),
        bytes: number.format(library.bytes) })}</span> : null}
    </div>
    {loading ? <p role="status">{t('loading')}</p> : null}
    {message ? <p role={message === 'artworkRemoved' ? 'status' : 'alert'}>{t(message)}</p> : null}
    {library && !library.count ? <p>{t('artworkLibraryEmpty')}</p> : null}
    {library && library.count > library.images.length ? <p>{t('artworkLibraryUnavailableFiles')}</p> : null}
    {library?.images.length ? <ul className="dsh-skin-artwork-library-list">
      {library.images.map(image => {
        const draft = session.usesArtwork(image.asset)
        const label = image.asset.slice(0, 12)
        return <li key={image.asset}>
          <img src={artworkUrl(image.asset)} alt="" loading="lazy" decoding="async" />
          <div>
            <strong title={image.asset}>{label}</strong> · {t('artworkBytes', { bytes: number.format(image.bytes) })}
            <div className="dsh-skin-muted">{image.references.length
              ? t('artworkReferenced', { names: image.references.map(name).join(', ') })
              : draft ? t('artworkDraftReference') : t('artworkUnreferenced')}</div>
          </div>
          <button type="button" disabled={!canRemove(image) || !!confirm} aria-label={t('artworkRemoveNamed', { name: label })}
            onClick={() => { setMessage(undefined); setConfirm(image.asset) }}>{t('artworkRemove')}</button>
          {confirm === image.asset ? <div className="dsh-skin-artwork-confirm">
            <p>{t('artworkConfirmRemove')}</p>
            <div className="dsh-skin-actions">
              <button ref={confirmButton} type="button" disabled={removing} onClick={() => {
                setConfirm(undefined)
                requestAnimationFrame(() => refreshButton.current?.focus())
              }}>{t('artworkCancelRemove')}</button>
              <button type="button" disabled={!canRemove(image)} onClick={() => void remove(image)}>{t('artworkConfirmButton')}</button>
            </div>
          </div> : null}
        </li>
      })}
    </ul> : null}
  </>
}
