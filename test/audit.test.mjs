import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { apply as applyHost } from '../lib/host.js'

const auditPath = '/api/dsh-skin-engine/audit'

function hostFixture(failOn) {
  const cleanup = []
  const routes = new Map()
  let closeCount = 0
  let stored = false
  const ctx = {
    profileContext: { name: 'skin-engine-test' },
    effect(setup) { cleanup.push(setup()) },
    storageDomain: {
      async open(spec) {
        assert.match(spec.name, /^skin_engine_audit_[a-f0-9]{64}$/)
        assert.equal(spec.global.schema.safeParse('true').success, false)
        return {
          global: { get: () => stored, async set(value) { stored = value } },
          async close() { closeCount++ },
        }
      },
    },
    connection: {
      fetch: {
        register(route) {
          assert(!routes.has(route.path))
          if (route.path === failOn) throw new Error('injected route failure')
          routes.set(route.path, route)
          const remove = () => routes.delete(route.path)
          cleanup.push(remove)
          return remove
        },
      },
    },
  }
  return {
    ctx, routes,
    closed: () => closeCount,
    async dispose() { await Promise.all(cleanup.splice(0).reverse().map(stop => stop())) },
  }
}

test('Host releases every registered route and closes its domain across 100 activations', async () => {
  const host = hostFixture()
  for (let index = 0; index < 100; index++) {
    applyHost(host.ctx)
    assert.equal(host.routes.size, 14)
    await host.dispose()
    assert.equal(host.routes.size, 0)
  }
  assert.equal(host.closed(), 100)
})

test('Host disposes acquired resources when route registration fails partway', async () => {
  const host = hostFixture(`${auditPath}/stream`)
  assert.throws(() => applyHost(host.ctx), /injected route failure/)
  assert.equal(host.routes.size, 2)
  await host.dispose()
  assert.equal(host.routes.size, 0)
  assert.equal(host.closed(), 1)
})

test('Host reports its bundled engine version with the existing audit result', async () => {
  const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const host = hostFixture()
  applyHost(host.ctx)
  try {
    const url = `http://localhost${auditPath}`
    const route = host.routes.get(auditPath)
    const before = await route.fetch(new Request(url))
    assert.equal(before.headers.get('cache-control'), 'no-store')
    assert.deepEqual(await before.json(), { persisted: false, engineVersion: version })
    const write = await host.routes.get(`${auditPath}/persist`).fetch(new Request(`${url}/persist`, { method: 'POST' }))
    assert.deepEqual(await write.json(), { persisted: true })
    const after = await route.fetch(new Request(url))
    assert.deepEqual(await after.json(), { persisted: true, engineVersion: version })
  } finally {
    await host.dispose()
  }
})

test('Host probe counts bounded streams and cancels an active read on unload', async () => {
  const host = hostFixture()
  applyHost(host.ctx)
  const route = host.routes.get(`${auditPath}/stream`)
  assert.equal(route.requestBody, 'streaming')
  const url = `http://localhost${route.path}`
  const send = body => route.fetch(new Request(url, { method: 'POST', body, duplex: 'half' }))
  assert.deepEqual(await (await send('data')).json(), { bytes: 4 })
  assert.equal((await send(new Uint8Array(8193))).status, 413)
  let cancelled = false
  const pending = send(new ReadableStream({ cancel() { cancelled = true } }))
  await host.dispose()
  assert.equal((await pending).status, 408)
  assert.equal(cancelled, true)
})
