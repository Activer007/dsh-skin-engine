import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'

async function load(path) {
  const { outputFiles } = await build({ entryPoints: [path], bundle: true, write: false, platform: 'node', format: 'cjs' })
  const module = { exports: {} }
  new Function('module', 'exports', outputFiles[0].text)(module, module.exports)
  return module.exports
}
const { createAppearanceSession } = await load('src/client/appearance-session.ts')
const { createSettingsSession } = await load('src/client/settings-session.ts')

test('navigation unsubscribe preserves selection, filters, active tab and unapplied draft', () => {
  const session = createAppearanceSession()
  let changes = 0
  const unsubscribe = session.subscribe(() => changes++)
  const draft = { revision: 7, packageRevision: 'package-a', value: { colors: { accent: '#123456' } } }
  session.select('reef')
  session.editEffects('reef')
  session.setView({ activePage: 'effectsPage', query: 'reef', showDetails: true, managedId: 'reef' })
  session.setDraft('reef', draft)
  unsubscribe()
  const snapshot = session.getSnapshot()
  assert.equal(session.getSnapshot(), snapshot)
  assert.equal(session.selected, 'reef')
  assert.equal(session.editingEffects, 'reef')
  assert.equal(session.view.query, 'reef')
  assert.equal(session.view.activePage, 'effectsPage')
  assert.equal(session.getDraft('reef'), draft)
  assert.equal(changes, 4)
  assert.equal('attach' in session, false)
})

test('discarding one draft does not discard other package drafts or change saved revision', () => {
  const session = createAppearanceSession()
  const a = { revision: 2, packageRevision: 'old-a', value: null }
  const b = { revision: 4, packageRevision: 'old-b', value: { quality: 'low' } }
  session.setDraft('a', a)
  session.setDraft('b', b)
  session.setDraft('a', undefined)
  assert.equal(session.getDraft('a'), undefined)
  assert.equal(session.getDraft('b'), b)
  assert.equal(b.revision, 4)
  assert.equal(b.packageRevision, 'old-b')
})

test('settings close discards only its own UI state, main session survives', () => {
  const observers = []
  const previous = globalThis.MutationObserver
  globalThis.MutationObserver = class {
    constructor(callback) { this.callback = callback; observers.push(this) }
    observe() {}
    disconnect() { this.disconnected = true }
  }
  try {
    let closed = 0
    const document = { body: {} }
    const settings = createSettingsSession(document, () => closed++)
    const main = createAppearanceSession()
    const dialog = { isConnected: true, parentElement: {} }
    settings.attach({ closest: () => dialog })
    settings.select('legacy')
    settings.setView({ query: 'legacy' })
    main.select('main')
    main.setView({ query: 'retained' })
    main.setDraft('main', { revision: 1, packageRevision: 'a', value: null })
    dialog.isConnected = false
    observers[0].callback()
    assert.equal(closed, 1)
    assert.equal(settings.selected, '')
    assert.equal(settings.view.query, '')
    assert.equal(main.selected, 'main')
    assert.equal(main.view.query, 'retained')
    assert.equal(main.getDraft('main').packageRevision, 'a')
  } finally { globalThis.MutationObserver = previous }
})

test('plugin dispose clear drops drafts and view once, without persisting preferences', () => {
  const session = createAppearanceSession()
  session.setDraft('a', { revision: 1, packageRevision: 'p', value: null })
  session.select('a')
  session.setView({ activePage: 'managePage', compatibleOnly: true })
  session.clear()
  assert.equal(session.getDraft('a'), undefined)
  assert.equal(session.selected, '')
  assert.equal(session.view.activePage, 'gallery')
  assert.equal(session.view.compatibleOnly, false)
})
