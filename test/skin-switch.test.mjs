import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const choices = ['a', 'b'].map(id => ({
  manifest: { id, name: id.toUpperCase(), colorScheme: 'dark' }, source: 'built-in', revision: id,
  dataUrl: `api/fixture/${id}`, compatibility: null,
}))

function dataFor(choice) {
  const color = choice.manifest.id === 'a' ? '#0b1220' : '#080f1c'
  return { source: 'built-in', manifest: choice.manifest, tokens: { colors: { canvas: color, surface: '#19283a' } }, effects: [] }
}

async function clientArtifact(globals = {}) {
  let registered
  const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  vm.runInNewContext(source, {
    AbortController, AbortSignal, URL, Error, clearTimeout, setTimeout, queueMicrotask,
    __ModuleLoader__: { load(entry) { registered = entry } }, ...globals,
  })
  assert.equal(registered.id, 'dsh-plugin-skin-engine')
  const require = id => {
    assert(['react', 'react/jsx-runtime'].includes(id), id)
    return {}
  }
  require.asset = path => {
    assert.match(path, /^plugins\/dsh-plugin-skin-engine\/assets\/probe-[a-f0-9]{12}\.svg$/)
    return path
  }
  return registered.factory(require)
}

async function switchFixture({ initial = null, previewMs, prepare, onMount, onSave, switchAppearance = () => undefined,
  catalogue = () => choices, getColorScheme = () => 'dark', globals } = {}) {
  const { createSkinSwitch } = await clientArtifact(globals)
  let disk = { skinId: initial, revision: 0 }
  let visual = null
  const writes = []
  const mounts = []
  const api = {
    async catalogue() { return { skins: catalogue(), issues: [], placeholderUrl: 'placeholder.svg' } },
    async read() { return disk },
    async load(choice, signal) { return prepare ? prepare(choice, signal) : dataFor(choice) },
    async save(choice, expected, _signal, preferences) {
      writes.push(choice?.manifest.id ?? null)
      const next = { ...disk, skinId: choice?.manifest.id ?? null, revision: expected + 1 }
      if (choice && preferences !== undefined) {
        next.preferences = { ...next.preferences }
        if (preferences) next.preferences[choice.manifest.id] = preferences
        else delete next.preferences[choice.manifest.id]
      }
      const commit = () => { disk = next; return disk }
      return onSave ? onSave(choice, commit, expected) : commit()
    },
  }
  const controller = createSkinSwitch({
    api, previewMs, getColorScheme, blockReason() {}, switchAppearance,
    mount({ preferences }, data, artwork) {
      const id = data.manifest.id
      onMount?.(id, data, preferences, artwork)
      assert.equal(visual, null)
      visual = id
      mounts.push(id)
      return {
        update(next, art) { onMount?.(id, next, preferences, art) },
        release() { assert.equal(visual, id); visual = null },
      }
    },
  })
  await controller.refresh()
  return { controller, writes, mounts, visual: () => visual, disk: () => disk, change(selection) { disk = selection } }
}

test('preview stays window-local and cancellation or expiry reads the authoritative saved skin', async t => {
  const { controller, writes, visual, disk, change } = await switchFixture({ previewMs: 25 })
  t.after(() => controller.dispose())
  await controller.preview('a')
  assert.equal(visual(), 'a')
  assert.deepEqual(disk(), { skinId: null, revision: 0 })
  await controller.cancelPreview()
  assert.equal(visual(), null)
  await controller.apply('a')
  assert.deepEqual(writes, ['a'])
  await controller.preview('b')
  assert.equal(visual(), 'b')
  const expired = Promise.withResolvers()
  const unsubscribe = controller.subscribe(() => {
    const state = controller.getSnapshot()
    if (state.pending === null && state.preview === null) expired.resolve()
  })
  await expired.promise
  unsubscribe()
  assert.equal(visual(), 'a')
  await controller.preview('b')
  change({ skinId: null, revision: 2 })
  await controller.cancelPreview()
  assert.equal(visual(), null)
  assert.deepEqual(writes, ['a'])
})

test('catalogue refresh preserves the mounted revision and adopts a real package update', async t => {
  let revision = 'a'
  let loads = 0
  const { controller, mounts, visual } = await switchFixture({
    initial: 'a',
    catalogue: () => [{ ...choices[0], revision }],
    prepare(choice) { loads++; return dataFor(choice) },
  })
  t.after(() => controller.dispose())

  await controller.refresh(true)
  assert.equal(visual(), 'a')
  assert.equal(loads, 1)
  assert.deepEqual(mounts, ['a'])
  revision = 'updated'
  await controller.refresh(true)
  assert.equal(visual(), 'a')
  assert.equal(loads, 2)
  assert.deepEqual(mounts, ['a', 'a'])
})

test('late A → B → A loads and a response after disposal cannot replace the latest activation', async t => {
  let delayed = Promise.withResolvers()
  const { controller, visual, mounts } = await switchFixture({
    prepare: choice => choice.manifest.id === 'b' ? delayed.promise : dataFor(choice),
  })
  t.after(() => controller.dispose())
  await controller.preview('a')
  const stale = controller.preview('b')
  await controller.preview('a')
  delayed.resolve(dataFor(choices[1]))
  await stale
  assert.equal(visual(), 'a')
  assert(!mounts.includes('b'))
  delayed = Promise.withResolvers()
  const unloaded = controller.apply('b')
  controller.dispose()
  delayed.resolve(dataFor(choices[1]))
  await unloaded
  assert.equal(visual(), null)
  assert(!mounts.includes('b'))
})

test('mount and write failures restore the saved skin, including lost successful responses', async t => {
  let failMount = false
  let failRestore = false
  let write = 'reject'
  let appearance = 'system'
  const { controller, visual, writes, change } = await switchFixture({
    initial: 'a',
    switchAppearance() {
      const previous = appearance
      appearance = 'dark'
      return () => { appearance = previous }
    },
    onMount(id) {
      if ((failMount && id === 'b') || (failRestore && id === 'a')) throw new Error('Injected mount failure')
    },
    onSave(_choice, commit) {
      if (write === 'lost') commit()
      throw new Error('Injected write failure')
    },
  })
  t.after(() => controller.dispose())
  failMount = true
  await controller.apply('b')
  assert.equal(visual(), 'a')
  assert.equal(appearance, 'system')
  assert.deepEqual(writes, [])
  failRestore = true
  await controller.apply('b')
  assert.equal(visual(), null)
  assert.equal(appearance, 'system')
  failRestore = false
  failMount = false
  await controller.refresh()
  await controller.apply('b')
  assert.equal(visual(), 'a')
  assert.equal(appearance, 'system')
  assert.match(controller.getSnapshot().notice, /Injected write failure/)
  write = 'lost'
  await controller.apply('b')
  assert.equal(visual(), 'b')
  assert.equal(appearance, 'dark')
  assert.equal(controller.getSnapshot().saved.skinId, 'b')
  assert.equal(controller.getSnapshot().notice, '')
  change({ skinId: 'a', revision: 2 })
  await controller.refresh()
  assert.equal(visual(), 'a')
})

test('preference previews are reversible and same-skin write failures reconcile saved overrides', async t => {
  let rendered
  let savedQuality
  let write = 'reject'
  const { controller, disk } = await switchFixture({
    initial: 'a',
    onMount(_id, data, preferences) {
      rendered = data.tokens.colors.canvas
      savedQuality = preferences?.quality
    },
    onSave(_choice, commit) {
      if (write === 'lost') commit()
      throw new Error('Preference write response lost')
    },
  })
  t.after(() => controller.dispose())
  const draft = { revision: 0, value: { quality: 'low', colors: { canvas: '#242832' } } }
  await controller.preview('a', draft)
  assert.equal(rendered, '#242832')
  assert.equal(savedQuality, 'low')
  assert.equal(disk().preferences, undefined)
  await controller.cancelPreview()
  assert.equal(rendered, '#0b1220')
  assert.equal(await controller.apply('a', draft), false)
  assert.equal(rendered, '#0b1220')
  assert.match(controller.getSnapshot().notice, /Preference write response lost/)
  write = 'lost'
  assert.equal(await controller.apply('a', draft), true)
  assert.equal(rendered, '#242832')
  assert.equal(savedQuality, 'low')
  assert.equal(controller.getSnapshot().notice, '')
})

test('dual appearance resolves the latest mode after decoding and preserves the saved skin and preferences', async t => {
  const light = Promise.withResolvers()
  const dark = Promise.withResolvers()
  const decoding = Promise.withResolvers()
  const requested = []
  let missing = false
  class Image {
    removeAttribute() {}
    decode() {
      const path = new URL(this.src).pathname
      requested.push(path)
      if (requested.length === 2) decoding.resolve()
      if (missing && path === '/night.webp') return Promise.reject(new Error('Missing variant asset'))
      return path === '/night.webp' ? dark.promise : light.promise
    }
  }
  const dual = { ...choices[0], manifest: { ...choices[0].manifest, colorScheme: 'both' } }
  let scheme = 'light'
  let visual
  let fail = false
  let failures = 0
  const { controller, disk, writes, change, visual: active } = await switchFixture({
    globals: { Image, document: { baseURI: 'http://skin.test/' } },
    catalogue: () => [dual],
    getColorScheme: () => scheme,
    prepare: choice => ({
      ...dataFor(choice), tokens: { colors: { canvas: '#f8f8f8', surface: '#efe9e1', accent: '#844f81' },
        variants: { dark: { canvas: '#182032', accent: '#88ccff' } } },
      scene: { layout: {} }, sceneArtworkUrl: '/day.webp', sceneArtworkVariants: { dark: '/night.webp' },
    }),
    onMount(_id, data, _preferences, artwork) {
      if (fail && data.tokens.colors.canvas === '#f8f8f8') {
        failures++
        throw new Error('Injected appearance failure')
      }
      visual = [data.tokens.colors.canvas, data.tokens.colors.surface, data.tokens.colors.accent,
        artwork && new URL(artwork.image.src).pathname]
    },
  })
  t.after(() => controller.dispose())
  const original = { skinId: 'a', revision: 5, preferences: { a: { colors: { surface: '#ebe6dd' } } } }
  change(original)
  const refresh = controller.refresh()
  await decoding.promise
  light.resolve()
  scheme = 'dark'
  controller.appearanceChanged()
  dark.resolve()
  await refresh
  assert.deepEqual(visual, ['#182032', '#ebe6dd', '#88ccff', '/night.webp'])
  scheme = 'light'
  controller.appearanceChanged()
  assert.deepEqual(visual, ['#f8f8f8', '#ebe6dd', '#844f81', '/day.webp'])
  scheme = 'dark'
  controller.appearanceChanged()
  assert.deepEqual(visual, ['#182032', '#ebe6dd', '#88ccff', '/night.webp'])
  assert.deepEqual(requested, ['/day.webp', '/night.webp'])
  assert.deepEqual(disk(), original)
  assert.deepEqual(writes, [])
  fail = true
  scheme = 'light'
  controller.appearanceChanged()
  controller.appearanceChanged()
  assert.equal(active(), null)
  assert.equal(failures, 1)
  assert.match(controller.getSnapshot().notice, /Injected appearance failure/)
  scheme = 'dark'
  controller.appearanceChanged()
  assert.equal(active(), 'a')
  assert.deepEqual(disk(), original)
  await controller.apply(null)
  assert.equal(controller.getSnapshot().rendered, null)
  missing = true
  await controller.preview('a')
  assert.equal(active(), 'a')
  assert.deepEqual(visual, ['#182032', '#ebe6dd', '#88ccff', undefined])
  assert.equal(disk().skinId, null)
})

test('client installs the real settings slot and yields without removing foreign marks', async () => {
  const root = new Map()
  const body = new Set()
  const document = {
    baseURI: 'http://skin.test/',
    documentElement: {
      hasAttribute: key => root.has(key), getAttribute: key => root.get(key) ?? null,
      setAttribute: (key, value) => root.set(key, value), removeAttribute: key => root.delete(key),
    },
    body: { hasAttribute: key => body.has(key) },
  }
  let notify
  let observing = false
  class Observer {
    constructor(callback) { notify = callback }
    observe() { observing = true }
    disconnect() { observing = false }
  }
  const data = dataFor(choices[0])
  Object.assign(data.tokens.colors, { surfaceRaised: '#18212c', accent: '#adc5e0', textPrimary: '#f6ead0', textSecondary: '#c0d0e0' })
  const fetch = async url => Response.json(url.pathname.endsWith('/skins') ? { skins: choices, issues: [], placeholderUrl: 'placeholder.svg' }
    : url.pathname.endsWith('/selection') ? { skinId: 'a', revision: 1 }
    : data)
  const window = { addEventListener() {}, removeEventListener() {} }
  const plugin = await clientArtifact({ document, window, fetch, MutationObserver: Observer })
  let cleanup, controller, paletteChange, tokens, presented
  let scheme = 'dark'
  function publishTheme() {
    const snapshot = tokens
    paletteChange()
    presented = snapshot
  }
  plugin.apply({
    effect(setup) { cleanup = setup() },
    on(event, callback) { assert.equal(event, 'theme/change'); paletteChange = callback },
    slots: {
      inject(slot, register) { assert.equal(slot, 'settings.section'); register() },
      register(options) { controller = options.inject().controller },
    },
    theme: {
      getTheme: () => ({ active: { colorScheme: scheme } }),
      overrideTokens(source, value) {
        assert.equal(source, 'dsh-plugin-skin-engine')
        tokens = value
        publishTheme()
        return () => {
          tokens = undefined
          publishTheme()
        }
      },
    },
  })
  try {
    await controller.refresh()
    assert.equal(root.get('data-dsh-skin-id'), 'a')
    assert.deepEqual(Object.keys(tokens).sort(), ['--dsw-alias-bg-base', '--dsw-specific-sidebar-fill'])
    assert.equal(tokens['--dsw-alias-bg-base'].dark, '#0b1220')
    assert.equal(tokens['--dsw-specific-sidebar-fill'].dark, '#19283a')
    for (const marker of ['data-we-wallpaper', 'data-dsh-maid-atelier', 'data-dsh-orca-link']) {
      body.add(marker)
      notify()
      assert.equal(tokens, undefined)
      assert(body.has(marker))
      body.delete(marker)
      notify()
      assert.equal(root.get('data-dsh-skin-id'), 'a')
    }
    scheme = 'light'
    publishTheme()
    await Promise.resolve()
    assert.equal(tokens, undefined)
    assert.equal(presented, undefined)
    assert.equal(controller.getSnapshot().saved.skinId, 'a')
    scheme = 'dark'
    publishTheme()
    await Promise.resolve()
    assert(tokens)
    assert.equal(presented, tokens)
    root.set('data-dsh-skin-id', 'foreign')
    notify()
    assert.equal(tokens, undefined)
  } finally {
    cleanup()
  }
  assert.equal(root.get('data-dsh-skin-id'), 'foreign')
  assert.equal(observing, false)
})
