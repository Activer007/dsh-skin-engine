import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'
import { build } from 'esbuild'
import React from 'react'
import { act, create } from 'react-test-renderer'
const directory = await mkdtemp(new URL('../.gallery-layout-test-', import.meta.url))
let components
try {
  const result = await build({
    stdin: {
      contents: [
        "export { SkinWorkspace } from './src/client/skin-workspace'",
        "export { createAppearanceSession } from './src/client/appearance-session'",
        "export { createGalleryPreferences } from './src/client/gallery-preferences'",
      ].join('\n'),
      resolveDir: fileURLToPath(new URL('../', import.meta.url)),
    },
    bundle: true, write: false, format: 'esm', jsx: 'automatic',
    external: ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives'],
    define: { MANAGER_STYLES: '""', SKIN_ENGINE_VERSION: '"test"' },
  })
  const file = `${directory}/component.mjs`
  await writeFile(file, result.outputFiles[0].text)
  components = await import(pathToFileURL(file).href)
} finally { await rm(directory, { recursive: true, force: true }) }

async function fixture(t, narrow = false) {
  const originals = Object.fromEntries(['document', 'MutationObserver', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, globalThis[key]]))
  let focused, loads = 0
  let root
  globalThis.document = {
    baseURI: 'https://dsh.test/',
    documentElement: { lang: 'en' },
    getElementById: id => ({
      focus() { focused = root.root.find(node => typeof node.type === 'string' && node.props.id === id).props },
    }),
  }
  globalThis.MutationObserver = class { observe() {} disconnect() {} }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const session = components.createAppearanceSession()
  const storage = new Map()
  const gallery = components.createGalleryPreferences({ getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) })
  const choices = [0, 1].map(index => ({
    manifest: {
      id: `example.skin.${index}`, name: `Skin ${index}`, version: '1.0.0', engineApi: '1.0.0', colorScheme: 'dark',
    },
    source: 'built-in', revision: '1', compatibility: null, previews: { dark: '/image.png' },
  }))
  const snapshot = { saved: { skinId: choices[0].manifest.id, revision: 1 }, rendered: choices[0].manifest.id,
    saving: false, pending: null, preview: null, catalogue: { skins: choices, issues: [] } }
  const controller = { getSnapshot: () => snapshot, subscribe: () => () => {}, refresh() {}, getAppearanceBlock() {},
    async loadDetails() { loads++; return { tokens: { color: {} }, effects: [], diagnostics: [] } } }
  const operationsSnapshot = {}
  const packageOperations = { getSnapshot: () => operationsSnapshot, subscribe: () => () => {}, run() {}, cancel() {} }
  t.after(async () => {
    if (root) await act(async () => root.unmount())
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key]
      else globalThis[key] = value
    }
  })
  await act(async () => {
    root = create(React.createElement(components.SkinWorkspace, {
      controller, settingsSession: session, galleryPreferences: gallery, packageOperations, getColorScheme: () => 'dark',
    }), {
      createNodeMock(element) {
        return {
          focus() { focused = element.props },
          getClientRects: () => element.props.className === 'dsh-skin-back' && !narrow ? [] : [{}],
        }
      },
    })
  })
  return { root, session, gallery, choices, focused: () => focused, loads: () => loads }
}

test('U1 independent favorite changes preference without selecting or loading another skin', async t => {
  const f = await fixture(t)
  const before = f.loads()
  await act(async () => f.root.root.findByProps({ 'data-skin-favorite': f.choices[1].manifest.id }).props.onClick())
  assert.equal(f.session.selected, '')
  assert.deepEqual(f.gallery.getSnapshot().favorites, [f.choices[1].manifest.id])
  assert.equal(f.loads(), before)
  const favorite = f.root.root.findByProps({ 'data-skin-favorite': f.choices[1].manifest.id })
  assert.equal(favorite.props['aria-pressed'], true)
  assert.equal(favorite.parent.type, 'li')
})
test('U1 removal from favorites filter sends focus to search and preserves selected detail', async t => {
  const f = await fixture(t)
  await act(async () => { f.gallery.toggleFavorite(f.choices[0].manifest.id); f.session.setView({ favoritesOnly: true }) })
  await act(async () => f.root.root.findByProps({ 'data-skin-favorite': f.choices[0].manifest.id }).props.onClick())
  assert.equal(f.root.root.findAll(node => node.type === 'button' && node.props['data-skin-card']).length, 0)
  assert.equal(f.focused().type, 'search')
  assert.equal(f.root.root.findByProps({ 'data-skin-detail': f.choices[0].manifest.id }).type, 'section')
})
for (const narrow of [true, false]) test(`U1 ${narrow ? 'narrow' : 'wide'} selection focus and return`, async t => {
  const f = await fixture(t, narrow)
  await act(async () => f.root.root.findByProps({ 'data-skin-card': f.choices[1].manifest.id }).props.onClick())
  assert.equal(f.session.selected, f.choices[1].manifest.id)
  assert.equal(f.focused()[narrow ? 'className' : 'data-skin-detail'], narrow ? 'dsh-skin-back' : f.choices[1].manifest.id)
  await act(async () => f.root.root.findByProps({ className: 'dsh-skin-back' }).props.onClick())
  assert.equal(f.focused()['data-skin-card'], f.choices[1].manifest.id)
})
test('U1 renders static lazy-loaded thumbnails and keeps search and favorites outside the disclosure', async t => {
  const f = await fixture(t)
  const cards = f.root.root.findAll(node => node.type === 'button' && node.props['data-skin-card'])
  assert.equal(cards.length, 2)
  assert.equal(f.loads(), 1)
  for (const card of cards) {
    const image = card.findByType('img')
    assert.equal(image.props.loading, 'lazy')
    assert.equal(image.props.width / image.props.height, 16 / 9)
    assert.equal(image.props.src, 'https://dsh.test/image.png')
  }
  const filters = f.root.root.findByProps({ className: 'dsh-skin-filter-options' })
  assert.equal(filters.props.open, undefined)
  assert.equal(filters.findAllByProps({ type: 'search' }).length, 0)
  const labels = filters.findAllByType('label')
  assert(!labels.some(label => label.children.includes('Favorites only')))
})
