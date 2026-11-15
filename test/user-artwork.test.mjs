import assert from 'node:assert/strict'
import { mkdtemp, rm, readdir, writeFile, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { registerUserArtworkRoutes } from '../lib/host.js'
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1kAAAAASUVORK5CYII=', 'base64')
const path = '/api/dsh-skin-engine/user-artwork'
async function fixture(t) {
  const profile = await mkdtemp(join(tmpdir(), 'user-artwork-'))
  t.after(() => rm(profile, { recursive: true, force: true }))
  function host() {
    const routes = new Map()
    const controller = new AbortController()
    const drain = registerUserArtworkRoutes(route => routes.set(route.path, route), profile, controller.signal)
    assert.equal(routes.get(path).requestBody, 'streaming')
    assert.equal(routes.get(path + '/image').requestBody, 'buffered')
    t.after(async () => { controller.abort(); await drain() })
    return {
      upload: (body = png, type = 'image/png') => routes.get(path).fetch(new Request(`http://localhost${path}`, { method: 'POST', body, headers: { 'content-type': type } })),
      read: asset => routes.get(path + '/image').fetch(new Request(`http://localhost${path}/image?asset=${encodeURIComponent(asset)}`)),
    }
  }
  return { profile, host }
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
})
