import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buffer } from 'node:stream/consumers'
import { ZipFile } from 'yazl'
import { resources } from './browser.mjs'
import { contrast, packagePanel, palette } from './packages.mjs'

const skin = { id: 'example.dual-appearance', name: 'Dual Appearance Acceptance' }
const legacy = { id: 'com.dsh.skin.night-navigator', name: '夜航员' }
const images = { light: 'assets/day.webp', dark: 'assets/night.webp' }
const palettes = {
  light: { canvas: '#f4f3eb', sidebar: '#eae8de' },
  dark: { canvas: '#0b1220', sidebar: '#111d2d' },
}
const artwork = '[data-dsh-skin-scene-artwork] > img'
const samples = new URL('../../DSH_Skin_Engine_Development_Pack_v1.0/examples/scenes/', import.meta.url)

export async function packDualAppearanceFixture() {
  const zip = new ZipFile()
  const add = (path, bytes) => zip.addBuffer(Buffer.from(bytes), path, { mtime: new Date('2026-01-01T00:00:00Z') })
  const json = (path, value) => add(path, JSON.stringify(value))
  json('skin.json', { schema: 'dsh.skin/v1', ...skin, version: '1.0.0', engineApi: '^1.3.0', colorScheme: 'both',
    capabilities: ['tokens', 'css', 'assets', 'scene'], assets: Object.values(images),
    entry: { tokens: 'tokens.json', effects: 'effects.json', styles: 'theme.css', scene: 'scene.json' } })
  json('tokens.json', { schema: 'dsh.tokens/v1', colors: { canvas: palettes.light.canvas, surface: palettes.light.sidebar },
    variants: { dark: { canvas: palettes.dark.canvas, surface: palettes.dark.sidebar } } })
  json('effects.json', { schema: 'dsh.effects/v1', effects: [] })
  json('scene.json', { schema: 'dsh.scene/v1',
    layout: { artwork: { asset: images.light, variants: { dark: images.dark }, fit: 'contain',
      anchor: 'right center', focalPoint: [0.86, 0.36], scale: 1, opacity: 0.25 }, safeArea: { contentLeftFraction: 0.7 } },
    presets: { static: [], light: [], dynamic: [] } })
  add('theme.css', '')
  add(images.light, await readFile(new URL('morning-observatory/assets/portrait.webp', samples)))
  add(images.dark, await readFile(new URL('night-navigator/assets/navigator.webp', samples)))
  zip.end()
  return buffer(zip.outputStream)
}

async function appearance(page, scheme, { missing = false } = {}) {
  const image = page.locator(artwork)
  await page.waitForFunction(({ id, scheme, expected, imagePath, selector, missing }) => {
    const html = document.documentElement
    const styles = getComputedStyle(document.body)
    const img = document.querySelector(selector)
    return html.getAttribute('data-dsh-skin-id') === id && html.style.colorScheme === scheme
      && styles.getPropertyValue('--dsw-alias-bg-base').trim() === expected.canvas
      && styles.getPropertyValue('--dsw-specific-sidebar-fill').trim() === expected.sidebar
      && (missing ? !img : img?.complete && img.naturalWidth > 0 && new URL(img.src).searchParams.get('path') === imagePath)
  }, { id: skin.id, scheme, expected: palettes[scheme], imagePath: images[scheme], selector: artwork, missing })
  const size = missing ? null : await image.evaluate(node => [node.naturalWidth, node.naturalHeight])
  return { scheme, palette: await palette(page), image: missing ? null : images[scheme], size }
}

export async function checkDualAppearance(openInProfile, directory, evidence, desktop) {
  let { ui, foreground } = await openInProfile(null)
  async function history() {
    const { page, activate } = ui
    await activate(page.getByRole('treeitem', { name: /Skin Engine acceptance history|未命名|Untitled/ }))
    await page.getByText('Fixture response.', { exact: true }).waitFor()
  }
  async function measure(scheme) {
    const result = await appearance(ui.page, scheme)
    const { ratio: body } = await contrast(ui.page.getByText('Fixture response.', { exact: true }))
    const { ratio: input } = await contrast(ui.page.locator('[data-composer-input]:visible'))
    assert(body >= 4.5 && input >= 4.5)
    const path = `dual-${scheme}.png`
    await foreground?.()
    await ui.page.screenshot({ path: join(directory, path), scale: 'css' })
    return { ...result, body, input, screenshot: path }
  }

  await history()
  await ui.open()
  await ui.appearance('light')
  const native = await palette(ui.page)
  await ui.apply(legacy)
  const legacyImage = ui.page.locator('[data-dsh-skin-effect-layer="artwork"] > img')
  await legacyImage.waitFor({ state: 'attached' })
  assert(await legacyImage.evaluate(node => node.complete && node.naturalWidth > 0))
  await ui.appearance('light')
  await ui.apply(null)
  evidence.legacy = { decoded: true, restored: await palette(ui.page) }
  assert.deepEqual(evidence.legacy.restored, native)

  const zip = await packDualAppearanceFixture()
  evidence.sampleSha256 = createHash('sha256').update(zip).digest('hex')
  await packagePanel(ui).install(`${skin.id}.dshskin.zip`, zip)
  await ui.choose(skin)
  await ui.detail(skin).getByLabel('Skin effect quality').selectOption('low')
  await ui.apply(skin)
  const selection = await ui.selection()
  assert.equal(selection.preferences[skin.id].quality, 'low')
  await ui.close()
  evidence.manual = [await measure('light')]

  const other = desktop ? undefined : await ui.page.context().newPage()
  try {
    if (other) {
      await other.goto(new URL('/', ui.page.url()).href)
      evidence.secondWebView = [await appearance(other, 'light')]
    }
    await ui.open()
    await ui.appearance('dark')
    assert.equal(await ui.detail(skin).getByLabel('Background').inputValue(), palettes.dark.canvas)
    await ui.close()
    evidence.manual.push(await measure('dark'))
    if (other) evidence.secondWebView.push(await appearance(other, 'dark'))
    await ui.open()
    await ui.appearance('light')
    await ui.close()
    evidence.manual.push(await appearance(ui.page, 'light'))
    if (other) evidence.secondWebView.push(await appearance(other, 'light'))
  } finally { await other?.close() }
  assert.deepEqual(await ui.selection(), selection)

  await ui.page.emulateMedia({ colorScheme: 'dark' })
  await ui.open()
  await ui.appearance('system')
  await ui.close()
  evidence.system = []
  for (const scheme of ['dark', 'light', 'dark']) {
    await ui.page.emulateMedia({ colorScheme: scheme })
    evidence.system.push(await appearance(ui.page, scheme))
  }
  await ui.open()
  await ui.appearance('system', { select: false })
  assert.deepEqual(await ui.selection(), selection)
  await ui.appearance('light')
  await ui.close()

  ;({ ui } = await openInProfile(null))
  await history()
  evidence.restart = await appearance(ui.page, 'light')
  assert.deepEqual(await ui.selection(), selection)
  await ui.open()
  await ui.appearance('light', { select: false })
  await ui.apply(null)
  assert.deepEqual(await palette(ui.page), native)
  assert.equal(await ui.page.locator(resources).count(), 0)
  evidence.restoreDefault = true
  await ui.close()
}
