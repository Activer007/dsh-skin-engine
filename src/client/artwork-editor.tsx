import { useLayoutEffect, useRef, useState } from 'react'
import { artworkAssetPattern, artworkDefaults, artworkUrl, portraitSkinIds, USER_ARTWORK_LIMIT, USER_ARTWORK_PATH } from '../shared/user-artwork.js'
import { samePreferences } from '../shared/preferences.js'
import type { SkinEditor } from './skin-editor.js'
import type { TranslateSettings } from './settings-copy.js'

const labels = { x: 'artworkX', y: 'artworkY', scale: 'artworkScale', opacity: 'artworkOpacity' } as const

/** Uses the existing appearance draft/apply/preview lifecycle; never edits the built-in package. */
export function ArtworkEditor({ id, editor, t }: { id: string; editor: SkinEditor; t: TranslateSettings }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [missingAsset, setMissingAsset] = useState<string>()
  const latest = useRef(editor)
  latest.current = editor
  const operation = useRef<AbortController | undefined>(undefined)
  useLayoutEffect(() => () => { operation.current?.abort() }, [id])
  if (!portraitSkinIds.includes(id)) return null
  const current = editor.values.artwork
  async function choose(file: File | undefined) {
    if (!file) return
    operation.current?.abort()
    const request = new AbortController()
    operation.current = request
    const originalValues = editor.values
    const originalDraft = editor.draft
    const originalRevision = editor.profileRevision
    const originalPackage = editor.packageRevision
    setBusy(true); setError('')
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || !file.size || file.size > USER_ARTWORK_LIMIT) {
        throw new Error(t('artworkInvalid'))
      }
      // Decode before storing, checking dimensions and malformed image content in the browser too.
      const url = URL.createObjectURL(file)
      try {
        const image = new Image()
        image.src = url
        await Promise.race([image.decode(), new Promise<never>((_, reject) => {
          const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10_000)])
          signal.addEventListener('abort', () => reject(new Error(t('artworkFailed'))), { once: true })
        })])
        if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth > 4096 || image.naturalHeight > 4096
          || image.naturalWidth * image.naturalHeight > 8 * 1024 * 1024) throw new Error(t('artworkDimensions'))
      } finally { URL.revokeObjectURL(url) }
      request.signal.throwIfAborted()
      const response = await fetch(new URL(USER_ARTWORK_PATH, document.baseURI), { method: 'POST', body: file,
        headers: { 'content-type': file.type }, signal: AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]) })
      const result = await response.json() as { asset?: string; error?: string }
      if (!response.ok || !result.asset || !artworkAssetPattern.test(result.asset)) throw new Error(result.error === 'artwork-storage-full'
        ? t('artworkFull') : t('artworkFailed'))
      request.signal.throwIfAborted()
      const active = latest.current
      if (active.disabled || active.stale || !samePreferences(active.values, originalValues) || active.draft !== originalDraft
        || active.profileRevision !== originalRevision || active.packageRevision !== originalPackage) {
        throw new Error(t('artworkChanged'))
      }
      active.edit({ ...active.values, artwork: { ...artworkDefaults, asset: result.asset } })
    } catch (failure) {
      if (!request.signal.aborted) setError(failure instanceof Error && !(failure instanceof DOMException)
        ? failure.message : t('artworkInvalid'))
    } finally {
      if (operation.current === request) {
        operation.current = undefined
        if (!request.signal.aborted) setBusy(false)
      }
    }
  }
  return <fieldset disabled={editor.disabled || editor.stale} className="dsh-skin-disclosure dsh-skin-artwork-editor">
    <legend>{t('artworkTitle')}</legend>
    <p className="dsh-skin-muted">{t('artworkStorage')}</p>
    <label>{t('artworkChoose')} <input type="file" disabled={busy} accept="image/png,image/jpeg,image/webp" onChange={event => {
      const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void choose(file)
    }} /></label>
    {busy ? <div className="dsh-skin-actions">
      <p role="status">{t('artworkUploading')}</p>
      <button type="button" onClick={() => {
        operation.current?.abort()
        operation.current = undefined
        setBusy(false)
      }}>{t('artworkCancel')}</button>
    </div> : null}
    {error ? <p role="alert">{error}</p> : null}
    {current ? <>
      {missingAsset === current.asset ? <p role="status">{t('artworkMissing')}</p> : <div className="dsh-skin-user-artwork-preview">
        <img key={current.asset} alt={t('artworkPreview')} src={artworkUrl(current.asset)} onError={() => setMissingAsset(current.asset)}
          style={{ objectFit: current.fit,
          objectPosition: `${current.x}% ${current.y}%`, transform: `scale(${current.scale})`, opacity: current.opacity }} />
      </div>}
      <label>{t('artworkFit')} <select value={current.fit} onChange={event => editor.edit({ ...editor.values,
        artwork: { ...current, fit: event.currentTarget.value as 'contain' | 'cover' } })}>
        <option value="contain">{t('artworkContain')}</option><option value="cover">{t('artworkCover')}</option>
      </select></label>
      <div className="dsh-skin-fields">{(['x', 'y', 'scale', 'opacity'] as const).map(key => <label key={key}>
        {t(labels[key])} {current[key]}
        <input type="range" min={key === 'scale' ? 0.5 : 0} max={key === 'scale' ? 2 : key === 'opacity' ? 0.5 : 100}
          step={key === 'x' || key === 'y' ? 1 : 0.01} value={current[key]} onChange={event => editor.edit({ ...editor.values,
            artwork: { ...current, [key]: Number(event.currentTarget.value) } })} />
      </label>)}</div>
      <button type="button" onClick={() => { const { artwork: _artwork, ...rest } = editor.values; editor.edit(rest) }}>{t('artworkReset')}</button>
    </> : <p>{t('artworkBuiltIn')}</p>}
  </fieldset>
}
