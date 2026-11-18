import assert from 'node:assert/strict'
import { mkdtemp, rm, readdir, readFile, writeFile, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createSelectionStore, registerSelectionRoutes, registerUserArtworkRoutes } from '../lib/host.js'
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1kAAAAASUVORK5CYII=', 'base64')
const path = '/api/dsh-skin-engine/user-artwork'
const selectionPath = '/api/dsh-skin-engine/selection/apply'
const night = 'com.dsh.skin.night-navigator'
const dawn = 'com.dsh.skin.dawn-station'
async function fixture(t) {
  const profile = await mkdtemp(join(tmpdir(), 'user-artwork-'))
  t.after(() => rm(profile, { recursive: true, force: true }))
  let selection = { skinId: null, revision: 0 }
  let beforeWrite
  let localDeclaration = false
  const storage = {
    async open() {
      return {
        global: {
          get: () => selection,
          async set(value) {
            await beforeWrite?.()
            selection = value
          },
        },
        async close() {},
      }
    },
  }
  function host() {
    const routes = new Map()
    const controller = new AbortController()
    const register = route => routes.set(route.path, route)
    const transact = createSelectionStore(profile, storage)
    const drain = registerUserArtworkRoutes(register, profile, controller.signal, transact)
    const drainSelection = registerSelectionRoutes(register, profile, storage, {
      async load(id) {
        if (id === 'example.author-portrait') return { source: 'local', managed: true, effects: [],
          manifest: { id, ...(localDeclaration && { customizable: { artwork: { slot: 'primary' } } }) } }
        return { source: 'built-in', effects: [], manifest: { id } }
      },
    }, controller.signal, transact)
    assert.equal(routes.get(path).requestBody, 'streaming')
    assert.equal(routes.get(path + '/image').requestBody, 'buffered')
    t.after(async () => { controller.abort(); await Promise.all([drain(), drainSelection()]) })
    const send = (route, body) => routes.get(route).fetch(new Request(`http://localhost${route}`, body === undefined ? undefined : {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }))
    return {
      upload: (body = png, type = 'image/png') => routes.get(path).fetch(new Request(`http://localhost${path}`, { method: 'POST', body, headers: { 'content-type': type } })),
      read: asset => routes.get(path + '/image').fetch(new Request(`http://localhost${path}/image?asset=${encodeURIComponent(asset)}`)),
      library: () => send(path + '/library'),
      remove: asset => send(path + '/remove', { asset }),
      apply: (skinId, expectedRevision, asset, quality) => send(selectionPath, {
        skinId, packageRevision: 'a'.repeat(64), expectedRevision,
        preferences: asset ? { artwork: { asset, fit: 'contain', x: 50, y: 50, scale: 1, opacity: .35 }, quality } : null,
      }),
    }
  }
  return { profile, host, beforeWrite(callback) { beforeWrite = callback },
    declareArtwork(value) { localDeclaration = value } }
}
test('personal artwork persists across host recreation, deduplicates and is served safely', async t => {
  const { profile, host } = await fixture(t)
  const one = host()
  const response = await one.upload()
  assert.equal(response.status, 200)
  const { asset } = await response.json()
  assert.match(asset, /^[a-f0-9]{64}\.png$/)
  assert.equal((await (await one.upload()).json()).asset, asset)
  assert.equal((await readdir(join(profile, 'skin-engine-user-artwork'))).length, 1)
  const read = await host().read(asset)
  assert.equal(read.status, 200)
  assert.equal(read.headers.get('content-type'), 'image/png')
  assert.equal(read.headers.get('x-content-type-options'), 'nosniff')
  assert.deepEqual(Buffer.from(await read.arrayBuffer()), png)
})
test('invalid types, broken content, oversized uploads and traversal are rejected', async t => {
  const api = (await fixture(t)).host()
  assert.equal((await api.upload(png, 'image/svg+xml')).status, 415)
  assert.equal((await api.upload(Buffer.from('not an image'))).status, 415)
  assert.equal((await api.upload(Buffer.alloc(5 * 1024 * 1024 + 1))).status, 413)
  assert.equal((await api.read('../../secret')).status, 400)
})
test('tampered content and symlink references cannot be served', async t => {
  const { profile, host } = await fixture(t)
  const api = host()
  const { asset } = await (await api.upload()).json()
  const file = join(profile, 'skin-engine-user-artwork', asset)
  const changed = Buffer.from(png); changed[30] ^= 1
  await writeFile(file, changed)
  assert.equal((await api.read(asset)).status, 422)
  await rm(file)
  await writeFile(join(profile, 'outside.png'), png)
  await symlink(join(profile, 'outside.png'), file)
  assert.notEqual((await api.read(asset)).status, 200)
  assert.notEqual((await api.remove(asset)).status, 200)
  assert.deepEqual(await readFile(join(profile, 'outside.png')), png)
  const library = await (await api.library()).json()
  assert.equal(library.count, 1)
  assert.deepEqual(library.images, [])
})
test('storage bound rejects new images but retains existing usable content', async t => {
  const { profile, host } = await fixture(t)
  const api = host()
  const { asset } = await (await api.upload()).json()
  for (let i = 0; i < 31; i++) await writeFile(join(profile, 'skin-engine-user-artwork', `${i.toString(16).padStart(64, '0')}.png`), '')
  assert.equal((await api.upload()).status, 200)
  const other = Buffer.from(png); other[30] ^= 1
  assert.equal((await api.upload(other)).status, 409)
  assert.equal((await api.read(asset)).status, 200)
  assert.equal((await (await api.library()).json()).count, 32)
  const released = await (await api.remove(asset)).json()
  assert.equal(released.count, 31)
  assert.equal(released.bytes, 0)
  assert.equal((await api.upload(other)).status, 200)
})

test('library reports saved references across skins and isolates profiles', async t => {
  const { host } = await fixture(t)
  const peer = (await fixture(t)).host()
  const api = host()
  assert.deepEqual(await (await api.library()).json(), { count: 0, bytes: 0, limit: 32, images: [] })
  const { asset } = await (await api.upload()).json()
  assert.equal((await api.apply(night, 0, asset)).status, 200)
  assert.equal((await api.apply(dawn, 1, asset)).status, 200)
  const restarted = host()
  assert.deepEqual(await (await restarted.library()).json(), {
    count: 1, bytes: png.length, limit: 32, images: [{ asset, bytes: png.length, references: [night, dawn] }],
  })
  assert.equal((await peer.remove(asset)).status, 404)
  assert.equal((await restarted.remove('../outside.png')).status, 400)
  assert.equal((await restarted.remove(asset)).status, 409)
  assert.equal((await restarted.apply(night, 2)).status, 200)
  assert.equal((await restarted.remove(asset)).status, 409)
  assert.equal((await restarted.apply(dawn, 3)).status, 200)
  assert.deepEqual(await (await restarted.remove(asset)).json(), { count: 0, bytes: 0, limit: 32, images: [] })
  assert.equal((await api.read(asset)).status, 404)
  assert.equal((await api.apply(dawn, 4, asset)).status, 404)
})

test('removal waits for an in-progress preference commit and protects the new reference', async t => {
  const store = await fixture(t)
  const api = store.host()
  const { asset } = await (await api.upload()).json()
  const writing = Promise.withResolvers()
  const commit = Promise.withResolvers()
  store.beforeWrite(() => { writing.resolve(); return commit.promise })
  const saving = api.apply(night, 0, asset)
  await writing.promise
  const removing = store.host().remove(asset)
  commit.resolve()
  assert.equal((await saving).status, 200)
  assert.equal((await removing).status, 409)
  assert.equal((await api.read(asset)).status, 200)
})

test('managed packages need a declared slot to change their private artwork', async t => {
  const store = await fixture(t)
  const api = store.host()
  const target = 'example.author-portrait'
  const { asset } = await (await api.upload()).json()
  assert.equal((await api.apply(target, 0, asset)).status, 400)
  store.declareArtwork(true)
  assert.equal((await api.apply(target, 0, asset)).status, 200)
  store.declareArtwork(false)
  // A downgraded package can still update unrelated preferences without dropping the saved artwork.
  assert.equal((await api.apply(target, 1, asset, 'low')).status, 200)
  assert.equal((await api.remove(asset)).status, 409)
})
