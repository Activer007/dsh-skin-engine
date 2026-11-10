const skinSignal = 'data-dsh-skin'
const legacySignals = ['data-dsh-maid-atelier', 'data-dsh-orca-link']
const wallpaperSignal = 'data-we-wallpaper'

export function appearanceConflict(document: Document): string | undefined {
  if (document.documentElement.hasAttribute(skinSignal)
    || legacySignals.some(signal => document.body.hasAttribute(signal))) {
    return 'Another skin owns the appearance.'
  }
  if (document.body.hasAttribute(wallpaperSignal)) {
    return 'Wallpaper Engine owns the backdrop.'
  }
}

export function observeAppearance(document: Document, observer: MutationObserver, scopeAttribute: string): void {
  observer.observe(document.documentElement, { attributeFilter: [skinSignal, scopeAttribute] })
  observer.observe(document.body, { attributeFilter: [...legacySignals, wallpaperSignal] })
}
