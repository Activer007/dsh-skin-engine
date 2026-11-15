import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
const { outputFiles } = await build({ entryPoints: ['src/client/gallery-preferences.ts'], bundle: true, write: false, platform: 'node', format: 'cjs' })
const module = { exports: {} }
new Function('module', 'exports', outputFiles[0].text)(module, module.exports)
const { createGalleryPreferences, parseGalleryPreferences, orderGallery, GALLERY_PREFERENCES_KEY } = module.exports
function memory() { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), values } }
const choices = Array.from({ length: 100 }, (_, i) => ({ manifest: { id: `id-${i}`, name: `皮肤 ${String(99 - i).padStart(3, '0')}`, nameEn: `Skin ${String(99 - i).padStart(3, '0')}` } }))
test('browser preference persistence is UI-only and never changes the catalogue or current skin', () => {
  const storage = memory(), store = createGalleryPreferences(storage)
  store.toggleFavorite('id-5'); store.setSort('recent'); store.recordApplied('id-3')
  const next = createGalleryPreferences(storage)
  assert.deepEqual(next.getSnapshot(), { favorites: ['id-5'], sort: 'recent', recent: ['id-3'] })
  assert.equal([...storage.values.keys()].join(), GALLERY_PREFERENCES_KEY)
  assert.equal(orderGallery(choices, next.getSnapshot(), 'en')[0].manifest.id, 'id-3')
  assert.equal(choices[0].manifest.id, 'id-0')
})
test('10 and 100 package filters/sorts are stable, missing IDs do not create phantom cards', () => {
  for (const count of [10, 100]) {
    const store = createGalleryPreferences(memory()), catalogue = choices.slice(0, count)
    store.toggleFavorite('missing'); store.toggleFavorite('id-4'); store.recordApplied('missing'); store.recordApplied('id-3')
    store.setSort('recent')
    const sorted = orderGallery(catalogue, store.getSnapshot(), 'en')
    assert.equal(sorted.length, count); assert.equal(sorted[0].manifest.id, 'id-3')
    assert.deepEqual(sorted.slice(1).map(i => i.manifest.id), catalogue.filter(i => i.manifest.id !== 'id-3').map(i => i.manifest.id))
    assert.deepEqual(orderGallery(catalogue, store.getSnapshot(), 'en', true).map(i => i.manifest.id), ['id-4'])
    store.setSort('name'); assert.equal(orderGallery(catalogue, store.getSnapshot(), 'en')[0].manifest.id, `id-${count - 1}`)
    store.setSort('default'); assert.deepEqual(orderGallery(catalogue, store.getSnapshot(), 'en'), catalogue)
  }
})
test('history contains unique 20 latest applications; clearing it preserves favorites and sort', () => {
  const store = createGalleryPreferences(memory()); store.toggleFavorite('a'); store.setSort('recent')
  for (let i = 0; i < 30; i++) store.recordApplied(String(i))
  store.recordApplied('20')
  assert.equal(store.getSnapshot().recent.length, 20); assert.equal(store.getSnapshot().recent[0], '20')
  store.clearRecent(); assert.deepEqual(store.getSnapshot(), { favorites: ['a'], recent: [], sort: 'recent' })
})
test('invalid storage, unknown version and malformed IDs fall back safely', () => {
  for (const input of ['{', 'null', '[]', '{"version":2,"favorites":["a"]}']) assert.deepEqual(parseGalleryPreferences(input), { favorites: [], recent: [], sort: 'default' })
  assert.deepEqual(parseGalleryPreferences(JSON.stringify({ version: 1, favorites: ['a', 'a', 3, null, ''], recent: [true, 'b'], sort: 'bad' })), { favorites: ['a'], recent: ['b'], sort: 'default' })
})
test('storage denial falls back to session memory without losing a successful change', () => {
  const store = createGalleryPreferences({ getItem() { throw Error('denied') }, setItem() { throw Error('quota') } })
  store.toggleFavorite('a'); store.recordApplied('b'); store.setSort('name')
  assert.deepEqual(store.getSnapshot(), { favorites: ['a'], recent: ['b'], sort: 'name' }); assert.equal(store.persistent, false)
})
test('sequential changes from another tab are merged, reload is explicit, disposal unsubscribes', () => {
  const storage = memory(), a = createGalleryPreferences(storage), b = createGalleryPreferences(storage)
  a.toggleFavorite('a'); b.toggleFavorite('b'); a.setSort('name'); b.reload()
  assert.deepEqual(b.getSnapshot().favorites, ['b', 'a']); assert.equal(b.getSnapshot().sort, 'name')
  let calls = 0; const stop = b.subscribe(() => calls++); b.reload(); stop(); b.reload(); assert.equal(calls, 1)
})
test('storage becoming unreadable preserves the last in-memory preferences', () => {
  const data = memory(); let denied = false
  const store = createGalleryPreferences({ getItem(key) { if (denied) throw Error('denied'); return data.getItem(key) }, setItem: data.setItem })
  store.toggleFavorite('a'); store.recordApplied('b'); denied = true; store.setSort('name')
  assert.deepEqual(store.getSnapshot(), { favorites: ['a'], recent: ['b'], sort: 'name' })
  assert.equal(store.persistent, false)
})
