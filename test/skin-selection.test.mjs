import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { registerSelectionRoutes } from '../lib/host.js'

const endpoint = '/api/dsh-skin-engine/selection'
const packageRevision = 'a'.repeat(64)

async function storageFixture(t, initial = { skinId: null, revision: 0 }) {
  const profile = await mkdtemp(join(tmpdir(), 'skin-selection-'))
  t.after(() => rm(profile, { recursive: true, force: true }))
  let durable = initial
  let openCount = 0
  let writeCount = 0
  let failure
  const storage = {
    async open(spec) {
      assert.match(spec.name, /^skin_engine_selection_[0-9a-f]{64}$/)
      assert.equal(spec.version, 4)
      assert.deepEqual(spec.compatibleVersions, [1, 2, 3])
      assert.equal(++openCount, 1)
      const snapshot = durable
      assert.equal(spec.global.schema.safeParse(snapshot).success, true)
      return {
        global: {
          get: () => snapshot,
          async set(value) {
            writeCount++
            assert.equal(spec.global.schema.safeParse(value).success, true)
            if (failure === 'before') throw new Error('before replace')
            durable = value
            if (failure === 'after') throw new Error('after replace')
          },
        },
        async close() { openCount-- },
      }
    },
  }

  function host() {
    const routes = new Map()
    const controller = new AbortController()
    const drain = registerSelectionRoutes(route => { routes.set(route.path, route) }, profile, storage, {
      async load(id, revision, signal) {
        assert.equal(revision, packageRevision)
        signal.throwIfAborted()
        return { source: id === 'local' ? 'local' : 'built-in', effects: [{ id: 'particles.dust' }] }
      },
    }, controller.signal)
    t.after(async () => { controller.abort(); await drain() })
    const send = (path, init) => routes.get(path).fetch(new Request(`http://localhost${path}`, init))
    return {
      read: () => send(endpoint),
      save(skinId, expectedRevision, extra = {}) {
        return send(`${endpoint}/apply`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ skinId, packageRevision: skinId === null ? null : packageRevision, expectedRevision, ...extra }),
        })
      },
    }
  }
  return { host, writes: () => writeCount, openCount: () => openCount, fail(mode) { failure = mode } }
}

test('competing Host requests serialize revision checks, including same-skin reapplication', async t => {
  const fixture = await storageFixture(t)
  const first = fixture.host()
  const second = fixture.host()
  const responses = await Promise.all([first.save('a', 0), second.save('b', 0)])
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409])
  const winner = await responses.find(response => response.ok).json()
  const stale = await responses.find(response => !response.ok).json()
  assert.deepEqual(stale, { error: 'selection-conflict', selection: winner })
  assert.deepEqual(await (await second.read()).json(), winner)
  assert.deepEqual(await (await first.save(winner.skinId, 1)).json(), winner)
  assert.equal(fixture.writes(), 1)
  assert.equal((await first.save('local', 1)).status, 409)
  assert.equal((await first.save('a', 1, { unexpected: true })).status, 400)
  assert.deepEqual(await (await first.save(null, 1)).json(), { skinId: null, revision: 2 })
  assert.equal(fixture.openCount(), 0)
})

test('profile preferences migrate from selection-only state and share its compare-and-swap', async t => {
  const old = { skinId: 'a', revision: 3 }
  const fixture = await storageFixture(t, old)
  const first = fixture.host()
  const second = fixture.host()
  assert.deepEqual(await (await first.read()).json(), old)
  const preferences = { quality: 'low', colors: { canvas: '#182431' }, effects: { 'particles.dust': { strength: 0 } } }
  assert.equal((await first.save('a', 3, { preferences: { colors: { canvas: 'url(https://example.com)' } } })).status, 400)
  assert.equal((await first.save('a', 3, { preferences: { effects: { 'glass.liquid': { enabled: false } } } })).status, 400)
  assert.equal((await first.save(null, 3, { preferences })).status, 400)
  assert.equal((await first.save('a', 3, { preferences })).status, 200)
  assert.equal((await second.save('a', 3, { preferences: null })).status, 409)
  assert.deepEqual(await (await second.read()).json(), { skinId: 'a', revision: 4, preferences: { a: preferences } })
  assert.equal((await first.save('a', 4, { preferences })).status, 200)
  assert.equal(fixture.writes(), 1)
  assert.deepEqual(await (await second.save('b', 4)).json(), { skinId: 'b', revision: 5, preferences: { a: preferences } })
  fixture.fail('after')
  assert.deepEqual(await (await first.save('a', 5, { preferences: null })).json(), { skinId: 'a', revision: 6 })
  assert.deepEqual(await (await second.read()).json(), { skinId: 'a', revision: 6 })
})

test('a rejected write is reconciled from a newly opened domain while the profile lock is held', async t => {
  const fixture = await storageFixture(t)
  const host = fixture.host()
  fixture.fail('before')
  const rejected = await host.save('a', 0)
  assert.equal(rejected.status, 503)
  assert.deepEqual(await rejected.json(), { error: 'selection-write-failed', selection: { skinId: null, revision: 0 } })
  fixture.fail('after')
  const committed = await host.save('b', 0)
  assert.equal(committed.status, 200)
  assert.deepEqual(await committed.json(), { skinId: 'b', revision: 1 })
  assert.deepEqual(await (await host.read()).json(), { skinId: 'b', revision: 1 })
  assert.equal(fixture.openCount(), 0)
})
