import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buffer } from 'node:stream/consumers'
import { setTimeout } from 'node:timers/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { fromBufferPromise } from 'yauzl'
import { ZipFile } from 'yazl'
import { commitPackageVersion, createSelectionStore, createSkinRegistry, registerPackageRoutes, registerSelectionRoutes,
  stagePackageVersion } from '../lib/host.js'
import { readSkinSource } from '../lib/authoring.js'
import { packageVersionPair, versionedSkin } from './fixtures/package-versions.mjs'

const root = '/api/dsh-skin-engine'
const uploadPath = root + '/packages/import'
const updatePath = root + '/packages/update'
const chunkBytes = 512 * 1024
const skinId = versionedSkin.id
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP1sAAAAASUVORK5CYII=', 'base64')
const skinScope = `:root[data-dsh-skin-id="${skinId}"]`
const pngPath = 'assets/picture.png'
const rules = `${skinScope}{--dsh-skin-canvas:#182431}
${skinScope} [data-dsh-skin-package-art]{background-image:url("${pngPath}");opacity:.25;background-size:contain}`
const json = data => Buffer.from(JSON.stringify(data))

function packageFiles(css = rules) {
  return new Map([
    ['skin.json', json({
      schema: 'dsh.skin/v1', id: skinId, name: 'ZIP Skin', version: '1.0.0', engineApi: '^1.0.0', colorScheme: 'dark',
      entry: { tokens: 'tokens.json', styles: 'theme.css', effects: 'effects.json' },
      assets: [pngPath], capabilities: ['tokens', 'css', 'assets', 'effects:canvas2d'],
    })],
    ['tokens.json', json({ schema: 'dsh.tokens/v1' })],
    ['effects.json', json({ schema: 'dsh.effects/v1', effects: [
      { id: 'particles.dust', enabled: true, renderer: 'canvas2d', params: {} },
    ] })],
    ['theme.css', Buffer.from(css)],
    [pngPath, png],
  ])
}

async function zip(files, compress = false) {
  const archive = new ZipFile()
  for (const [name, bytes] of files) archive.addBuffer(bytes, name, { compress })
  archive.end()
  return buffer(archive.outputStream)
}

async function unzip(archive) {
  const entries = new Map()
  const reader = await fromBufferPromise(archive)
  for await (const entry of reader.eachEntry()) entries.set(entry.fileName, await buffer(await reader.openReadStreamPromise(entry)))
  return entries
}

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'skin-packages-'))
  const abort = new AbortController()
  const routes = new Map()
  const register = route => { routes.set(route.path, route); return async () => routes.delete(route.path) }
  let selected = { skinId: null, revision: 0 }
  let failWrite = false
  const storage = {
    async open() {
      return {
        global: { get: () => selected, async set(next) { if (failWrite) throw Error('write fault'); selected = next } },
        async close() {},
      }
    },
  }
  const registry = createSkinRegistry(dir, async () => '0.2.2-rc.1', abort.signal)
  const transact = createSelectionStore(dir, storage)
  const drainSelection = registerSelectionRoutes(register, dir, storage, registry, abort.signal, transact)
  const drainPackages = registerPackageRoutes(register, dir, registry, transact, abort.signal)
  t.after(async () => {
    abort.abort()
    await Promise.all([drainSelection(), drainPackages()])
    await rm(dir, { force: true, recursive: true })
  })
  const request = (path, init) => {
    const url = new URL(path, 'http://skin.test')
    return routes.get(url.pathname).fetch(new Request(url, init))
  }
  const op = (upload, kind, parameters = {}, body, signal, path = uploadPath) => request(
    `${path}?${new URLSearchParams({ upload, op: kind, ...parameters })}`, {
      method: 'POST', body, signal, duplex: 'half',
      headers: body ? { 'content-type': 'application/octet-stream' } : undefined,
    },
  )
  const staging = () => readdir(join(dir, 'skin-engine', 'staging'))
  async function upload(bytes, target) {
    const id = randomUUID()
    const path = target ? updatePath : uploadPath
    assert.equal((await op(id, 'begin', { size: bytes.length, ...target }, undefined, undefined, path)).status, 201)
    for (let offset = 0; offset < bytes.length; offset += chunkBytes) {
      const response = await op(id, 'append', { offset }, bytes.subarray(offset, offset + chunkBytes), undefined, path)
      assert.equal(response.status, 200)
      assert.equal((await response.json()).received, Math.min(offset + chunkBytes, bytes.length))
    }
    return op(id, 'finish', {}, undefined, undefined, path)
  }
  return { dir, request, op, staging, upload, registry, signal: abort.signal,
    seedSelection: value => { selected = value }, failWrites: value => { failWrite = value } }
}

test('the Starter source packs reproducibly and passes the production ZIP importer', async t => {
  const host = await fixture(t)
  const starter = fileURLToPath(new URL('../DSH_Skin_Engine_Development_Pack_v1.0/examples/templates/starter/', import.meta.url))
  const script = fileURLToPath(new URL('../scripts/pack-samples.mjs', import.meta.url))
  const pack = (source, output) => promisify(execFile)(process.execPath, [script, '--source', source, output])
  const copy = join(host.dir, 'source')
  await cp(starter, copy, { recursive: true })
  const id = 'example.starter-light'
  const archive = async output => {
    await pack(copy, output)
    return readFile(join(output, `${id}.dshskin.zip`))
  }
  const files = ['skin.json', 'effects.json', 'theme.css', 'tokens.json']
  async function lineEndings(ending) {
    for (const file of files) {
      const path = join(copy, file)
      const text = await readFile(path, 'utf8')
      await writeFile(path, text.replace(/\r?\n/g, ending))
    }
  }
  await lineEndings('\n')
  const first = await archive(join(host.dir, 'first'))
  await lineEndings('\r\n')
  assert.deepEqual(first, await archive(join(host.dir, 'second')))
  assert.deepEqual([...await unzip(first)].map(([name]) => name), files)
  assert.deepEqual(await (await host.upload(first)).json(), { skinId: id })
  const installed = (await host.registry.catalogue(host.signal)).skins.find(skin => skin.manifest.id === id)
  const loaded = await host.registry.load(id, installed.revision, host.signal)
  assert.equal(loaded.manifest.colorScheme, 'light')
  assert.deepEqual(loaded.effects, [])

  await writeFile(join(copy, 'theme.css'), 'body { color: red }')
  const rejected = join(host.dir, 'rejected')
  await assert.rejects(pack(copy, rejected), /unsafe-skin-css/)
  const manifestPath = join(copy, 'skin.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  manifest.capabilities.push('assets')
  manifest.assets = ['assets/Art/a.png', 'assets/art/b.png']
  await writeFile(manifestPath, JSON.stringify(manifest))
  await assert.rejects(pack(copy, rejected), /duplicate-zip-path/)
  assert.deepEqual(await readdir(rejected), [])
})

test('the local update fixtures load independently and ordinary import rejects the newer same-ID ZIP', async t => {
  const [first, next] = await packageVersionPair()
  const load = async host => {
    const item = (await host.registry.catalogue(host.signal)).skins.find(skin => skin.manifest.id === skinId)
    assert(item?.location.managed)
    return host.registry.load(skinId, item.revision, host.signal)
  }

  await t.test('the newer archive is independently installable', async t => {
    const host = await fixture(t)
    assert.equal((await host.upload(next)).status, 201)
    const data = await load(host)
    assert.equal(data.manifest.version, '1.1.0')
    assert.equal(data.tokens.colors.canvas, '#312418')
    assert.deepEqual(data.effects, [])
  })

  for (const active of [false, true]) {
    await t.test(active ? 'active skin and preferences survive a duplicate' : 'inactive skin survives a duplicate', async t => {
      const host = await fixture(t)
      assert.equal((await host.upload(first)).status, 201)
      if (active) {
        const item = (await host.registry.catalogue(host.signal)).skins.find(skin => skin.manifest.id === skinId)
        const applied = await host.request(root + '/selection/apply', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            skinId, packageRevision: item.revision, expectedRevision: 0,
            preferences: { quality: 'low', effects: { 'particles.dust': { strength: 0.25 } } },
          }),
        })
        assert.equal(applied.status, 200)
      }
      const selected = await (await host.request(root + '/selection')).json()
      assert.equal(selected.skinId, active ? skinId : null)
      const duplicate = await host.upload(next)
      assert.equal(duplicate.status, 409)
      assert.deepEqual(await duplicate.json(), { error: 'duplicate-id' })
      assert.deepEqual(await (await host.request(root + '/selection')).json(), selected)
      const original = await load(host)
      assert.equal(original.manifest.version, '1.0.0')
      assert.equal(original.tokens.colors.canvas, '#182431')
      assert.equal(original.effects[0]?.id, 'particles.dust')
      assert.deepEqual(await host.staging(), [])
    })
  }
})

test('standalone Ink Focus and Warm Dusk packages still install and load without a SceneSpec', async t => {
  const host = await fixture(t)
  for (const name of ['ink-focus', 'warm-dusk']) {
    const source = fileURLToPath(new URL(`../DSH_Skin_Engine_Development_Pack_v1.0/examples/skins/${name}/`, import.meta.url))
    const { manifest, files } = await readSkinSource(source)
    assert.equal((await host.upload(await zip(files))).status, 201)
    const item = (await host.registry.catalogue(host.signal)).skins.find(skin => skin.manifest.id === manifest.id)
    assert.equal(item.compatibility, undefined)
    assert(!Object.hasOwn(await host.registry.load(manifest.id, item.revision, host.signal), 'scene'))
  }
})

test('SceneSpec authoring, updates, exports, and rollback share the production package contract', async t => {
  const host = await fixture(t)
  const find = async () => (await host.registry.catalogue(host.signal)).skins.find(skin => skin.manifest.id === skinId)
  const key = item => new URLSearchParams({ id: skinId, revision: item.revision }).toString()
  assert.equal((await host.upload(await zip(packageFiles()))).status, 201)
  const old = await find()
  const files = packageFiles(`${skinScope}{--dsh-skin-canvas:#182431}`)
  const manifest = JSON.parse(files.get('skin.json'))
  manifest.version = '1.1.0'
  manifest.engineApi = '^1.1.0'
  manifest.entry.scene = 'scene.json'
  manifest.capabilities.push('scene')
  const scene = {
    schema: 'dsh.scene/v1',
    layout: { artwork: { asset: pngPath, fit: 'contain', anchor: 'right center', focalPoint: [1, 0], scale: 1, opacity: 0.35 } },
    presets: { static: [], light: [], dynamic: ['particles.dust'] },
  }
  files.set('skin.json', json(manifest))
  files.set('scene.json', json(scene))
  const target = { id: skinId, revision: old.revision }
  for (const [name, value, status] of [
    ['scene.json', null, 422], ['scene.json', Buffer.alloc(65 * 1024), 413],
    ['theme.css', Buffer.from(rules), 422], [pngPath, Buffer.from('<svg/>'), 415],
  ]) {
    const bad = new Map(files)
    if (value) bad.set(name, value)
    else bad.delete(name)
    assert.equal((await host.upload(await zip(bad), target)).status, status)
  }
  assert.equal((await find()).revision, old.revision)
  assert.deepEqual(await host.staging(), [])

  const source = join(host.dir, 'scene-source')
  await mkdir(join(source, 'assets'), { recursive: true })
  for (const [name, bytes] of files) await writeFile(join(source, name), bytes)
  const script = fileURLToPath(new URL('../scripts/pack-samples.mjs', import.meta.url))
  const output = join(host.dir, 'scene-output')
  await promisify(execFile)(process.execPath, [script, '--source', source, output])
  const archive = await readFile(join(output, `${skinId}.dshskin.zip`))
  assert.equal((await host.upload(archive, target)).status, 200)
  const item = await find()
  const loaded = await host.registry.load(skinId, item.revision, host.signal)
  assert.deepEqual(loaded.scene, scene)
  assert.equal(loaded.art, undefined)
  assert.equal(loaded.sceneArtwork, pngPath)

  const exportZip = async suffix => {
    const response = await host.request(root + '/packages/export?' + key(item) + suffix)
    assert.equal(response.status, 200)
    return Buffer.from(await response.arrayBuffer())
  }
  const full = await unzip(await exportZip('&assets=1'))
  assert.deepEqual(full.get('scene.json'), files.get('scene.json'))
  assert.deepEqual(full.get(pngPath), png)
  const stripped = await exportZip('')
  const strippedFiles = await unzip(stripped)
  assert(!strippedFiles.has('scene.json'))
  const strippedManifest = JSON.parse(strippedFiles.get('skin.json'))
  assert.equal(strippedManifest.entry.scene, undefined)
  assert(!strippedManifest.capabilities.includes('scene'))
  assert.equal(strippedManifest.engineApi, manifest.engineApi)

  const { location } = await host.registry.resolveSkin(skinId, item.revision, host.signal)
  const installedImage = join(location.anchor, ...location.segments, pngPath)
  await unlink(installedImage)
  const withoutArtwork = await host.registry.load(skinId, item.revision, host.signal)
  assert.equal(withoutArtwork.sceneArtwork, undefined)
  assert.equal(withoutArtwork.tokens.colors.canvas, loaded.tokens.colors.canvas)
  await writeFile(installedImage, Buffer.from('<svg/>'))
  await assert.rejects(host.registry.load(skinId, item.revision, host.signal), { code: 'invalid-resource-type' })
  await writeFile(installedImage, png)

  assert.equal((await host.request(root + '/packages/rollback?' + key(item), { method: 'POST' })).status, 200)
  const rolledBack = await find()
  assert.notEqual(rolledBack.revision, item.revision)
  assert.deepEqual((await host.registry.load(skinId, rolledBack.revision, host.signal)).art,
    { path: pngPath, opacity: 0.25, size: 'contain' })
  assert.equal((await host.request(root + '/packages/remove?' + key(rolledBack), { method: 'POST' })).status, 200)
  assert.equal((await host.upload(stripped)).status, 201)
})

test('version commits serialize and rollback restores the prior package without losing saved preferences', async t => {
  const host = await fixture(t)
  const [first, next] = await packageVersionPair()
  const installed = async () => {
    const items = (await host.registry.catalogue(host.signal)).skins.filter(skin => skin.manifest.id === skinId)
    assert.equal(items.length, 1)
    return items[0]
  }
  const target = revision => ({ id: skinId, revision })
  const read = async () => (await host.request(root + '/selection')).json()
  const preferences = { quality: 'low', effects: { 'particles.dust': { strength: 0.25 } } }
  const apply = (packageRevision, expectedRevision, values) => host.request(root + '/selection/apply', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ skinId, packageRevision, expectedRevision, preferences: values }),
  })
  const rollback = revision => host.request(root + '/packages/rollback?' + new URLSearchParams(target(revision)), { method: 'POST' })

  assert.equal((await host.upload(first)).status, 201)
  const original = await installed()
  const peer = createSkinRegistry(host.dir, async () => '0.2.2-rc.1', host.signal)
  await peer.catalogue(host.signal)
  assert.equal((await apply(original.revision, 0, preferences)).status, 200)
  const saved = await read()
  assert.deepEqual(await (await host.upload(first, target(original.revision))).json(), { error: 'package-version-not-newer' })
  for (const version of ['0.9.9', '1.0.0+rebuild']) {
    const files = await unzip(first)
    files.set('skin.json', json({ ...JSON.parse(files.get('skin.json')), version }))
    const rejected = await host.upload(await zip(files), target(original.revision))
    assert.equal(rejected.status, 409)
    assert.deepEqual(await rejected.json(), { error: 'package-version-not-newer' })
  }
  const results = await Promise.all([host.upload(next, target(original.revision)), host.upload(next, target(original.revision))])
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409])
  const updated = await installed()
  assert.deepEqual(await results.find(result => result.ok).json(), {
    skinId, version: '1.1.0', revision: updated.revision,
  })
  assert.equal(updated.previousVersion, '1.0.0')
  assert.equal((await host.registry.load(skinId, updated.revision, host.signal)).tokens.colors.canvas, '#312418')
  await assert.rejects(host.registry.load(skinId, original.revision, host.signal), /skin-not-found/)
  await assert.rejects(peer.load(skinId, original.revision, host.signal), /skin-(changed|not-found)/)
  assert.equal((await peer.catalogue(host.signal)).skins.find(skin => skin.manifest.id === skinId).revision, updated.revision)
  assert.deepEqual(await read(), saved)

  const amended = { ...preferences, quality: 'balanced' }
  assert.equal((await apply(updated.revision, saved.revision, amended)).status, 200)
  const afterEdit = await read()
  assert.equal((await apply(updated.revision, afterEdit.revision, { ...amended, effects: { 'particles.dust': { strength: 0.5 } } })).status, 400)
  assert.equal((await rollback(original.revision)).status, 409)
  const rollbacks = await Promise.all([rollback(updated.revision), rollback(updated.revision)])
  assert.deepEqual(rollbacks.map(response => response.status).sort(), [200, 409])
  const reverted = rollbacks.find(response => response.ok)
  const current = await installed()
  assert.deepEqual(await reverted.json(), { skinId, version: '1.0.0', revision: current.revision })
  assert.notEqual(current.revision, original.revision)
  assert.equal(current.previousVersion, undefined)
  assert.equal((await host.registry.load(skinId, current.revision, host.signal)).effects[0]?.id, 'particles.dust')
  assert.deepEqual(await read(), afterEdit)
  assert.equal((await rollback(current.revision)).status, 409)
  const remove = root + '/packages/remove?' + new URLSearchParams(target(current.revision))
  assert.equal((await host.request(remove, { method: 'POST' })).status, 200)
  assert(!(await host.registry.catalogue(host.signal)).skins.some(item => item.manifest.id === skinId))
  assert.deepEqual(await host.staging(), [])
})

test('failed or interrupted version commits preserve the authoritative directory', async t => {
  const host = await fixture(t)
  const [first, next] = await packageVersionPair()
  const installed = async () => (await host.registry.catalogue(host.signal)).skins.find(skin => skin.manifest.id === skinId)
  assert.equal((await host.upload(first)).status, 201)
  const original = await installed()
  const installation = original.installation
  const versionDirectory = join(installation.anchor, ...installation.segments, '.versions')
  const entries = await unzip(next)
  async function staged() {
    const directory = await mkdtemp(join(host.dir, 'version-fixture-'))
    for (const [path, bytes] of entries) {
      await writeFile(join(directory, path), bytes)
    }
    return directory
  }

  const failed = await stagePackageVersion(installation, null, await staged(), host.signal)
  await assert.rejects(commitPackageVersion(installation, failed, 'base', host.signal, async () => {
    throw Error('injected write failure')
  }), /injected write failure/)
  assert.deepEqual(await readdir(versionDirectory), [])
  assert.equal((await installed()).revision, original.revision)

  const cancelled = await stagePackageVersion(installation, null, await staged(), host.signal)
  await assert.rejects(commitPackageVersion(installation, cancelled, 'base', AbortSignal.abort()), { name: 'AbortError' })
  assert.deepEqual(await readdir(versionDirectory), [])
  assert.equal((await installed()).revision, original.revision)

  const source = await staged()
  const module = new URL('../lib/host.js', import.meta.url).href
  const child = `
    import { createSelectionStore, stagePackageVersion } from ${JSON.stringify(module)}
    const signal = new AbortController().signal
    await createSelectionStore(${JSON.stringify(host.dir)}, {})(signal, async () => {
      await stagePackageVersion(${JSON.stringify(installation)}, null, ${JSON.stringify(source)}, signal)
      process.exit(73)
    })
  `
  await assert.rejects(promisify(execFile)(process.execPath, ['--input-type=module', '--eval', child]), { code: 73 })
  assert.equal((await readdir(versionDirectory)).length, 1)
  assert.equal((await installed()).revision, original.revision)
  const updated = await host.upload(next, { id: skinId, revision: original.revision })
  assert.equal(updated.status, 200)
  assert.equal((await readdir(versionDirectory)).length, 1)
  const active = await installed()
  assert.equal(active.manifest.version, '1.1.0')
  assert.equal((await (await host.request(root + '/selection')).json()).skinId, null)

  const committed = await commitPackageVersion(installation, 'base', null, host.signal, async (path, contents, options) => {
    await writeFileAtomic(path, contents, options)
    throw Error('injected result loss after replacement')
  })
  assert.equal(committed.current, 'base')
  assert.deepEqual(await readdir(versionDirectory), [])
  await assert.rejects(host.registry.load(skinId, active.revision, host.signal), /skin-changed/)
  assert.equal((await installed()).manifest.version, '1.0.0')
})

test('validated ZIP round trips with opt-in resources and preferences; removal commits Default first', async t => {
  const host = await fixture(t)
  const files = packageFiles()
  files.set('preferences.json', json({ schema: 'dsh.skin-preferences/v1', skinId, preferences: { quality: 'low' } }))
  const archive = await zip(new Map([...files].map(([name, value]) => ['folder/' + name, value])))
  assert.deepEqual(await (await host.upload(archive)).json(), { skinId })
  assert.equal((await host.upload(archive)).status, 409)
  assert.deepEqual(await host.staging(), [])
  const choice = (await host.registry.catalogue(host.signal)).skins.find(skin => skin.manifest.id === skinId)
  assert(choice.location.managed)
  const key = new URLSearchParams({ id: skinId, revision: choice.revision }).toString()
  const loaded = await host.registry.load(skinId, choice.revision, host.signal)
  assert.deepEqual(loaded.art, { path: pngPath, opacity: 0.25, size: 'contain' })
  assert.equal(loaded.tokens.colors.canvas, '#182431')
  assert.deepEqual(loaded.bundledPreferences, { quality: 'low' })
  assert.deepEqual((await host.registry.asset(skinId, choice.revision, { path: pngPath }, host.signal)).bytes, png)
  const pref = { quality: 'high', effects: { 'particles.dust': { strength: 0.15 } } }
  const saved = await host.request(root + '/selection/apply', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ skinId, packageRevision: choice.revision, expectedRevision: 0, preferences: pref }),
  })
  assert.equal(saved.status, 200)
  const exported = await host.request(root + '/packages/export?' + key)
  assert.equal(exported.headers.get('cache-control'), 'no-store')
  const standardArchive = Buffer.from(await exported.arrayBuffer())
  const standard = await unzip(standardArchive)
  assert.deepEqual([...standard.keys()].sort(), ['effects.json', 'skin.json', 'theme.css', 'tokens.json'])
  assert(!standard.get('theme.css').toString().includes('url('))
  const full = await unzip(Buffer.from(await (await host.request(root + '/packages/export?' + key
    + '&assets=1&preferences=1')).arrayBuffer()))
  assert.deepEqual(full.get(pngPath), png)
  assert.deepEqual(JSON.parse(full.get('preferences.json')).preferences, pref)
  host.failWrites(true)
  const remove = () => host.request(root + '/packages/remove?' + key, { method: 'POST' })
  assert.equal((await remove()).status, 503)
  assert((await host.registry.catalogue(host.signal)).skins.some(skin => skin.manifest.id === skinId))
  host.failWrites(false)
  assert.deepEqual(await (await remove()).json(), { removed: skinId })
  assert.equal((await (await host.request(root + '/selection')).json()).skinId, null)
  assert.deepEqual(await host.staging(), [])
  assert.equal((await host.upload(standardArchive)).status, 201)
  const replaced = (await host.registry.catalogue(host.signal)).skins.find(skin => skin.manifest.id === skinId)
  assert.notEqual(replaced.revision, choice.revision)
})

test('bad paths, link entries, compressed bombs and CRC corruption never publish', async t => {
  const host = await fixture(t)
  const wrapped = await zip(new Map([...packageFiles()].map(([name, value]) => ['aa/' + name, value])))
  for (let cursor = 0; (cursor = wrapped.indexOf('aa/skin.json', cursor)) >= 0; cursor++) wrapped.write('../skin.json', cursor)
  const symlink = await zip(packageFiles())
  const marker = Buffer.from('504b0102', 'hex')
  symlink.writeUInt32LE((0o120777 << 16) >>> 0, symlink.indexOf(marker) + 38)
  const duplicate = await zip(packageFiles().set('assets/Picture.png', png))
  const corrupt = await zip(packageFiles())
  corrupt.writeUInt32LE(0, corrupt.indexOf(marker) + 16)
  const bomb = await zip(packageFiles().set('assets/bomb.png', Buffer.alloc(1024 * 1024)), true)
  for (const [archive, status] of [[wrapped, 422], [symlink, 422], [duplicate, 422], [corrupt, 422], [bomb, 413]]) {
    assert.equal((await host.upload(archive)).status, status)
    assert.deepEqual(await host.staging(), [])
  }
  assert(!(await host.registry.catalogue(host.signal)).skins.some(skin => skin.manifest.id === skinId))
})

test('CSS escapes, nested rules, off-scope selectors, encoded and remote URLs, and undeclared files are refused', async t => {
  const host = await fixture(t)
  for (const css of [
    '@import "outside.css";', '*{--dsh-skin-canvas:#fff}',
    `${skinScope}{& [data-dsh-skin-package-art]{opacity:.3}}`,
    `${skinScope}{position:fixed}`, `${skinScope}{--dsh-skin-canvas:#fff!important}`,
    ...['assets/%70icture.png', 'https://example.com/a.png', 'data:image/png;base64,AA', 'assets/p\\69 cture.png']
      .map(url => `${skinScope} [data-dsh-skin-package-art]{background-image:url("${url}")}`),
  ]) {
    const result = await host.upload(await zip(packageFiles(css)))
    assert.equal(result.status, 422, css)
    assert.deepEqual(await result.json(), { error: 'unsafe-skin-css' })
  }
  assert.equal((await host.upload(await zip(packageFiles().set('scripts/a.js', Buffer.from('throw 1'))))).status, 422)
  assert.equal((await host.upload(await zip(packageFiles().set(pngPath, Buffer.from('fake PNG'))))).status, 415)
  const oversizedImage = Buffer.from(png)
  oversizedImage.writeUInt32BE(16384, 16)
  assert.equal((await host.upload(await zip(packageFiles().set(pngPath, oversizedImage)))).status, 415)
  assert.deepEqual(await host.staging(), [])
})

test('Host acknowledges cancel only after interrupting an active reader and clearing staging', async t => {
  const host = await fixture(t)
  const id = randomUUID()
  assert.equal((await host.op(id, 'begin', { size: 256 })).status, 201)
  let stopped = false
  const body = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(4)) },
    cancel() { stopped = true },
  })
  const append = host.op(id, 'append', { offset: 0 }, body)
  const [directory] = await host.staging()
  const archive = join(host.dir, 'skin-engine', 'staging', directory, 'archive.zip')
  for (let n = 0; n < 100; n++) {
    if ((await stat(archive).catch(() => null))?.size === 4) break
    await setTimeout(10)
  }
  assert.equal((await stat(archive)).size, 4)
  assert.deepEqual(await (await host.op(id, 'cancel')).json(), { state: 'cancelled' })
  assert.equal((await append).status, 408)
  assert(stopped)
  assert.deepEqual(await host.staging(), [])
  assert.equal((await host.op(id, 'finish')).status, 404)
})

test('chunk overflow and competing publishes preserve the bounded profile catalogue', async t => {
  const host = await fixture(t)
  const id = randomUUID()
  assert.equal((await host.op(id, 'begin', { size: 22 * 1024 * 1024 })).status, 413)
  assert.equal((await host.op(id, 'begin', { size: 10 })).status, 201)
  assert.equal((await host.op(id, 'append', { offset: 1 }, randomBytes(10))).status, 409)
  assert.equal((await host.op(id, 'append', { offset: 0 }, randomBytes(11))).status, 413)
  assert.deepEqual(await host.staging(), [])
  const archive = await zip(packageFiles())
  const results = await Promise.all([host.upload(archive), host.upload(archive)])
  assert.deepEqual(results.map(response => response.status).sort(), [201, 409])
  assert.deepEqual(await host.staging(), [])
})

test('imported skin cannot reference private profile artwork', async t => {
  const host = await fixture(t)
  const files = packageFiles()
  files.set('preferences.json', json({ schema: 'dsh.skin-preferences/v1', skinId, preferences: {
    artwork: { asset: `${'a'.repeat(64)}.png`, fit: 'contain', x: 50, y: 50, scale: 1, opacity: 0.3 },
  } }))
  assert.equal((await host.upload(await zip(files))).status, 422)
  assert.deepEqual(await host.staging(), [])
})

test('exporting built-in portrait preferences and assets omits all private image data', async t => {
  const host = await fixture(t)
  const id = 'com.dsh.skin.night-navigator'
  const asset = `${'c'.repeat(64)}.png`
  host.seedSelection({ skinId: id, revision: 1, preferences: {
    [id]: { quality: 'low', artwork: { asset, fit: 'cover', x: 50, y: 50, scale: 1, opacity: 0.35 } },
  } })
  const skin = (await host.registry.catalogue(host.signal)).skins.find(item => item.manifest.id === id)
  const query = new URLSearchParams({ id, revision: skin.revision, assets: '1', preferences: '1' })
  const response = await host.request(root + '/packages/export?' + query)
  assert.equal(response.status, 200)
  const contents = await unzip(Buffer.from(await response.arrayBuffer()))
  assert(contents.has('assets/navigator.webp'))
  assert.deepEqual(JSON.parse(contents.get('preferences.json')).preferences, { quality: 'low' })
  assert(![...contents].some(([name, bytes]) => name.includes(asset) || bytes.includes(asset)))
})
