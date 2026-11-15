import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { checkMainPackageNavigation } from './appearance-navigation.mjs'
import { deepOcean, resources, showMode } from './browser.mjs'
import { seedCatalogue } from './catalogue.mjs'
import { zipJson } from './packages.mjs'
import { versionedSkin } from '../../test/fixtures/package-versions.mjs'

const aurora = { id: 'com.dsh.skin.aurora' }
const bySkin = (main, skin) => main.locator(`[data-skin-card="${skin.id}"]`)
const previewBar = page => page.locator('[data-dsh-skin-chat-preview]')
const composer = page => page.locator('[data-composer-input]:visible').first()
const workspace = page => page.locator('[data-dsh-skin-appearance]')
const launcher = (page, name = 'Appearance Center') =>
  page.getByRole('navigation', { name: 'Global panels' }).getByRole('button', { name, exact: true })
const slide = async (page, directory, filename) => page.screenshot({ path: join(directory, filename), scale: 'css' })

async function exportSkin(ui, main, actions, directory) {
  const desktop = ui.page.url().startsWith('dsh-app:')
  const filename = versionedSkin.id + '.dshskin.zip'
  const path = join(directory, filename)
  let bytes
  if (desktop) {
    await ui.activate(ui.button(actions, 'Export ZIP'))
    await main.getByRole('status').filter({ hasText: 'Skin archive saved to Downloads.' }).waitFor()
    bytes = await readFile(join(directory, 'downloads', filename))
    await writeFile(path, bytes)
  } else {
    const [download] = await Promise.all([ui.page.waitForEvent('download'), ui.activate(ui.button(actions, 'Export ZIP'))])
    assert.equal(download.suggestedFilename(), filename)
    await download.saveAs(path)
    bytes = await readFile(path)
  }
  const manifest = await zipJson(bytes)
  assert.deepEqual([manifest.id, manifest.version], [versionedSkin.id, '1.0.0'])
  return { filename, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), nativeSave: desktop, version: manifest.version }
}

export async function savePeerSelection(page, skin, expectedRevision) {
  return page.evaluate(async ({ id, expectedRevision }) => {
    const catalogue = await fetch('api/dsh-skin-engine/skins').then(response => response.json())
    const target = catalogue.skins.find(item => item.manifest.id === id)
    const response = await fetch('api/dsh-skin-engine/selection/apply', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ skinId: id, packageRevision: target.revision, expectedRevision }),
    })
    if (!response.ok) throw Error(`Concurrent save returned ${response.status}`)
    return response.json()
  }, { id: skin.id, expectedRevision })
}

export async function checkNavigationReleaseHost(ui, session, directory, evidence) {
  const { page, activate, button, selection, waitForSkin } = ui
  const main = workspace(page)
  const bar = previewBar(page)
  const launch = launcher(page)
  async function go() {
    if (!await main.isVisible()) await activate(launch)
    await main.waitFor()
    await main.locator('[data-saved-skin]').waitFor()
    await main.getByRole('status').filter({ hasText: /^Loading…$/ }).waitFor({ state: 'hidden' })
  }
  const back = () => activate(button(main, 'Back to chat'))
  const tab = name => main.getByRole('tab', { name, exact: true })
  await page.getByRole('treeitem', { name: /Skin Engine acceptance history|Untitled/ }).first().press('Enter')
  const reply = page.getByText('Fixture response.', { exact: true })
  await reply.waitFor()
  const before = await selection()
  await go()
  assert.equal(await launch.count(), 1)
  await activate(tab('Skin gallery'))
  await bySkin(main, deepOcean).press('Enter')
  await activate(button(main, 'Adjust effects'))
  const quality = main.getByRole('combobox', { name: 'Skin effect quality' })
  await quality.selectOption('low')
  await back()
  await reply.waitFor()
  await activate(launcher(page, 'Plugins'))
  await go()
  assert.equal(await quality.inputValue(), 'low')
  assert.deepEqual(await selection(), before)
  const collapse = page.getByRole('button', { name: 'Collapse sidebar', exact: true }).first()
  await collapse.click()
  const expand = page.getByRole('button', { name: 'Open sidebar', exact: true }).first()
  await expand.waitFor()
  const collapsedEntryVisible = await launch.isVisible()
  await expand.click()
  await expand.waitFor({ state: 'hidden' })
  await launch.waitFor()
  // Re-enter from chat after the host's sidebar transition and refresh settle.
  await back()
  await reply.waitFor()
  await go()
  const unpin = page.getByRole('button', { name: 'Unpin Appearance Center from sidebar', exact: true })
  const unpinAvailable = Boolean(await unpin.count())
  evidence.navigation = { returnedToFixtureChat: true, otherPanel: true, collapsedEntryVisible, unpinAvailable }
  if (unpinAvailable) {
    await unpin.press('Enter')
    await launch.waitFor({ state: 'hidden' })
    const more = page.getByRole('button', { name: 'More', exact: true }).first()
    await more.press('Enter')
    const pin = page.getByRole('menuitem', { name: 'Pin Appearance Center to sidebar', exact: true })
    if (await pin.count()) {
      await pin.press('Enter')
      await launch.waitFor()
      evidence.navigation.rePinned = true
    } else {
      evidence.navigation.rePinned = false
      throw Error('Native unpin removed the entry without an accessible pin action')
    }
  }

  const preview = () => activate(button(main, 'Preview in chat'))
  await preview()
  await reply.waitFor()
  await composer(page).waitFor()
  await waitForSkin(deepOcean.id)
  await button(bar, 'Apply').waitFor()
  assert.deepEqual(await selection(), before)
  const disjoint = await page.evaluate(() => {
    const toolbar = document.querySelector('[data-dsh-skin-chat-preview]').getBoundingClientRect()
    const input = document.querySelector('[data-composer-input]').getBoundingClientRect()
    return toolbar.bottom <= input.top || toolbar.right <= input.left || toolbar.left >= input.right
  })
  assert(disjoint, 'The chat preview must leave the composer free')
  await slide(page, directory, 'chat-preview.png')
  const start = performance.now()
  await bar.waitFor({ state: 'detached', timeout: 36_000 })
  const expiryMs = Math.round(performance.now() - start)
  assert(expiryMs >= 27_000 && expiryMs <= 33_000)
  await waitForSkin(before.skinId)
  await go()
  await preview()
  await button(bar, 'Cancel preview').waitFor()
  await activate(launcher(page, 'Plugins'))
  await bar.waitFor({ state: 'detached' })
  await waitForSkin(before.skinId)
  await go()
  await preview()
  await button(bar, 'Cancel preview').press('Enter')
  await bar.waitFor({ state: 'detached' })
  assert.deepEqual(await selection(), before)
  await go()
  await preview()
  await button(bar, 'Apply').waitFor()
  await page.evaluate(() => document.body.setAttribute('data-we-wallpaper', 'nav-06-ownership-fixture'))
  try {
    await bar.getByText('Wallpaper Engine owns the backdrop.').waitFor()
    await waitForSkin(before.skinId)
    await composer(page).waitFor()
    await slide(page, directory, 'wallpaper-ownership-fixture.png')
  } finally {
    await page.evaluate(() => document.body.removeAttribute('data-we-wallpaper'))
  }
  await button(bar, 'Dismiss').press('Enter')
  evidence.coexistence = { wallpaperOwnershipSignalOnly: true, composerUsable: true }
  await go()
  await preview()
  await button(bar, 'Apply').press('Enter')
  await bar.waitFor({ state: 'detached' })
  const saved = await selection()
  assert.equal(saved.skinId, deepOcean.id)
  assert.equal(saved.preferences[deepOcean.id].quality, 'low')
  evidence.preview = { expiryMs, avoidsComposer: disjoint, applySavedRevision: saved.revision,
    globalNavigationCancels: true, toolbarCancel: true }

  await go()
  await quality.selectOption('high')
  let peer
  let peerSaved
  const applyPath = '**/api/dsh-skin-engine/selection/apply'
  const collision = page.waitForResponse(response =>
    response.url().endsWith('/selection/apply') && response.request().method() === 'POST' && response.status() === 409)
  const writeWithOlderRevision = async route => {
    try {
      peer = await session.openPeer?.()
      peerSaved = peer ? await savePeerSelection(peer, aurora, saved.revision) : peerSaved
    } finally {
      await route.continue()
    }
  }
  if (session.openPeer) {
    await page.route(applyPath, writeWithOlderRevision, { times: 1 })
  } else {
    peerSaved = await savePeerSelection(page, aurora, saved.revision)
  }
  try {
    await button(main, 'Apply').press('Enter')
    await collision
    await main.getByRole('status').filter({ hasText: 'Another window saved a different selection or preferences.' }).waitFor()
    assert.deepEqual(await selection(), peerSaved)
    assert.equal(await quality.inputValue(), 'high')
    await slide(page, directory, 'profile-conflict.png')
    await activate(button(main, 'Keep draft and use current profile revision'))
    await activate(button(main, 'Apply'))
    await main.locator(`[data-saved-skin="${deepOcean.id}"]`).waitFor()
    evidence.state = { usedSeparateWebPage: Boolean(peer), status: 409, protectedDraft: 'high', recovered: true }
  } finally {
    if (session.openPeer) await page.unroute(applyPath, writeWithOlderRevision)
    await peer?.close()
  }

  await activate(tab('Skin gallery'))
  await tab('Skin gallery').press('ArrowRight')
  await tab('Effects & performance').waitFor()
  assert.equal(await tab('Effects & performance').getAttribute('aria-selected'), 'true')
  await ui.open()
  await ui.appearance('light')
  await page.keyboard.press('Escape')
  await ui.panel.waitFor({ state: 'hidden' })
  await session.resize(762, 820)
  await page.emulateMedia({ forcedColors: 'active' })
  try {
    await activate(tab('Skin gallery'))
    const geometry = await main.evaluate(node => ({
      viewport: innerWidth, width: node.clientWidth, scrollWidth: node.scrollWidth,
      forcedColors: matchMedia('(forced-colors: active)').matches,
      scheme: getComputedStyle(document.documentElement).colorScheme,
    }))
    assert(geometry.viewport >= 760 && geometry.forcedColors)
    assert.equal(geometry.width, geometry.scrollWidth)
    await slide(page, directory, 'appearance-light-forced-colors.png')
    evidence.usability = geometry
  } finally { await page.emulateMedia({ forcedColors: null }) }
  await session.resize(1280, 820)
  await page.waitForFunction(() => innerWidth >= 1250)
  const account = page.getByRole('button', { name: /Account menu/ })
  await account.or(expand).first().waitFor()
  if (await expand.isVisible()) await expand.click({ timeout: 2500 }).catch(async error => {
    if (!await account.isVisible()) throw error
  })
  await ui.open()
  await ui.appearance('dark')
  await ui.close()
  await back()
  if (session.hide) {
    try { await checkDrawPause(ui, session, evidence) }
    catch (error) { evidence.windowDraws = { error: error.message } }
  }
  await go()
  await checkMainPackageNavigation(ui, main, launch, evidence, actions => exportSkin(ui, main, actions, directory))
  await main.locator('[data-saved-skin]').waitFor()
  await activate(tab('Effects & performance'))
  await quality.selectOption('low')
  await back()
  await composer(page).waitFor()
  return selection()
}

export async function checkNavigationUninstall(ui, session, uninstall, evidence, directory) {
  const { page } = ui
  const capture = () => page.evaluate(() => {
    const root = document.documentElement
    const sidebar = document.querySelector('[data-slot="sidebar"]')
    const composer = document.querySelector('[data-composer-card]:has([data-composer-input])')
    if (!sidebar || !composer) throw Error('Native sidebar or composer is missing')
    return {
      id: root.getAttribute('data-dsh-skin-id'),
      canvasToken: getComputedStyle(document.body).getPropertyValue('--dsw-alias-bg-base').trim(),
      sidebarToken: getComputedStyle(sidebar).getPropertyValue('--dsw-specific-sidebar-fill').trim(),
      composerFill: getComputedStyle(composer).backgroundColor,
    }
  })
  await page.getByRole('treeitem', { name: /Skin Engine acceptance history|Untitled/ }).first().press('Enter')
  const reply = page.getByText('Fixture response.', { exact: true })
  await reply.waitFor()
  await composer(page).waitFor()
  evidence.native = await capture()
  assert.equal(evidence.native.id, null)
  await showMode(ui, 'p0', session.show)
  evidence.active = await capture()
  assert.equal(evidence.active.id, deepOcean.id)
  for (const surface of ['canvasToken', 'sidebarToken', 'composerFill']) {
    assert(evidence.active[surface], `Missing active ${surface}`)
    assert.notEqual(evidence.active[surface], evidence.native[surface], `${surface} did not respond to the skin`)
  }
  await slide(page, directory, 'active-surfaces.png')
  await ui.activate(launcher(page))
  const main = workspace(page)
  await main.locator('[data-saved-skin]').waitFor()
  await uninstall()
  evidence.removedFromProfile = true
  await launcher(page).waitFor({ state: 'detached' })
  await main.waitFor({ state: 'detached' })
  await reply.waitFor()
  await composer(page).waitFor()
  await page.locator(resources).first().waitFor({ state: 'detached' })
  assert.equal(await previewBar(page).count(), 0)
  evidence.restored = await capture()
  assert.deepEqual(evidence.restored, evidence.native)
  evidence.selectionRoute = await page.evaluate(async () => {
    const response = await fetch(new URL('api/dsh-skin-engine/selection', document.baseURI), { cache: 'no-store' })
    return response.status
  })
  assert.equal(evidence.selectionRoute, 404)
  await slide(page, directory, 'native-after-uninstall.png')
}

export async function checkNavigationVisibility(ui, session, evidence, directory) {
  const { page } = ui
  const main = workspace(ui.page)
  await page.evaluate(() => {
    const schedule = window.requestAnimationFrame
    const probe = { scheduled: 0, restore() { window.requestAnimationFrame = schedule } }
    window.__navReleaseFrames = probe
    window.requestAnimationFrame = function (callback) {
      if (new Error().stack?.includes('dsh-plugin-skin-engine')) probe.scheduled++
      return schedule.call(this, callback)
    }
  })
  async function sample() {
    const read = () => page.evaluate(() => window.__navReleaseFrames.scheduled)
    const start = await read()
    await delay(650)
    return await read() - start
  }
  try {
    await ui.waitForSkin(null)
    const defaultFrames = await sample()
    assert.equal(defaultFrames, 0, 'Native appearance must leave the plugin scheduler idle')
    await ui.activate(launcher(page))
    await ui.activate(bySkin(main, deepOcean))
    await ui.activate(ui.button(main, 'Apply'))
    await main.locator(`[data-saved-skin="${deepOcean.id}"]`).waitFor()
    await ui.activate(ui.button(main, 'Back to chat'))
    await ui.waitForSkin(deepOcean.id)
    await checkDrawPause(ui, session, evidence)
    const dynamicFrames = await sample()
    assert(dynamicFrames > 0, 'The probe must identify callbacks from the active plugin bundle')
    await ui.open()
    const mode = ui.panel.getByRole('combobox', { name: 'Effects in this window' })
    await mode.selectOption('off')
    await ui.close()
    const offFrames = await sample()
    assert.equal(offFrames, 0, 'Effects Off must release the plugin scheduler')
    assert.equal((await ui.selection()).skinId, deepOcean.id)
    evidence.idleFrames = { sampleMs: 650, defaultFrames, dynamicFrames, offFrames, savedSkinPreserved: true }
    await checkNavigationKeyboard(ui, session, directory, evidence)
  } finally {
    await page.evaluate(() => {
      window.__navReleaseFrames?.restore()
      delete window.__navReleaseFrames
    })
  }
}

async function checkNavigationKeyboard(ui, session, directory, evidence) {
  const { page } = ui
  const main = workspace(page)
  const tab = name => main.getByRole('tab', { name, exact: true })
  const gallery = tab('Skin gallery')
  const effects = tab('Effects & performance')
  const management = tab('Skin management')
  const focused = async control => {
    const element = await control.elementHandle()
    try { await page.waitForFunction(node => node === document.activeElement && node.matches(':focus-visible'), element) }
    finally { await element.dispose() }
  }
  await launcher(page).press('Enter')
  await main.locator('[data-saved-skin]').waitFor()
  await gallery.press('ArrowRight')
  await focused(effects)
  assert.equal(await effects.getAttribute('aria-selected'), 'true')
  await effects.press('End')
  await focused(management)
  assert.equal(await management.getAttribute('aria-selected'), 'true')
  await management.press('Home')
  await focused(gallery)
  assert.equal(await gallery.getAttribute('aria-selected'), 'true')
  await gallery.press('Tab')
  const galleryPanel = main.getByRole('tabpanel', { name: 'Skin gallery' })
  assert(await galleryPanel.evaluate(node => node.contains(document.activeElement)))
  await session.resize(762, 820)
  await page.waitForFunction(() => innerWidth >= 760 && innerWidth < 800)
  await page.emulateMedia({ forcedColors: 'active' })
  try {
    const card = bySkin(main, deepOcean)
    const back = ui.button(main, 'Back to gallery')
    if (await back.isVisible()) await back.press('Enter')
    await card.waitFor()
    await card.press('Enter')
    await focused(back)
    await slide(page, directory, 'keyboard-narrow-detail.png')
    await back.press('Enter')
    await focused(card)
    await slide(page, directory, 'keyboard-narrow-gallery.png')
  } finally {
    await page.emulateMedia({ forcedColors: null })
    await session.resize(1280, 820)
  }
  await ui.open()
  await page.keyboard.press('Escape')
  await ui.panel.waitFor({ state: 'hidden' })
  const account = page.getByRole('button', { name: 'Account menu', exact: true })
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Account menu')
  assert(await account.isVisible())
  evidence.keyboard = { arrowsHomeEnd: true, tabEntersPanel: true, narrowDetailAndGalleryFocus: true, forcedColors: true, settingsEscapeFocus: true }
}

async function checkDrawPause(ui, session, evidence) {
  const { page, panel } = ui
  assert(session.hide && session.show, 'The host must expose a native visibility transition')
  const read = () => page.evaluate(() => window.__navReleaseDraws)
  const setMode = async value => {
    await ui.open()
    await panel.getByRole('combobox', { name: 'Effects in this window' }).selectOption(value)
    await ui.close()
  }
  await page.evaluate(() => {
    const prototype = CanvasRenderingContext2D.prototype
    const clear = prototype.clearRect
    window.__navReleaseDraws = 0
    prototype.clearRect = function (...args) {
      if (this.canvas.matches('canvas[data-dsh-skin-effect-layer="canvas"]')) window.__navReleaseDraws++
      return clear.apply(this, args)
    }
    window.__navReleaseRestore = () => { prototype.clearRect = clear; delete window.__navReleaseDraws; delete window.__navReleaseRestore }
  })
  try {
    const initial = await read()
    await delay(550)
    const foregroundDraws = await read() - initial
    assert(foregroundDraws > 0, 'The active skin must draw in the foreground')
    await session.hide()
    await page.waitForFunction(() => document.visibilityState === 'hidden', null, { polling: 100, timeout: 8000 })
      .catch(() => { throw Error('The host did not enter the hidden document state') })
    const hidden = await read()
    await delay(800)
    const hiddenDraws = await read() - hidden
    assert.equal(hiddenDraws, 0)
    await session.show()
    await page.waitForFunction(() => document.visibilityState === 'visible', null, { polling: 100, timeout: 8000 })
      .catch(() => { throw Error('The host did not resume the visible document state') })
    const shown = await read()
    await delay(550)
    const resumedDraws = await read() - shown
    assert(resumedDraws > 0)
    await setMode('off')
    const off = await read()
    await delay(550)
    const offDraws = await read() - off
    assert.equal(offDraws, 0)
    await setMode('dynamic')
    evidence.windowDraws = { foregroundDraws, hiddenDraws, resumedDraws, offDraws, hiddenMs: 800 }
  } finally {
    try { await session.show() }
    finally { await page.evaluate(() => window.__navReleaseRestore?.()) }
  }
}

export async function checkNavigationRestart(ui, saved, directory, evidence) {
  const { page, activate, selection, waitForSkin } = ui
  await waitForSkin(saved.skinId)
  assert.deepEqual(await selection(), saved)
  assert.equal(await previewBar(page).count(), 0)
  const launch = launcher(page)
  assert.equal(await launch.count(), 1)
  await activate(launch)
  const main = workspace(page)
  await activate(ui.button(main, 'Adjust effects'))
  assert.equal(await main.getByRole('combobox', { name: 'Skin effect quality' }).inputValue(), 'high')
  await slide(page, directory, 'appearance-restarted.png')
  evidence.restart = { savedRevision: saved.revision, savedQuality: 'high', singleEntry: true, previewCleared: true }
}

export async function checkNavigationCatalogue(ui, profileDir, evidence) {
  const { page, activate, button } = ui
  const main = workspace(page)
  const toManagement = () => activate(main.getByRole('tab', { name: 'Skin management' }))
  const sample = []
  for (const size of [10, 100]) {
    await seedCatalogue(profileDir, size === 10 ? 0 : 10, size)
    await toManagement()
    await ui.expand(main.getByText('Catalogue maintenance', { exact: true }))
    await activate(button(main, 'Reload skins'))
    const fetchCatalogue = force => page.evaluate(async force => {
      const started = performance.now()
      const response = await fetch(`api/dsh-skin-engine/skins${force ? '?refresh=1' : ''}`)
      if (!response.ok) throw Error(`Catalogue HTTP ${response.status}`)
      const { skins } = await response.json()
      return { revisions: skins.filter(item => item.manifest.id.startsWith('fixture.scale-')).map(item => item.revision),
        ms: Math.round((performance.now() - started) * 10) / 10 }
    }, force)
    const cold = await fetchCatalogue(true)
    const hot = await fetchCatalogue(false)
    assert.equal(cold.revisions.length, size)
    assert.deepEqual(hot.revisions, cold.revisions)
    const requests = new Set()
    const record = request => {
      const url = new URL(request.url())
      const id = url.searchParams.get('id')
      if (url.pathname.endsWith('/asset') && url.searchParams.has('scheme') && id?.startsWith('fixture.scale-')) requests.add(id)
    }
    page.on('request', record)
    try {
      await activate(main.getByRole('tab', { name: 'Skin gallery' }))
      await main.getByRole('combobox', { name: 'Source', exact: true }).selectOption('local')
      const cards = main.locator('[data-skin-card^="fixture.scale-"]')
      await cards.nth(size - 1).waitFor()
      assert.equal(await cards.count(), size)
      const initial = requests.size
      const lastId = await cards.last().getAttribute('data-skin-card')
      if (size === 100) assert(!requests.has(lastId), 'Offscreen thumbnail was requested before scrolling')
      await cards.last().scrollIntoViewIfNeeded()
      await page.waitForFunction(id => {
        const image = document.querySelector(`[data-skin-card="${id}"] img`)
        return image?.complete && image.naturalWidth > 0
      }, lastId)
      sample.push({ size, coldMs: cold.ms, hotMs: hot.ms, initialImages: initial, afterScrollImages: requests.size })
    } finally {
      page.off('request', record)
    }
  }
  evidence.catalogue = sample
  await appendFile(join(profileDir, 'cordis.patch.yml'), '\n- id: dsh-skin-engine\n  disabled: true\n')
  await main.waitFor({ state: 'detached' })
  await launcher(page).waitFor({ state: 'detached' })
  await composer(page).waitFor()
  await page.waitForFunction(selector => !document.querySelector(selector), resources)
  assert.equal(await previewBar(page).count(), 0)
  evidence.cleanup = { returnedToChat: true, launcherRemoved: true, styleAndEffectsRemoved: true }
}
