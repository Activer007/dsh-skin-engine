import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { settings } from './browser.mjs'
import { identify, prepareHost, redact } from './hosts.mjs'
import { packagePanel, zipJson } from './packages.mjs'

const { values: options } = parseArgs({ options: {
  platform: { type: 'string' },
  'host-version': { type: 'string' },
  archive: { type: 'string' },
  'zip-dir': { type: 'string' },
  output: { type: 'string', default: '.cache/v2-01' },
  'desktop-exe': { type: 'string' },
  'web-cli': { type: 'string' },
  chrome: { type: 'string' },
} })
const { platform } = options
assert(['desktop', 'web'].includes(platform), 'Choose --platform web or desktop')
const desktop = platform === 'desktop'
for (const flag of ['archive', 'host-version', 'zip-dir', ...(desktop ? ['desktop-exe'] : ['web-cli', 'chrome'])]) {
  assert(options[flag], 'Missing --' + flag)
}
options.archive = resolve(options.archive)
options.suite = 'v2-coexistence'

const ocean = { id: 'com.dsh.skin.deep-ocean', name: 'Deep Ocean', source: 'built-in' }
const aurora = { id: 'com.dsh.skin.aurora', name: 'Aurora', source: 'built-in' }
const oceanV2 = { id: 'com.dsh.skin.deep-ocean-v2', name: 'Deep Ocean V2', source: 'local' }
const auroraV2 = { id: 'com.dsh.skin.aurora-v2', name: 'Aurora V2', source: 'local' }
const livingLight = { id: 'com.dsh.skin.deep-ocean-living-light', name: 'Deep Ocean: Living Light VI', source: 'local' }
const all = [ocean, oceanV2, aurora, auroraV2, livingLight]
const imports = await Promise.all([oceanV2, auroraV2, livingLight].map(async skin => {
  const name = skin.id + '.dshskin.zip'
  const bytes = await readFile(resolve(options['zip-dir'], name))
  const manifest = await zipJson(bytes)
  assert.equal(manifest.id, skin.id)
  return { skin, name, bytes, version: manifest.version, sha256: createHash('sha256').update(bytes).digest('hex') }
}))
const output = resolve(options.output)
await mkdir(output, { recursive: true })
const directory = await mkdtemp(join(output, platform + '-'))
console.log('Evidence', directory)
const report = {
  platform, hostVersion: options['host-version'],
  artifact: await identify(options.archive, options['host-version']),
  packages: imports.map(({ skin, name, version, sha256 }) => ({ id: skin.id, name, version, sha256 })),
  steps: {}, sessions: [], launches: [], pageErrors: [],
}
const record = (name, value = true) => {
  report.steps[name] = value
  console.log(platform, name)
}
let fixture, session
async function close() {
  if (!session) return
  const active = session
  session = undefined
  await active.close()
  report.sessions.at(-1).closed = !active.browser.isConnected()
  assert(report.sessions.at(-1).closed, 'Test browser remained connected')
}

async function open(initialAppearance) {
  session = await fixture.open()
  const { page } = session
  const current = { closed: false }
  report.sessions.push(current)
  page.on('pageerror', error => report.pageErrors.push(redact(error.message)))
  await session.show?.()
  await session.resize(1280, 860)
  const ui = await settings(page, desktop, initialAppearance, undefined, true)
  current.viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }))
  const panel = page.locator('[data-dsh-skin-appearance]')
  const activate = (label, scope = panel) => ui.activate(ui.button(scope, label))
  const card = skin => panel.locator('[data-skin-card="' + skin.id + '"]')
  const star = skin => panel.locator('[data-skin-favorite="' + skin.id + '"]')
  const pageTab = name => panel.getByRole('tab', { name, exact: true })
  const previewBar = page.locator('[data-dsh-skin-chat-preview]')
  async function center() {
    if (!await panel.isVisible()) {
      await activate('Appearance Center', page.getByRole('navigation', { name: 'Global panels' }))
    }
    await panel.getByText('Client engine v' + report.artifact.version, { exact: true }).waitFor()
  }
  async function showGallery() {
    const tab = pageTab('Skin gallery')
    if (await tab.getAttribute('aria-selected') !== 'true') await ui.activate(tab)
    const back = ui.button(panel, 'Back to gallery')
    if (await back.isVisible()) await ui.activate(back)
  }
  const packages = packagePanel({ ...ui, panel, pageTab, showGallery, card })
  async function detail(skin) {
    await center()
    await showGallery()
    const target = card(skin)
    await target.getByText(skin.name, { exact: true }).waitFor()
    await ui.activate(target)
    return panel.locator('[data-skin-detail="' + skin.id + '"]')
  }
  async function verifyRendered(skin) {
    await ui.waitForSkin(skin.id)
    const scene = page.locator('[data-dsh-skin-effect-scene="dynamic"]')
    await scene.locator('canvas').waitFor()
    if (skin.source === 'local') {
      const artwork = scene.locator('[data-dsh-skin-effect-layer="artwork"] > img')
      assert(await artwork.evaluate(async image => { await image.decode(); return image.naturalWidth > 1000 }))
    }
  }
  async function apply(skin, setTransparency = false) {
    const region = await detail(skin)
    let transparency
    if (setTransparency) {
      await ui.expand(region.locator('[data-skin-customization] > summary'))
      const slider = region.getByRole('slider', { name: 'Input box transparency', exact: true })
      transparency = Number(await slider.inputValue()) + 1
      await slider.press('ArrowRight')
      assert.equal(Number(await slider.inputValue()), transparency)
    }
    await activate('Apply', region)
    await panel.locator('[data-saved-skin="' + skin.id + '"]').waitFor()
    const selection = await ui.selection()
    assert.equal(selection.skinId, skin.id)
    if (setTransparency) assert.equal(selection.preferences[skin.id].composerTransparency, transparency)
    await activate('Back to chat')
    await verifyRendered(skin)
  }
  async function take(name) {
    await page.screenshot({ path: join(directory, name + '.png'), scale: 'css' })
  }
  async function favorites() {
    await center()
    await showGallery()
    for (const skin of all) assert.equal(await star(skin).getAttribute('aria-pressed'), 'true', skin.id)
    await panel.getByRole('checkbox', { name: 'Favorites only', exact: true }).check()
    const visible = await panel.locator('[data-skin-card]').evaluateAll(cards => cards.map(card => card.dataset.skinCard))
    assert.deepEqual(visible.sort(), all.map(skin => skin.id).sort())
  }
  return { page, ui, panel, packages, center, showGallery, previewBar, activate, star,
    detail, apply, verifyRendered, favorites, take }
}

function identity(catalogue, skins) {
  return skins.map(skin => {
    const entry = catalogue.skins.find(item => item.manifest.id === skin.id)
    assert(entry, 'Missing skin ' + skin.id)
    assert.equal(entry.source, skin.source)
    return { id: entry.manifest.id, source: entry.source, version: entry.manifest.version, revision: entry.revision }
  })
}

try {
  fixture = await prepareHost(options, directory, report.artifact, report)
  let host = await open('dark')
  await host.center()
  const initial = await host.packages.getCatalogue()
  assert.equal(initial.skins.length, 11)
  const originals = identity(initial, [ocean, aurora])
  for (const sample of imports) await host.packages.install(sample.name, sample.bytes)
  const installed = await host.packages.getCatalogue()
  assert.equal(installed.skins.length, initial.skins.length + imports.length)
  const entries = identity(installed, all)
  assert.deepEqual(identity(installed, [ocean, aurora]), originals)
  for (const sample of imports) {
    assert.equal(entries.find(entry => entry.id === sample.skin.id).version, sample.version)
    await host.packages.loadPreview(sample.skin)
  }
  record('catalogue', entries)

  const duplicate = imports[0]
  await host.packages.showManagement()
  const importer = host.panel.getByRole('region', { name: 'Import skin package' })
  await importer.getByLabel('Import .dshskin.zip').setInputFiles({
    name: duplicate.name, mimeType: 'application/zip', buffer: duplicate.bytes,
  })
  const status = host.panel.locator('.dsh-skin-package-status')
  await status.getByRole('status').filter({ hasText: 'This skin is already installed.' }).waitFor()
  await host.ui.expand(status.getByText('Technical details', { exact: true }))
  await status.getByText('duplicate-id', { exact: true }).waitFor()
  const afterDuplicate = await host.packages.getCatalogue()
  assert.equal(afterDuplicate.skins.length, installed.skins.length)
  assert.deepEqual(identity(afterDuplicate, all), entries)
  record('duplicateRejected', duplicate.skin.id)

  for (const skin of all) await host.apply(skin, skin !== livingLight)
  record('appliedAndRendered', all.map(skin => skin.id))
  await host.take('living-light-vi')

  await host.center()
  await host.showGallery()
  const beforeFavorite = await host.ui.selection()
  for (const [i, skin] of [oceanV2, auroraV2, ocean, aurora, livingLight].entries()) {
    assert.equal(await host.star(skin).getAttribute('aria-pressed'), 'false', skin.id)
    await host.ui.activate(host.star(skin))
    assert.equal(await host.star(skin).getAttribute('aria-pressed'), 'true', skin.id)
    if (i < 2) {
      assert.equal(await host.star(ocean).getAttribute('aria-pressed'), 'false')
      assert.equal(await host.star(aurora).getAttribute('aria-pressed'), 'false')
    }
  }
  assert.deepEqual(await host.ui.selection(), beforeFavorite)
  record('favoritesIndependent')

  await host.apply(ocean)
  const beforeCancel = await host.ui.selection()
  await host.activate('Preview in chat', await host.detail(oceanV2))
  await host.ui.waitForSkin(oceanV2.id)
  assert.deepEqual(await host.ui.selection(), beforeCancel)
  await host.activate('Cancel preview', host.previewBar)
  await host.previewBar.waitFor({ state: 'detached' })
  await host.ui.waitForSkin(ocean.id)
  assert.deepEqual(await host.ui.selection(), beforeCancel)
  record('previewCancelled', { restored: ocean.id, preview: oceanV2.id })

  await host.apply(aurora)
  const beforeExpiry = await host.ui.selection()
  const target = await host.detail(auroraV2)
  const start = performance.now()
  await host.activate('Preview in chat', target)
  await host.ui.waitForSkin(auroraV2.id)
  await host.previewBar.getByRole('timer').waitFor()
  const countdown = await host.previewBar.getByRole('timer').textContent()
  assert.match(countdown, /^Preview ends in (?:30|29|28)s$/)
  assert.deepEqual(await host.ui.selection(), beforeExpiry)
  await host.take('aurora-v2-preview')
  await host.previewBar.waitFor({ state: 'detached', timeout: 36_000 })
  const elapsedMs = Math.round(performance.now() - start)
  assert(elapsedMs >= 27_000 && elapsedMs <= 34_000, 'Unexpected preview duration ' + elapsedMs)
  await host.ui.waitForSkin(aurora.id)
  assert.deepEqual(await host.ui.selection(), beforeExpiry)
  record('previewExpired', { restored: aurora.id, preview: auroraV2.id, elapsedMs, countdown })

  await host.apply(oceanV2)
  const beforeRestart = await host.ui.selection()
  await close()
  host = await open(null)
  assert.deepEqual(await host.ui.selection(), beforeRestart)
  await host.verifyRendered(oceanV2)
  await host.favorites()
  const restarted = await host.packages.getCatalogue()
  assert.deepEqual(identity(restarted, all), entries)
  if (!desktop) assert.equal(report.launches[0].origin, report.launches[1].origin, 'Web origin changed')
  await host.take('favorites-after-restart')
  await host.panel.getByRole('checkbox', { name: 'Favorites only', exact: true }).uncheck()
  record('restartPreserved', { active: oceanV2.id, favorites: all.map(skin => skin.id),
    transparency: Object.fromEntries(all.slice(0, 4).map(skin => [
      skin.id, beforeRestart.preferences[skin.id].composerTransparency,
    ])) })

  await host.apply(auroraV2)
  await host.center()
  const beforeFirstRemoval = await host.ui.selection()
  await host.packages.remove(oceanV2)
  const afterFirst = await host.packages.getCatalogue()
  assert.equal(afterFirst.skins.length, installed.skins.length - 1)
  assert.deepEqual(identity(afterFirst, [ocean, aurora, auroraV2, livingLight]), entries.filter(entry => entry.id !== oceanV2.id))
  assert.equal((await host.ui.selection()).skinId, auroraV2.id)
  for (const skin of [ocean, aurora, auroraV2, livingLight]) {
    assert.deepEqual((await host.ui.selection()).preferences[skin.id], beforeFirstRemoval.preferences[skin.id])
  }

  await host.apply(livingLight)
  await host.center()
  await host.packages.remove(auroraV2)
  const afterSecond = await host.packages.getCatalogue()
  assert.equal(afterSecond.skins.length, installed.skins.length - 2)
  assert.deepEqual(identity(afterSecond, [ocean, aurora, livingLight]),
    entries.filter(entry => [ocean.id, aurora.id, livingLight.id].includes(entry.id)))
  const finalSelection = await host.ui.selection()
  assert.equal(finalSelection.skinId, livingLight.id)
  for (const skin of [ocean, aurora, livingLight]) {
    assert.deepEqual(finalSelection.preferences[skin.id], beforeRestart.preferences[skin.id])
    assert.equal(await host.star(skin).getAttribute('aria-pressed'), 'true')
  }
  await host.activate('Back to chat')
  await host.verifyRendered(livingLight)
  record('uninstalledIndependently', { removed: [oceanV2.id, auroraV2.id], finalActive: livingLight.id })
  assert.deepEqual(report.pageErrors, [])
  report.passed = true
} catch (error) {
  report.failure = redact(error.stack ?? String(error))
  console.error(report.failure)
  process.exitCode = 1
} finally {
  try {
    await close()
  } catch (error) {
    report.cleanupFailure = redact(error.stack ?? String(error))
    console.error(report.cleanupFailure)
    process.exitCode = 1
  } finally {
    for (const launch of report.launches) delete launch.log
    await writeFile(join(directory, 'result.json'), JSON.stringify(report, null, 2) + '\n')
  }
}
