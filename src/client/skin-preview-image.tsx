export function SkinPreviewImage({ path, placeholder, alt = '' }: { path: string; placeholder?: string; alt?: string }) {
  return (
    <img className={alt ? 'dsh-skin-large-preview' : undefined} alt={alt} loading="lazy"
      decoding="async" width="320" height="180" src={new URL(path, document.baseURI).href}
      onError={event => {
        if (!placeholder) return
        const fallback = new URL(placeholder, document.baseURI).href
        if (event.currentTarget.src !== fallback) event.currentTarget.src = fallback
      }} />
  )
}
