/** Device/browser UI preferences only; never writes a Host Profile or starts a skin. */
export const GALLERY_PREFERENCES_KEY = 'dsh-skin-engine.gallery.v1'
export type GallerySort = 'default' | 'name' | 'recent'
interface GalleryPreferences { favorites: string[]; recent: string[]; sort: GallerySort }
interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }
const empty = (): GalleryPreferences => ({ favorites: [], recent: [], sort: 'default' })
const validId = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && id.length <= 200
function ids(value: unknown, limit: number): string[] {
  return Array.isArray(value) ? [...new Set(value.filter(validId))].slice(0, limit) : []
}
export function parseGalleryPreferences(value: string | null): GalleryPreferences {
  try {
    if (value && value.length > 128_000) return empty()
    const data = JSON.parse(value ?? 'null')
    if (!data || data.version !== 1) return empty()
    return { favorites: ids(data.favorites, 500), recent: ids(data.recent, 20),
      sort: data.sort === 'name' || data.sort === 'recent' ? data.sort : 'default' }
  } catch { return empty() }
}
export function createGalleryPreferences(storage?: StorageLike) {
  const listeners = new Set<() => void>()
  let persisted = true
  const read = () => {
    try { return parseGalleryPreferences(storage?.getItem(GALLERY_PREFERENCES_KEY) ?? null) }
    catch { persisted = false; return undefined }
  }
  let state = read() ?? empty()
  const publish = () => { for (const listener of listeners) listener() }
  function update(change: (current: GalleryPreferences) => GalleryPreferences) {
    // Merge with the latest browser snapshot, rather than overwriting another tab's changes.
    if (storage && persisted) state = read() ?? state
    state = change(state)
    try {
      if (!storage) throw new Error('Storage unavailable')
      storage.setItem(GALLERY_PREFERENCES_KEY, JSON.stringify({ version: 1, ...state }))
    } catch { persisted = false }
    publish()
  }
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    getSnapshot: () => state,
    get persistent() { return persisted && Boolean(storage) },
    reload() { if (persisted && storage) { state = read() ?? state; publish() } },
    toggleFavorite(id: string) {
      if (!validId(id)) return
      update(current => ({ ...current, favorites: current.favorites.includes(id)
        ? current.favorites.filter(value => value !== id) : [id, ...current.favorites].slice(0, 500) }))
    },
    setSort(sort: GallerySort) {
      if (!['default', 'name', 'recent'].includes(sort)) return
      update(current => ({ ...current, sort }))
    },
    recordApplied(id: string) {
      if (validId(id)) update(current => ({ ...current, recent: [id, ...current.recent.filter(value => value !== id)].slice(0, 20) }))
    },
    clearRecent() { update(current => ({ ...current, recent: [] })) },
  }
}
export type GalleryPreferenceStore = ReturnType<typeof createGalleryPreferences>
export function orderGallery<T extends { manifest: { id: string; name: string; nameEn?: string } }>(
  choices: T[], preferences: GalleryPreferences, language: string, favoritesOnly = false,
): T[] {
  const filtered = choices.filter(item => !favoritesOnly || preferences.favorites.includes(item.manifest.id))
  if (preferences.sort === 'name') {
    const english = /^en(?:-|$)/i.test(language)
    const name = (item: T) => english ? item.manifest.nameEn || item.manifest.name : item.manifest.name
    let collator: Intl.Collator
    try { collator = new Intl.Collator(language || undefined) } catch { collator = new Intl.Collator('en') }
    return filtered.sort((a, b) => collator.compare(name(a), name(b)) || a.manifest.id.localeCompare(b.manifest.id))
  }
  if (preferences.sort === 'recent') {
    const ranks = new Map(preferences.recent.map((id, index) => [id, index]))
    const rank = (id: string) => ranks.get(id) ?? preferences.recent.length
    return filtered.sort((a, b) => rank(a.manifest.id) - rank(b.manifest.id))
  }
  return filtered
}
