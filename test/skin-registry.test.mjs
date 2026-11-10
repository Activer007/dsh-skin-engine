import assert from 'node:assert/strict'
import { mkdir, mkdtemp, link, open, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { apply, builtInSkinDirectories, createSkinRegistry } from '../lib/host.js'

const rootPath = 'api/dsh-skin-engine'
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP1sAAAAASUVORK5CYII=', 'base64')

async function profileFixture(t, name) {
  const dir = await mkdtemp(join(tmpdir(), `skin-engine-${name}-`))
  const packages = join(dir, 'skin-engine', 'packages')
  await mkdir(packages, { recursive: true })
  const disposers = []
  const routes = new Map()
  apply({
    profileContext: { name, dir },
    storageDomain: { async open() { return { async close() {} } } },
    effect(setup) { disposers.push(setup()) },
    connection: { fetch: { register(route) {
      routes.set(route.path, route)
      disposers.push(() => routes.delete(route.path))
    } } },
  })
  async function dispose() {
    await Promise.all(disposers.splice(0).reverse().map(release => release()))
  }
  t.after(async () => {
    await dispose()
    await rm(dir, { recursive: true, force: true })
  })
  function request(path, init) {
    const url = new URL(path, 'http://skin.test/')
    const route = routes.get(url.pathname)
    assert(route, `registered ${url.pathname}`)
    return route.fetch(new Request(url, init))
  }
  return { dir, packages, request, routes, dispose }
}

async function skin(directory, id, options = {}) {
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'skin.json'), JSON.stringify({
    schema: 'dsh.skin/v1', id, name: id, version: '1.0.0', engineApi: '^1.0.0',
    entry: { tokens: 'tokens.json', styles: 'theme.css', effects: 'effects.json' },
    capabilities: ['tokens', 'css', 'assets'], ...options,
  }))
}

function assetUrl(skin, path) {
  return `${rootPath}/asset?${new URLSearchParams({ id: skin.manifest.id, revision: skin.revision, path })}`
}

test('the built-in Night Navigator resolves its declared background as a bounded image', async t => {
  const { dir } = await profileFixture(t, 'built-in-art')
  const signal = new AbortController().signal
  const registry = createSkinRegistry(dir, async () => '0.2.2-rc.1', signal)
  const id = 'com.dsh.skin.night-navigator'
  const { skins } = await registry.catalogue(signal)
  const { revision } = skins.find(skin => skin.manifest.id === id)
  const { art } = await registry.load(id, revision, signal)
  assert.deepEqual(art, { path: 'assets/navigator.webp', opacity: 0.35, size: 'contain' })
  const asset = await registry.asset(id, revision, { path: art.path }, signal)
  assert.equal(asset.type, 'image/webp')
})

test('100 local manifests index without entry files; malformed and colliding packages stay isolated', async t => {
  const host = await profileFixture(t, 'catalogue')
  const packagePath = name => join(host.packages, name)
  await Promise.all(Array.from({ length: 100 }, (_, i) => skin(packagePath(`skin-${i}`), `test.skin-${i}`)))
  await skin(packagePath('reserved'), 'com.dsh.skin.deep-ocean')
  await skin(packagePath('duplicate-a'), 'test.duplicate')
  await skin(packagePath('duplicate-b'), 'test.duplicate')
  await skin(packagePath('.staging'), 'test.staging')
  await mkdir(packagePath('invalid'))
  await writeFile(join(packagePath('invalid'), 'skin.json'), '{')
  await mkdir(packagePath('too-large'))
  await writeFile(join(packagePath('too-large'), 'skin.json'), Buffer.alloc(64 * 1024 + 1))
  await symlink(packagePath('skin-0'), packagePath('junction'), 'junction')

  const response = await host.request(`${rootPath}/skins`)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const { skins, issues } = await response.json()
  assert.equal(skins.length, builtInSkinDirectories.length + 100)
  assert.equal(skins.find(entry => entry.manifest.id === 'com.dsh.skin.deep-ocean').source, 'built-in')
  assert.equal(skins.filter(entry => entry.source === 'local').length, 100)
  assert.equal(skins.some(entry => ['test.duplicate', 'test.staging'].includes(entry.manifest.id)), false)
  assert.equal(issues.filter(issue => issue.code === 'duplicate-id').length, 3)
  assert(issues.some(issue => issue.directory === 'invalid' && issue.code === 'invalid-json'))
  assert(issues.some(issue => issue.directory === 'too-large' && issue.code === 'file-too-large'))
  assert(issues.some(issue => issue.directory === 'junction' && issue.code === 'unsafe-path'))
})

test('asset authorization uses exact Manifest paths, canonical files and profile-bound revisions', async t => {
  const one = await profileFixture(t, 'one')
  const two = await profileFixture(t, 'two')
  for (const host of [one, two]) {
    const directory = join(host.packages, 'sample')
    await skin(directory, 'test.sample', { assets: ['assets/ok.png', 'assets/fake.png', 'assets/huge.png', 'assets/link.png', 'assets/escape/leak.png'] })
    await mkdir(join(directory, 'assets'))
    await writeFile(join(directory, 'assets', 'ok.png'), png)
    await writeFile(join(directory, 'assets', 'unlisted.png'), png)
    await writeFile(join(directory, 'assets', 'fake.png'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
    await writeFile(join(directory, 'assets', 'huge.png'), Buffer.alloc(5 * 1024 * 1024 + 1))
    await writeFile(join(host.dir, 'leak.png'), png)
    await link(join(host.dir, 'leak.png'), join(directory, 'assets', 'link.png'))
    await symlink(host.dir, join(directory, 'assets', 'escape'), 'junction')
  }
  const a = (await (await one.request(`${rootPath}/skins`)).json()).skins.find(item => item.source === 'local')
  const b = (await (await two.request(`${rootPath}/skins`)).json()).skins.find(item => item.source === 'local')
  assert.notEqual(a.revision, b.revision)
  const url = assetUrl(a, 'assets/ok.png')
  const success = await one.request(url)
  assert.equal(success.status, 200)
  assert.equal(success.headers.get('content-type'), 'image/png')
  assert.equal(success.headers.get('cache-control'), 'no-store')
  assert.equal(success.headers.get('x-content-type-options'), 'nosniff')
  assert.deepEqual(Buffer.from(await success.arrayBuffer()), png)
  assert.equal((await one.request(url, { method: 'HEAD' })).body, null)
  assert.equal((await two.request(url)).status, 404)
  assert.equal((await two.request(assetUrl(b, 'assets/ok.png'))).status, 200)
  for (const file of ['assets/unlisted.png', 'assets/../skin.json', 'assets/%2e%2e/skin.json', 'assets/link.png', 'assets/escape/leak.png']) {
    assert.equal((await one.request(assetUrl(a, file))).status, 404, file)
  }
  assert.equal((await one.request(assetUrl(a, 'assets/fake.png'))).status, 415)
  assert.equal((await one.request(assetUrl(a, 'assets/huge.png'))).status, 413)
  assert.equal((await one.request(`${url}&id=test.sample`)).status, 400)

  await skin(join(one.packages, 'sample'), 'test.sample', { version: '1.0.1', assets: ['assets/ok.png'] })
  assert.equal((await one.request(url)).status, 409)
  const updated = (await (await one.request(`${rootPath}/skins`)).json()).skins.find(item => item.source === 'local')
  assert.equal((await one.request(assetUrl(updated, 'assets/ok.png'))).status, 200)
  assert.equal((await one.request(url)).status, 404)
})

test('missing previews return the placeholder and request or Host abort closes an in-flight file', { timeout: 5000 }, async t => {
  const host = await profileFixture(t, 'cancel')
  const directory = join(host.packages, 'sample')
  await skin(directory, 'test.sample', { assets: ['assets/big.png'], preview: { dark: 'preview/missing.webp' } })
  await mkdir(join(directory, 'assets'))
  const path = join(directory, 'assets', 'big.png')
  await writeFile(path, Buffer.alloc(128 * 1024))
  const { skins, placeholderUrl } = await (await host.request(`${rootPath}/skins`)).json()
  const entry = skins.find(item => item.source === 'local')
  const placeholder = await host.request(entry.previews.dark)
  assert.equal(placeholder.status, 200)
  assert.equal(placeholder.headers.get('x-dsh-skin-placeholder'), '1')
  assert.match(placeholderUrl, /^plugins\/dsh-plugin-skin-engine\/assets\/preview-placeholder-[0-9a-f]{12}\.svg$/)
  assert.equal(await placeholder.text(), await readFile(new URL(`../lib/assets/${placeholderUrl.split('/').at(-1)}`, import.meta.url), 'utf8'))

  const probe = await open(path)
  const prototype = Object.getPrototypeOf(probe)
  const read = prototype.read
  await probe.close()
  let begun = Promise.withResolvers()
  let proceed = Promise.withResolvers()
  t.mock.method(prototype, 'read', async function (buffer, ...args) {
    if (buffer.length === 128 * 1024) {
      begun.resolve(this)
      await proceed.promise
    }
    return read.call(this, buffer, ...args)
  })

  const url = assetUrl(entry, 'assets/big.png')
  const controller = new AbortController()
  const clientRequest = host.request(url, { signal: controller.signal })
  const cancelledHandle = await begun.promise
  controller.abort()
  proceed.resolve()
  assert.equal((await clientRequest).status, 408)
  assert.equal(cancelledHandle.fd, -1)
  assert.equal((await host.request(entry.previews.dark)).status, 200)

  begun = Promise.withResolvers()
  proceed = Promise.withResolvers()
  const pending = host.request(url)
  const handle = await begun.promise
  await host.dispose()
  proceed.resolve()
  assert.equal((await pending).status, 408)
  assert.equal(handle.fd, -1)
  assert.equal(host.routes.size, 0)
})
