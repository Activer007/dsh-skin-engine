import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'

const { outputFiles } = await build({ entryPoints: ['src/client/package-operations.ts'], bundle: true, write: false,
  platform: 'node', format: 'cjs', external: ['react'] })
const module = { exports: {} }
new Function('module', 'exports', 'require', outputFiles[0].text)(module, module.exports, () => ({}))
const { createPackageOperations } = module.exports
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const choice = { manifest: { id: 'reef' }, revision: 'r1', managed: true }
const file = { name: 'reef.zip', size: 100 }
function fixture(api, refresh, download) {
  let reads = 0, installs = []
  const state = { saving: false, saved: { skinId: null }, catalogue: { skins: [choice] } }
  const controller = { getSnapshot: () => state, refresh: async () => { reads++; await refresh?.() } }
  const store = createPackageOperations(controller, { api, download })
  return { store, state, installs, reads: () => reads }
}

test('unsubscribe/remount does not abort upload and shared store blocks duplicate writes', async () => {
  const work = deferred(); let signal, report, calls = 0
  const f = fixture({ import: async (_file, s, progress) => { calls++; signal = s; report = progress; return work.promise } })
  const unsubscribe = f.store.subscribe(() => {})
  const first = f.store.run({ kind: 'import', file, onInstalled: id => f.installs.push(id) })
  report(40)
  unsubscribe()
  assert.equal(signal.aborted, false)
  assert.equal(f.store.getSnapshot().progress.received, 40)
  await f.store.run({ kind: 'import', file, onInstalled: id => f.installs.push(id) })
  assert.equal(calls, 1)
  const remount = f.store.subscribe(() => {})
  work.resolve({ skinId: 'reef' }); await first
  assert.deepEqual(f.installs, ['reef'])
  assert.equal(f.reads(), 1)
  assert.equal(f.store.getSnapshot().action, undefined)
  assert.equal(f.store.getSnapshot().progress, undefined)
  assert.equal(f.store.getSnapshot().notice.message(key => key), 'package.installed')
  remount()
})

test('explicit cancel aborts upload, retains transaction lock through authoritative readback', async () => {
  const readback = deferred(); let signal, calls = 0
  const f = fixture({ import: (_file, s) => { calls++; signal = s; return new Promise((_, reject) => s.addEventListener('abort', () => reject(new Error('cancelled')))) } }, () => readback.promise)
  const run = f.store.run({ kind: 'import', file, onInstalled: id => f.installs.push(id) })
  f.store.cancel()
  await Promise.resolve(); await Promise.resolve()
  assert.equal(signal.aborted, true)
  assert.equal(f.store.getSnapshot().phase, 'readback')
  await f.store.run({ kind: 'import', file, onInstalled: id => f.installs.push(id) })
  assert.equal(calls, 1)
  readback.resolve(); await run
  assert.equal(f.reads(), 1)
  assert.equal(f.store.getSnapshot().action, undefined)
  assert.deepEqual(f.installs, [])
})

test('dispose aborts and suppresses late success, readback, subscriber publication and new work', async () => {
  const work = deferred(); let signal, calls = 0, changes = 0
  const f = fixture({ import: async (_file, s) => { calls++; signal = s; return work.promise } })
  f.store.subscribe(() => changes++)
  const run = f.store.run({ kind: 'import', file, onInstalled: id => f.installs.push(id) })
  f.store.dispose(); const atDispose = changes
  work.resolve({ skinId: 'reef' }); await run
  assert.equal(signal.aborted, true)
  assert.equal(f.reads(), 0)
  assert.equal(changes, atDispose)
  assert.deepEqual(f.installs, [])
  assert.deepEqual(f.store.getSnapshot(), { errorCode: '' })
  await f.store.run({ kind: 'import', file, onInstalled: id => f.installs.push(id) })
  assert.equal(calls, 1)
})

test('dispose during readback cannot publish a stale success or installation callback', async () => {
  const readback = deferred()
  const f = fixture({ import: async () => ({ skinId: 'reef' }) }, () => readback.promise)
  const run = f.store.run({ kind: 'import', file, onInstalled: id => f.installs.push(id) })
  await Promise.resolve(); await Promise.resolve()
  assert.equal(f.store.getSnapshot().phase, 'readback')
  f.store.dispose(); readback.resolve(); await run
  assert.deepEqual(f.installs, [])
  assert.deepEqual(f.store.getSnapshot(), { errorCode: '' })
})

test('update acknowledgement is not claimed as verified if Host reads a different revision', async () => {
  const f = fixture({ update: async () => ({ skinId: 'reef', revision: 'r2', version: '2.0' }) })
  await f.store.run({ kind: 'update', choice, file })
  assert.equal(f.store.getSnapshot().notice.message(key => key), 'package.reloadToConfirm')
  assert.equal(f.reads(), 1)
})

test('revision conflict preserves exact error and reads back before releasing the lock', async () => {
  const f = fixture({ rollback: async () => { throw new Error('package-conflict') } })
  await f.store.run({ kind: 'rollback', choice })
  assert.equal(f.store.getSnapshot().errorCode, 'package-conflict')
  assert.equal(f.reads(), 1)
  assert.equal(f.store.getSnapshot().action, undefined)
})


test('dispose while export response is late cannot trigger a download', async () => {
  const work = deferred(); let downloads = 0
  const f = fixture({ export: async () => work.promise }, undefined, async () => { downloads++; return 'saved' })
  const run = f.store.run({ kind: 'export', choice, assets: true, preferences: false })
  f.store.dispose(); work.resolve(new Blob(['archive'])); await run
  assert.equal(downloads, 0)
  assert.equal(f.reads(), 0)
  assert.deepEqual(f.store.getSnapshot(), { errorCode: '' })
})

test('desktop save already in progress may finish but cannot publish after unload', async () => {
  const save = deferred(); let downloads = 0, notifications = 0
  const f = fixture({ export: async () => new Blob(['archive']) }, undefined, async () => { downloads++; return save.promise })
  f.store.subscribe(() => notifications++)
  const run = f.store.run({ kind: 'export', choice, assets: true, preferences: false })
  await Promise.resolve(); await Promise.resolve()
  assert.equal(downloads, 1)
  f.store.dispose(); const last = notifications
  save.resolve('saved'); await run
  assert.equal(notifications, last)
  assert.deepEqual(f.store.getSnapshot(), { errorCode: '' })
})

test('cancel plus unavailable authoritative readback reports uncertainty, not success', async () => {
  const f = fixture({ import: (_file, signal) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new Error('upload-cancelled')))
  }) })
  f.state.catalogueNotice = 'host-unavailable'
  const run = f.store.run({ kind: 'import', file, onInstalled: id => f.installs.push(id) })
  f.store.cancel(); await run
  assert.equal(f.reads(), 1)
  assert.equal(f.store.getSnapshot().notice.message(key => key), 'error.cancelUncertain')
  assert.deepEqual(f.installs, [])
})

test('remove requires absence from Host catalogue and cleared saved selection before claiming success', async () => {
  const f = fixture({ remove: async () => ({ removed: 'reef' }) })
  await f.store.run({ kind: 'remove', choice })
  assert.equal(f.store.getSnapshot().notice.message(key => key), 'package.confirmByReload')
  f.state.catalogue.skins = []
  await f.store.run({ kind: 'remove', choice })
  assert.equal(f.store.getSnapshot().notice.message(key => key), 'package.removed')
  assert.equal(f.reads(), 2)
})
