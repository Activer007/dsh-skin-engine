import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { build } from 'esbuild'

const root = fileURLToPath(new URL('../', import.meta.url))
const { outputFiles: [module] } = await build({
  stdin: { contents: `export { createEffectsRuntime, SIDEBAR_EFFECTS_KEY } from './src/client/effects/p0.ts';
    export { parseSkinEffects } from './src/core/effects.ts';`, resolveDir: root },
  define: { CSS_EFFECTS_STYLES: JSON.stringify(readFileSync(new URL('../src/client/effects/p0.css', import.meta.url), 'utf8')) },
  write: false, bundle: true, format: 'esm',
})
const { createEffectsRuntime, SIDEBAR_EFFECTS_KEY, parseSkinEffects } = await import(
  `data:text/javascript;base64,${Buffer.from(module.contents).toString('base64')}`)
const effects = parseSkinEffects({ schema: 'dsh.effects/v1', effects: [
  { id: 'ambient.aurora', enabled: true, renderer: 'css', params: {} },
] }, ['effects:css']).effects

function fixture(storage = new Map(), selectedEffects = effects) {
  const styles = { backgroundColor: 'rgba(0, 0, 0, 0)', backgroundImage: 'none', isolation: 'auto', zIndex: 'auto',
    opacity: '1', transform: 'none', filter: 'none', backdropFilter: 'none', contain: 'none', position: 'static' }
  const observers = new Set()
  const media = new Map()
  class Element {
    children = []; attrs = new Map(); selectors = new Map(); hidden = false; sheet = {}; listeners = new Map()
    computed = { ...styles }
    style = { setProperty() {}, removeProperty() {} }
    get firstElementChild() { return this.children[0] }
    get childElementCount() { return this.children.length }
    append(node) { node.remove(); this.children.push(node); node.parentElement = this }
    prepend(node) { node.remove(); this.children.unshift(node); node.parentElement = this }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(x => x !== this); this.parentElement = undefined }
    setAttribute(k, v) { this.attrs.set(k, v) }
    removeAttribute(k) { this.attrs.delete(k) }
    getAttribute(k) { return this.attrs.get(k) ?? null }
    hasAttribute(k) { return this.attrs.has(k) }
    toggleAttribute(k, v) { if (v) this.attrs.set(k, ''); else this.attrs.delete(k) }
    querySelector(s) { return this.selectors.get(s)?.[0] }
    querySelectorAll(s) { return this.selectors.get(s) ?? [] }
    addEventListener(k, f) { this.listeners.set(k, f) }
    removeEventListener(k) { this.listeners.delete(k) }
  }
  const document = new Element()
  const make = () => { const node = new Element(); node.ownerDocument = document; return node }
  const nodes = Object.fromEntries(['root', 'rootSlot', 'frame', 'sidebar', 'sidebarSlot', 'sidebarContent',
    'center', 'main', 'mainSlot', 'conversationSlot', 'conversation', 'content'].map(name => [name, make()]))
  const { root, rootSlot, frame, sidebar, sidebarSlot, sidebarContent, center, main, mainSlot,
    conversationSlot, conversation, content } = nodes
  document.head = make(); document.body = make(); document.documentElement = make(); document.visibilityState = 'visible'
  document.createElement = make
  document.selectors.set('body > #root', [root])
  for (const [a, b] of [[document.body, root], [root, rootSlot], [rootSlot, frame], [frame, sidebar], [sidebar, sidebarSlot],
    [sidebarSlot, sidebarContent], [frame, center], [center, main], [main, mainSlot], [mainSlot, conversationSlot],
    [conversationSlot, conversation], [conversation, content]]) a.append(b)
  root.selectors.set(':scope > [data-slot="root"]', [rootSlot])
  rootSlot.selectors.set('[data-slot="sidebar"]', [sidebarSlot])
  main.selectors.set(':scope > [data-slot="main"]', [mainSlot])
  mainSlot.selectors.set(':scope > [data-slot="main.conversation"]', [conversationSlot])
  conversationSlot.selectors.set(':scope > [data-phase] > [data-conversation-content][data-conversation-region="chat"]', [content])
  Object.assign(frame.computed, { display: 'grid', position: 'relative' })
  Object.assign(sidebar.computed, { gridColumnStart: '1', gridRowStart: '1', gridColumnEnd: 'auto', gridRowEnd: 'auto' })
  Object.assign(center.computed, { display: 'flex', gridColumnStart: '2', gridRowStart: '1' })
  const view = document.defaultView = {
    localStorage: storage && { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
    getComputedStyle: n => n.computed, CSS: { supports: () => true }, console,
    MutationObserver: class { constructor(fn) { this.fn = fn; observers.add(this) } observe() {} disconnect() {} },
    performance: { now: () => 0 }, requestAnimationFrame: () => 1, cancelAnimationFrame() {}, setTimeout: () => 1, clearTimeout() {},
    matchMedia(query) {
      if (!media.has(query)) media.set(query, { matches: false, listeners: new Set(),
        addEventListener(_k, f) { this.listeners.add(f) }, removeEventListener(_k, f) { this.listeners.delete(f) } })
      return media.get(query)
    },
  }
  function changeMedia(query, matches) { const m = view.matchMedia(query); m.matches = matches; for (const f of m.listeners) f() }
  const runtime = createEffectsRuntime(document)
  const release = runtime.mount(selectedEffects)
  const layers = () => frame.children.filter(n => n.getAttribute('data-dsh-skin-effect-layer') === 'glass')
  const scenes = () => document.body.children.filter(n => n.hasAttribute('data-dsh-skin-effect-scene'))
  return { document, nodes, runtime, release, layers, scenes, changeMedia, storage,
    mutate() { for (const observer of observers) observer.fn() } }
}

test('opt-in shares one scene, covers collapsed/global sidebar, and restores every mark', () => {
  const f = fixture()
  const { frame, sidebar, sidebarContent, center, main } = f.nodes
  assert.equal(f.runtime.getSidebarEffects(), false)
  assert.equal(f.scenes().length, 1)
  assert.equal(f.layers().length, 0)
  f.runtime.setSidebarEffects(true)
  assert.equal(f.layers().length, 1)
  assert.equal(sidebar.getAttribute('data-dsh-skin-effect-surface'), 'glass')
  assert.equal(sidebarContent.getAttribute('data-dsh-skin-effect-surface'), 'glass-content')
  assert(f.layers()[0].hasAttribute('data-dsh-skin-sidebar-effects'))
  frame.setAttribute('data-sidebar-collapsed', '')
  main.setAttribute('data-global-panel', 'appearance')
  f.mutate()
  assert.equal(f.scenes().length, 1)
  assert.equal(f.scenes()[0].hidden, false)
  assert.equal(f.layers()[0].hidden, false)
  assert.equal(center.getAttribute('data-dsh-skin-effect-surface'), null)
  assert.equal(main.getAttribute('data-dsh-skin-effect-surface'), null)
  for (let i = 0; i < 3; i++) { f.runtime.setSidebarEffects(false); f.runtime.setSidebarEffects(true) }
  assert.equal(f.layers().length, 1)
  assert.equal(f.scenes().length, 1)
  f.runtime.setSidebarEffects(false)
  assert.equal(f.scenes()[0].hidden, true)
  assert.equal(f.layers().length, 0)
  assert.equal(sidebar.getAttribute('data-dsh-skin-effect-surface'), null)
  assert.equal(frame.getAttribute('data-dsh-skin-effect-surface'), null)
  f.release()
  assert.equal(f.scenes().length, 0)
  assert.equal(f.document.head.children.length, 0)
})

test('sidebar extension respects off/economy, accessibility and incompatible layouts', () => {
  const f = fixture()
  f.nodes.main.setAttribute('data-global-panel', 'appearance')
  f.runtime.setSidebarEffects(true)
  for (const query of ['(prefers-reduced-transparency: reduce)', '(forced-colors: active)']) {
    f.changeMedia(query, true)
    assert.equal(f.layers().length, 0)
    assert.equal(f.scenes()[0].hidden, true)
    f.changeMedia(query, false)
    assert.equal(f.layers().length, 1)
  }
  for (const mode of ['off', 'economy']) {
    f.runtime.setMode(mode)
    assert.equal(f.layers().length, 0)
    f.runtime.setMode('dynamic')
    assert.equal(f.layers().length, 1)
  }
  f.runtime.setMode('static')
  assert.equal(f.scenes()[0].getAttribute('data-dsh-skin-effect-scene'), 'static')
  f.runtime.setMode('dynamic')
  f.nodes.frame.setAttribute('data-sidebar-drawer', '')
  f.mutate()
  assert.equal(f.nodes.sidebar.getAttribute('data-dsh-skin-effect-surface'), null)
  assert.equal(f.scenes()[0].hidden, true)
  f.nodes.frame.removeAttribute('data-sidebar-drawer')
  f.nodes.sidebar.computed.backgroundImage = 'url(owned-by-host)'
  f.mutate()
  assert.equal(f.scenes()[0].hidden, true)
  f.release()
})

test('sidebar preference persists independently of skins, and safely handles unavailable storage', () => {
  const store = new Map()
  const first = fixture(store)
  first.runtime.setSidebarEffects(true)
  assert.equal(store.get(SIDEBAR_EFFECTS_KEY), 'true')
  first.release()
  const second = fixture(store)
  assert.equal(second.runtime.getSidebarEffects(), true)
  assert.equal(second.layers().length, 1)
  second.runtime.setSidebarEffects(false)
  second.release()
  assert.equal(store.get(SIDEBAR_EFFECTS_KEY), 'false')
  const unavailable = fixture(undefined)
  Object.defineProperty(unavailable.document.defaultView, 'localStorage', { get() { throw Error('denied') } })
  const runtime = createEffectsRuntime(unavailable.document)
  runtime.setSidebarEffects(true)
  assert.equal(runtime.getSidebarEffects(), true)
  assert.equal(runtime.getSidebarEffectsPersistent(), false)
  unavailable.release()
})


test('liquid glass shares its layer with the extension and restores original ownership', () => {
  const glass = parseSkinEffects({ schema: 'dsh.effects/v1', effects: [
    { id: 'glass.liquid', enabled: true, renderer: 'css', params: {} },
  ] }, ['effects:css']).effects
  const f = fixture(new Map(), [...glass, ...effects])
  assert.equal(f.layers().length, 1)
  const original = f.layers()[0]
  for (let i = 0; i < 4; i++) {
    f.runtime.setSidebarEffects(true)
    assert.equal(f.layers().length, 1)
    assert.equal(f.layers()[0], original)
    assert(original.hasAttribute('data-dsh-skin-sidebar-effects'))
    f.runtime.setSidebarEffects(false)
    assert.equal(f.layers().length, 1)
    assert(!original.hasAttribute('data-dsh-skin-sidebar-effects'))
    assert(!original.hasAttribute('data-dsh-skin-glass-fallback'))
    assert.equal(original.hidden, false)
  }
  f.runtime.setSidebarEffects(true)
  f.release()
  assert.equal(f.layers().length, 0)
  assert.equal(f.nodes.sidebar.getAttribute('data-dsh-skin-effect-surface'), null)
})

test('write failure keeps the active choice and reports session-only persistence', () => {
  const f = fixture({ get: () => null, set: () => { throw Error('quota') } })
  f.runtime.setSidebarEffects(true)
  assert.equal(f.runtime.getSidebarEffects(), true)
  assert.equal(f.runtime.getSidebarEffectsPersistent(), false)
  assert.equal(f.layers().length, 1)
  f.release()
})
