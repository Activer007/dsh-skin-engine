import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { buffer } from 'node:stream/consumers'
import { setTimeout as delay } from 'node:timers/promises'
import { fromBufferPromise } from 'yauzl'

const base = 'api/dsh-skin-engine'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

export async function zipJson(bytes, name = 'skin.json') {
  const zip = await fromBufferPromise(bytes)
  try {
    for await (const entry of zip.eachEntry()) {
      if (entry.fileName === name) return JSON.parse(await buffer(await zip.openReadStreamPromise(entry)))
    }
  } finally { zip.close() }
  throw Error(`No ${name} in the archive`)
}

export function packagePanel(ui, foreground) {
  const { page, panel, button, detail, activate } = ui
  const gallery = panel.getByRole('region', { name: 'Skin gallery', exact: true })
  const importer = panel.getByRole('region', { name: 'Import skin package' })
  const getCatalogue = () => page.evaluate(async path => {
    const start = performance.now()
    const response = await fetch(new URL(`${path}/skins`, document.baseURI), { cache: 'no-store' })
    if (!response.ok) throw Error(`Catalogue returned HTTP ${response.status}`)
    return { ...await response.json(), ms: Math.round(performance.now() - start) }
  }, base)
  const install = async (name, bytes) => {
    await importer.getByLabel('Import .dshskin.zip').setInputFiles({ name, mimeType: 'application/zip', buffer: bytes })
    await importer.getByRole('status').filter({ hasText: 'Skin installed.' }).waitFor()
  }
  async function remove(skin) {
    const actions = detail(skin).locator('details').filter({ has: page.locator('summary').filter({ hasText: /^Package actions$/ }) })
    const uninstall = button(actions, 'Uninstall…')
    if (!await uninstall.isVisible()) await activate(actions.locator('summary'))
    await activate(uninstall)
    await activate(button(actions, 'Confirm uninstall'))
    await gallery.getByRole('button', { name: new RegExp(`^${RegExp.escape(skin.name)} `) }).waitFor({ state: 'detached' })
  }

  async function loadPreview(skin) {
    await foreground?.()
    const image = gallery.getByRole('button', { name: new RegExp(`^${RegExp.escape(skin.name)} `) }).locator('img')
    const handle = await image.elementHandle()
    try {
      await handle.evaluate(node => node.scrollIntoView({ block: 'nearest' }))
      await page.waitForFunction(node => node.complete && node.naturalWidth > 0, handle, { polling: 100, timeout: 10_000 })
    } finally { await handle.dispose() }
    return image.evaluate(node => ({ width: node.naturalWidth, height: node.naturalHeight }))
  }
  return { getCatalogue, install, remove, loadPreview }
}

export async function checkPackages(sampleDir, profileDir, evidence, openWindow) {
  let window = await openWindow()
  await window.ui.open()
  const initial = await packagePanel(window.ui).getCatalogue()
  assert(initial.skins.length >= 3)
  assert(initial.skins.every(skin => skin.source === 'built-in'))
  evidence.roundTrips = []
  for (const directory of ['deep-ocean', 'aurora', 'obsidian-neon']) {
    const { page, panel, button, detail, activate, close, choose, apply, waitForSkin, selection } = window.ui
    const { getCatalogue, install, loadPreview } = packagePanel(window.ui, window.foreground)
    const name = `${directory}.dshskin.zip`
    const source = await readFile(join(sampleDir, name))
    const manifest = await zipJson(source)
    const skin = { id: manifest.id, name: manifest.name }
    assert(manifest.id.endsWith('.sample'))
    await install(name, source)
    await choose(skin)
    const { width: previewWidth } = await loadPreview(skin)
    const before = await selection()
    await activate(button(detail(skin), 'Preview'))
    await waitForSkin(skin.id)
    assert.deepEqual(await selection(), before)
    await activate(button(panel, 'Cancel preview'))
    await waitForSkin(before.skinId)
    await apply(skin)
    const installed = (await getCatalogue()).skins.find(item => item.manifest.id === skin.id)
    assert(installed?.managed)
    const exported = Buffer.from(await page.evaluate(async ({ base, id, revision }) => {
      const url = new URL(`${base}/packages/export`, document.baseURI)
      url.search = new URLSearchParams({ id, revision, assets: '1' })
      const response = await fetch(url)
      if (!response.ok) throw Error(`Export returned HTTP ${response.status}`)
      const bytes = new Uint8Array(await response.arrayBuffer())
      let binary = ''
      for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
      return btoa(binary)
    }, { base, id: skin.id, revision: installed.revision }), 'base64')
    const exportedManifest = await zipJson(exported)
    assert.equal(exportedManifest.id, manifest.id)
    assert.equal(exportedManifest.version, manifest.version)
    const saved = await selection()
    await close()
    window = await openWindow(null)
    const restarted = window.ui
    await restarted.waitForSkin(skin.id)
    assert.deepEqual(await restarted.selection(), saved)
    await restarted.open()
    const restartedPackages = packagePanel(restarted, window.foreground)
    async function removeAndCheckDefault() {
      await restartedPackages.remove(skin)
      await restarted.waitForSkin(null)
      assert.equal((await restarted.selection()).skinId, null)
      assert.equal(await restarted.page.locator('[data-dsh-skin-effect-scene],[data-dsh-skin-effect-layer]').count(), 0)
    }
    await removeAndCheckDefault()
    await restartedPackages.install(name, exported)
    await restarted.apply(skin)
    await removeAndCheckDefault()
    evidence.roundTrips.push({ id: skin.id, previewWidth, inputSha256: hash(source), exportedSha256: hash(exported), restarted: true })
  }
  const { ui, foreground } = window
  const { page, panel, open, close } = ui
  const { getCatalogue, loadPreview } = packagePanel(ui, foreground)
  await close()

  const root = join(profileDir, 'skin-engine', 'packages')
  const { manifest } = initial.skins[0]
  const preview = await readFile(new URL(
    '../../DSH_Skin_Engine_Development_Pack_v1.0/examples/skins/deep-ocean/preview/dark.png', import.meta.url,
  ))
  evidence.catalogue = []
  for (const count of [10, 100]) {
    for (let index = count === 10 ? 0 : 10; index < count; index++) {
      const id = `fixture.scale-${index}`
      const dir = join(root, id)
      await mkdir(join(dir, 'preview'), { recursive: true })
      await Promise.all([
        writeFile(join(dir, 'skin.json'), JSON.stringify({ ...manifest, id, name: id })),
        writeFile(join(dir, 'preview', 'dark.png'), preview),
      ])
    }
    const result = await getCatalogue()
    const fixtures = result.skins.filter(item => item.source === 'local')
    assert.equal(fixtures.length, count)
    assert.equal(result.skins.length, initial.skins.length + count)
    assert.equal(result.issues.length, 0)
    const gallery = panel.getByRole('region', { name: 'Skin gallery', exact: true })
    const requests = new Set()
    const recordPreview = request => {
      const url = new URL(request.url())
      const id = url.searchParams.get('id')
      if (url.pathname.endsWith(`/${base}/asset`) && url.searchParams.has('scheme') && id?.startsWith('fixture.scale-')) requests.add(id)
    }
    page.on('request', recordPreview)
    try {
      await page.reload()
      await ui.dismissOnboarding()
      const started = performance.now()
      await open()
      await gallery.getByRole('combobox', { name: 'Source', exact: true }).selectOption('local')
      const cards = gallery.locator('.dsh-skin-gallery button')
      assert.equal(await cards.count(), count)
      const first = fixtures[0].manifest
      const last = fixtures.at(-1).manifest
      assert.equal((await loadPreview(first)).width, 1280)
      const firstPreviewMs = Math.round(performance.now() - started)
      const initialRequests = requests.size
      assert(requests.has(first.id))
      if (count === 100) assert(!requests.has(last.id), 'Offscreen thumbnails should load on demand')
      assert.equal((await loadPreview(last)).width, 1280)
      assert(requests.has(last.id))
      await close()
      evidence.catalogue.push({ count, total: result.skins.length, ms: result.ms,
        previewBytes: preview.length, firstPreviewMs, initialRequests, afterScrollRequests: requests.size })
    } finally { page.off('request', recordPreview) }
  }
}

export async function contrast(locator, outline = false, screenshot) {
  return locator.evaluate(async (node, { outline, screenshot }) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext('2d')
    const rgb = () => Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3)
    const paint = color => {
      ctx.fillStyle = color
      ctx.fillRect(0, 0, 1, 1)
    }
    if (screenshot) {
      const image = new Image()
      image.src = screenshot
      await image.decode()
      const box = node.getBoundingClientRect()
      const x = Math.max(0, Math.floor(box.left) - 4)
      const y = Math.floor(box.top + box.height / 2)
      ctx.drawImage(image, x, y, 1, 1, 0, 0, 1, 1)
    } else {
      const layers = []
      for (let parent = outline ? node.parentElement : node; parent; parent = parent.parentElement) {
        layers.push(getComputedStyle(parent).backgroundColor)
      }
      paint(getComputedStyle(document.documentElement).colorScheme === 'dark' ? '#000' : '#fff')
      layers.reverse().forEach(paint)
    }
    const background = rgb()
    const style = getComputedStyle(node)
    paint(outline ? style.outlineColor : style.color)
    const foreground = rgb()
    const luminance = color => color.reduce((sum, value, index) => {
      const channel = value / 255
      const linear = channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
      return sum + linear * [0.2126, 0.7152, 0.0722][index]
    }, 0)
    const [dark, light] = [luminance(background), luminance(foreground)].sort((a, b) => a - b)
    return { foreground, background, ratio: (light + 0.05) / (dark + 0.05) }
  }, { outline, screenshot })
}

export const palette = page => page.locator('body').evaluate(node => {
  const style = getComputedStyle(node)
  return {
    canvas: style.getPropertyValue('--dsw-alias-bg-base').trim(),
    sidebar: style.getPropertyValue('--dsw-specific-sidebar-fill').trim(),
  }
})

async function checkFilters(ui, manifest) {
  const gallery = ui.panel.getByRole('region', { name: 'Skin gallery', exact: true })
  const cards = gallery.locator('.dsh-skin-gallery button')
  const card = cards.filter({ hasText: manifest.name })
  const search = gallery.getByRole('searchbox', { name: 'Search skins' })
  const tag = gallery.getByRole('combobox', { name: 'Tag', exact: true })
  const source = gallery.getByRole('combobox', { name: 'Source', exact: true })
  const names = [manifest.name, manifest.nameEn].filter(Boolean)
  const matchTag = manifest.tags?.find(value => !['dark', 'light', 'static', 'glass'].includes(value))
  for (const name of names) {
    await search.fill(name)
    await card.waitFor()
    assert.equal(await cards.count(), 1)
  }
  await search.fill('')
  if (matchTag) {
    await tag.selectOption(matchTag)
    await card.waitFor()
    assert.equal(await cards.count(), 1)
    await tag.selectOption('')
  }
  await source.selectOption('built-in')
  await card.waitFor({ state: 'detached' })
  assert(await cards.count() >= 3)
  await source.selectOption('local')
  await card.waitFor()
  assert.equal(await cards.count(), 1)
  await source.selectOption('')
  return { names, tag: matchTag, source: 'built-in and local' }
}

async function checkCssVisibility({ ui, browser, hide, foreground }) {
  const { page, cdp } = ui
  const read = () => page.evaluate(() => {
    const motion = document.querySelector('[data-dsh-skin-effect-layer="edge"] > span')?.getAnimations()[0]
    return { visibility: document.visibilityState, state: motion?.playState, time: motion?.currentTime }
  })
  let cover
  try {
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false })
    if (hide) await hide()
    else {
      cover = await page.context().newPage()
      const control = await page.context().newCDPSession(cover)
      await control.send('Emulation.setFocusEmulationEnabled', { enabled: false })
      const browserCdp = await browser.newBrowserCDPSession()
      const [original, sibling] = await Promise.all([cdp.send('Target.getTargetInfo'), control.send('Target.getTargetInfo')])
      const windows = await Promise.all([original, sibling].map(({ targetInfo }) =>
        browserCdp.send('Browser.getWindowForTarget', { targetId: targetInfo.targetId })))
      assert.equal(windows[0].windowId, windows[1].windowId)
      await cover.bringToFront()
    }
    await page.waitForFunction(() => document.visibilityState === 'hidden'
      && document.querySelector('[data-dsh-skin-effect-layer="edge"] > span')?.getAnimations()[0]?.playState === 'paused',
    undefined, { polling: 100 })
    const before = await read()
    const started = performance.now()
    await delay(1000)
    assert.deepEqual(await read(), before)
    const hiddenMs = Math.round(performance.now() - started)
    if (foreground) await foreground()
    else await page.bringToFront()
    await page.waitForFunction(time => {
      const animation = document.querySelector('[data-dsh-skin-effect-layer="edge"] > span')?.getAnimations()[0]
      return document.visibilityState === 'visible' && animation?.playState === 'running' && animation.currentTime > time
    }, before.time, { polling: 100 })
    return { hiddenMs, paused: before, resumed: await read() }
  } finally {
    await cover?.close()
    await foreground?.().catch(() => {})
  }
}

async function checkCssSample(window, screenshot) {
  const { ui, resize, foreground } = window
  const { page, cdp, open, close, mode, activate } = ui
  const glass = page.locator('[data-dsh-skin-effect-layer="glass"]')
  const edge = page.locator('[data-dsh-skin-effect-layer="edge"]')
  const animation = () => edge.locator('span').evaluate(node => getComputedStyle(node).animationName)
  const collapse = page.getByRole('button', { name: /^(收起(?:左)?侧边栏|Collapse sidebar)$/ }).first()
  const expand = page.getByRole('button', { name: /^(展开(?:左)?侧边栏|打开(?:左)?侧边栏|Expand sidebar)$/ }).first()
  const media = (...features) => cdp.send('Emulation.setEmulatedMedia', { features })
  await foreground?.()
  await glass.waitFor()
  await edge.waitFor()
  assert.equal(await page.locator('canvas[data-dsh-skin-effect-layer], [data-dsh-skin-effect-layer="refraction-webgl"]').count(), 0)
  assert.equal(await animation(), 'dsh-skin-edge-drift')
  await activate(collapse)
  await edge.waitFor({ state: 'hidden' })
  await activate(expand)
  await edge.waitFor()
  try {
    await media({ name: 'prefers-reduced-motion', value: 'reduce' })
    assert.equal(await animation(), 'none')
    await media({ name: 'prefers-reduced-transparency', value: 'reduce' })
    await glass.waitFor({ state: 'hidden' })
  } finally { await media() }
  await glass.waitFor()
  await open()
  await mode('static')
  await close()
  assert.equal(await animation(), 'none')
  await open()
  await mode('dynamic')
  await close()
  assert.equal(await animation(), 'dsh-skin-edge-drift')
  await resize(760, 820)
  await page.waitForFunction(() => innerWidth < 800, undefined, { polling: 100 })
  const viewport = await page.evaluate(() => ({ width: innerWidth, layout: document.documentElement.scrollWidth }))
  assert.equal(viewport.width, viewport.layout)
  await page.locator('[data-composer-input]:visible').waitFor()
  await screenshot('sample-narrow')
  await resize(1280, 860)
  await edge.waitFor()
  const visibility = await checkCssVisibility(window)
  return { sidebarFold: true, reducedMotion: true, reducedTransparency: true, staticMode: true, viewport, visibility }
}

export async function checkSample(sampleZip, directory, evidence, openWindow, css = false) {
  const bytes = await readFile(sampleZip)
  const manifest = await zipJson(bytes)
  const { id, name, colorScheme, version, preview, entry } = manifest
  const { colors } = await zipJson(bytes, entry.tokens)
  const expected = { canvas: colors.canvas, sidebar: colors.surface }
  assert(expected.canvas && expected.sidebar, 'Expected a sample with canvas and sidebar colors')
  assert(['light', 'dark'].includes(colorScheme) && preview?.[colorScheme], 'Expected a single-mode sample with a preview')
  const skin = { id, name }
  const opposite = colorScheme === 'light' ? 'dark' : 'light'
  evidence.zip = { id, version, bytes: bytes.length, sha256: hash(bytes) }
  const first = await openWindow(colorScheme)
  const { ui, foreground } = first
  const { page, cdp, panel, button, detail, activate, open, close, appearance, choose, apply, waitForSkin, selection } = ui
  const packages = packagePanel(ui, foreground)
  await open()
  const before = await selection()
  const native = await palette(page)
  assert.equal(before.skinId, null)
  if (id.endsWith('.sample')) {
    const builtIn = (await packages.getCatalogue()).skins.find(item => item.source === 'built-in'
      && item.manifest.id === id.slice(0, -'.sample'.length))
    assert(builtIn, 'Expected the corresponding built-in skin')
    const choice = { id: builtIn.manifest.id, name: builtIn.manifest.name }
    await apply(choice)
    assert.deepEqual(await palette(page), expected)
    evidence.builtInPreviewImage = await packages.loadPreview(choice)
    assert(evidence.builtInPreviewImage.width > 320, 'Expected the built-in image, not the 320px placeholder')
    await apply(null)
    assert.deepEqual(await palette(page), native)
  }
  const beforePreview = await selection()
  await packages.install(basename(sampleZip), bytes)
  await choose(skin)
  const installed = (await packages.getCatalogue()).skins.find(item => item.manifest.id === id)
  assert(installed?.managed)
  evidence.previewImage = await packages.loadPreview(skin)
  assert(evidence.previewImage.width > 320, 'Expected the sample image, not the 320px placeholder')
  if (!id.endsWith('.sample')) evidence.filters = await checkFilters(ui, manifest)
  const previewButton = button(detail(skin), 'Preview')
  await page.keyboard.press('Tab')
  await previewButton.focus()
  assert(await previewButton.evaluate(node => node.matches(':focus-visible')
    && document.activeElement === node && getComputedStyle(node).outlineStyle !== 'none'))
  evidence.focus = await contrast(previewButton, true)
  assert(evidence.focus.ratio >= 3, 'Expected a visible focus outline against the panel')
  await activate(previewButton)
  await waitForSkin(id)
  assert.deepEqual(await selection(), beforePreview)
  await activate(button(panel, 'Cancel preview'))
  await waitForSkin(null)
  assert.deepEqual(await selection(), beforePreview)
  evidence.previewWasTransient = true
  await apply(skin)
  const saved = await selection()
  assert.equal(saved.skinId, id)
  evidence.appliedPalette = await palette(page)
  assert.deepEqual(evidence.appliedPalette, expected)
  await appearance(opposite)
  await waitForSkin(null)
  assert.deepEqual(await selection(), saved)
  evidence.fallbackPalette = await palette(page)
  assert.notDeepEqual(evidence.fallbackPalette, expected)
  await appearance(colorScheme)
  await waitForSkin(id)
  assert.deepEqual(await selection(), saved)
  evidence.restoredPalette = await palette(page)
  assert.deepEqual(evidence.restoredPalette, expected, 'Returning to the supported mode must restore the rendered palette')
  evidence.appearance = [colorScheme, opposite, colorScheme]
  await close()

  const screenshot = name => page.screenshot({ path: join(directory, `${name}.png`), scale: 'css', timeout: 10_000 })
  await foreground?.()
  await screenshot('sample-hero')
  await activate(page.getByRole('treeitem', { name: /Skin Engine acceptance history|未命名|Untitled/ }))
  const active = page.locator('[data-slot="main.conversation"] > [data-phase="active"]')
  const body = active.getByText('Fixture response.', { exact: true })
  await body.waitFor()
  const code = active.locator('pre code').filter({ hasText: 'const fixture = true' })
  const editor = active.locator('[data-composer-input]:visible')
  await editor.press('x')
  const keyboardFocus = await editor.evaluate(node => node === document.activeElement && node.matches(':focus-visible') && node.textContent === 'x')
  assert(keyboardFocus, 'Expected the sample composer to retain keyboard focus and input')
  evidence.contrast = { body: await contrast(body), code: await contrast(code), input: await contrast(editor) }
  assert(evidence.contrast.body.ratio >= 4.5, 'Expected at least 4.5:1 for the body text')
  await editor.press('Backspace')
  assert.equal((await editor.innerText()).trim(), '')
  await screenshot('sample-conversation')
  const scene = '[data-dsh-skin-effect-scene],[data-dsh-skin-effect-layer],style[data-dsh-skin-effects-style]'
  if (css) evidence.css = await checkCssSample(first, screenshot)
  else {
    assert.equal(await page.locator(scene).count(), 0, 'A static sample must not mount effects')
    try {
      await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] })
      assert(await page.evaluate(() => matchMedia('(forced-colors: active)').matches))
      await editor.press('y')
      assert(await editor.evaluate(node => node === document.activeElement && node.textContent === 'y'))
      await editor.press('Backspace')
    } finally { await cdp.send('Emulation.setEmulatedMedia', { features: [] }) }
    evidence.forcedColorsInput = true
    evidence.keyboardAndStatic = true
  }

  const restarted = await openWindow(null)
  await restarted.ui.waitForSkin(id)
  assert.deepEqual(await restarted.ui.selection(), saved)
  assert.deepEqual(await palette(restarted.ui.page), expected)
  evidence.restarted = true
  await restarted.ui.open()
  await restarted.ui.apply(null)
  assert.equal(await restarted.ui.page.locator(scene).count(), 0)
  assert.deepEqual(await palette(restarted.ui.page), native)
  await restarted.ui.apply(skin)
  await packagePanel(restarted.ui, restarted.foreground).remove(skin)
  await restarted.ui.waitForSkin(null)
  assert.equal((await restarted.ui.selection()).skinId, null)
  assert.equal(await restarted.ui.page.locator(scene).count(), 0)
  assert.deepEqual(await palette(restarted.ui.page), native)
  await restarted.ui.close()
  evidence.defaultAndUninstall = true
}
