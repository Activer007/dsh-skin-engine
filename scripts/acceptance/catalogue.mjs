import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { packageVersionPair, versionedSkin } from '../../test/fixtures/package-versions.mjs'
import { packagePanel } from './packages.mjs'

const path = 'api/dsh-skin-engine'
const fixturePrefix = 'fixture.scale-'
const previewFile = new URL(
  '../../DSH_Skin_Engine_Development_Pack_v1.0/examples/skins/deep-ocean/preview/dark.png', import.meta.url,
)

export async function seedCatalogue(profileDir, from, to) {
  const manifest = JSON.parse(await readFile(new URL(
    '../../DSH_Skin_Engine_Development_Pack_v1.0/examples/skins/deep-ocean/skin.json', import.meta.url,
  ), 'utf8'))
  const preview = await readFile(previewFile)
  for (let index = from; index < to; index++) {
    const id = fixturePrefix + String(index).padStart(3, '0')
    const dir = join(profileDir, 'skin-engine', 'packages', id)
    await mkdir(join(dir, 'preview'), { recursive: true })
    await writeFile(join(dir, 'skin.json'), JSON.stringify({
      ...manifest, id, name: id, preview: { dark: 'preview/dark.png' },
    }))
    // The final fixture exercises the in-gallery fallback.
    if (index !== 99) await writeFile(join(dir, 'preview', 'dark.png'), preview)
  }
}

export async function checkCatalogueCache({ ui, foreground }, profileDir, evidence, baseline) {
  const { page, panel } = ui
  const desktop = new URL(page.url()).protocol === 'dsh-app:'
  const gallery = panel.getByRole('region', { name: 'Skin gallery', exact: true })
  const { loadPreview } = packagePanel(ui, foreground)
  const get = force => page.evaluate(async url => {
    const start = performance.now()
    const response = await fetch(new URL(url, document.baseURI))
    if (!response.ok) throw Error(`Catalogue returned HTTP ${response.status}`)
    const { skins, issues } = await response.json()
    return { skins, issues, ms: Math.round((performance.now() - start) * 10) / 10 }
  }, `${path}/skins${force ? '?refresh=1' : ''}`)
  if (desktop) await seedCatalogue(profileDir, 0, 10)
  evidence.samples = []
  for (const count of [10, 100]) {
    if (count === 100) await seedCatalogue(profileDir, 10, 100)
    const cold = await get(!baseline)
    const fixtures = cold.skins.filter(item => item.manifest.id.startsWith(fixturePrefix))
    assert.equal(fixtures.length, count)
    assert.equal(cold.issues.length, 0)
    const hotMs = []
    for (let i = 0; i < 5; i++) {
      const hot = await get(false)
      assert.deepEqual(hot.skins, cold.skins)
      hotMs.push(hot.ms)
    }
    const requests = new Set()
    const recordPreview = request => {
      const url = new URL(request.url())
      const id = url.searchParams.get('id')
      if (url.pathname.endsWith(`/${path}/asset`) && url.searchParams.has('scheme') && id?.startsWith(fixturePrefix)) requests.add(id)
    }
    page.on('request', recordPreview)
    try {
      if (!desktop) {
        await page.reload({ waitUntil: 'domcontentloaded' })
        await ui.dismissOnboarding()
      }
      const started = performance.now()
      await ui.open()
      await gallery.getByRole('combobox', { name: 'Source', exact: true }).selectOption('local')
      await gallery.getByRole('button', { name: new RegExp(`^${RegExp.escape(fixtures.at(-1).manifest.name)} `) }).waitFor()
      assert.equal(await gallery.locator('.dsh-skin-gallery button').count(), count)
      // Desktop keeps its renderer alive. Use a previously unseen image for the second sample.
      const first = fixtures[desktop && count === 100 ? 10 : 0].manifest
      const last = fixtures.at(-1).manifest
      assert.equal((await loadPreview(first)).width, 1280)
      const firstPreviewMs = Math.round(performance.now() - started)
      const initialRequests = requests.size
      assert(requests.has(first.id))
      if (count === 100) assert(!requests.has(last.id), 'Offscreen thumbnails should load on demand')
      const lastWidth = (await loadPreview(last)).width
      assert.equal(lastWidth, count === 100 ? 320 : 1280)
      assert(requests.has(last.id))
      const afterScrollRequests = requests.size
      const thumbnail = fixtures[0].previews.dark
      const conditional = await page.evaluate(async url => {
        const resource = new URL(url, document.baseURI)
        const initial = await fetch(resource, { cache: 'no-store' })
        const etag = initial.headers.get('etag')
        const repeat = await fetch(resource, { cache: 'no-store', headers: etag ? { 'If-None-Match': etag } : {} })
        return { status: initial.status, repeat: repeat.status, cache: initial.headers.get('cache-control') }
      }, thumbnail)
      assert.equal(conditional.status, 200)
      assert.equal(conditional.repeat, baseline ? 200 : 304)
      await ui.close()
      evidence.samples.push({ count, total: cold.skins.length, coldMs: cold.ms, hotMs, firstPreviewMs, initialRequests,
        afterScrollRequests, lastWidth, conditional })
    } finally { page.off('request', recordPreview) }
  }
  if (!baseline) evidence.mutations = await checkMutations(ui, get)
}

async function checkMutations(ui, get) {
  const [first, next] = await packageVersionPair(await readFile(previewFile))
  const skin = versionedSkin
  const { install, remove, openActions } = packagePanel(ui)
  async function current(version) {
    const entry = (await get(false)).skins.find(item => item.manifest.id === skin.id)
    assert.equal(entry?.manifest.version, version)
    return entry
  }
  const preview = (entry, etag) => ui.page.evaluate(async ({ url, etag }) => {
    const response = await fetch(new URL(url, document.baseURI), {
      cache: 'no-store', headers: etag ? { 'If-None-Match': etag } : {},
    })
    return { status: response.status, etag: response.headers.get('etag') }
  }, { url: entry.previews.dark, etag })

  await ui.open()
  await install('catalogue-v1.dshskin.zip', first)
  await ui.choose(skin)
  const installed = await current('1.0.0')
  const validator = await preview(installed)
  assert.equal(validator.status, 200)
  assert(validator.etag)
  await (await openActions(skin)).getByLabel('Update from .dshskin.zip').setInputFiles({
    name: 'catalogue-v2.dshskin.zip', mimeType: 'application/zip', buffer: next,
  })
  await ui.panel.getByRole('status').filter({ hasText: 'Skin updated to v1.1.0.' }).waitFor()
  const updated = await current('1.1.0')
  assert.notEqual(updated.revision, installed.revision)
  const staleUpdate = (await preview(installed, validator.etag)).status
  assert.equal(staleUpdate, 404)
  assert.equal((await preview(updated)).status, 200)

  const rollback = await openActions(skin)
  await ui.activate(ui.button(rollback, 'Roll back to v1.0.0…'))
  await ui.activate(ui.button(rollback, 'Confirm rollback'))
  await ui.panel.getByRole('status').filter({ hasText: 'Skin rolled back to v1.0.0.' }).waitFor()
  const restored = await current('1.0.0')
  assert.notEqual(restored.revision, installed.revision)
  assert.notEqual(restored.revision, updated.revision)
  const staleRollback = (await preview(updated, validator.etag)).status
  assert.equal(staleRollback, 404)
  assert.equal((await preview(restored)).status, 200)

  await remove(skin)
  await current(undefined)
  const staleUninstall = (await preview(restored, validator.etag)).status
  assert.equal(staleUninstall, 404)
  await ui.close()
  return { versions: ['1.0.0', '1.1.0', '1.0.0'], staleUpdate, staleRollback, staleUninstall }
}
