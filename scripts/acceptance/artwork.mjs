import assert from 'node:assert/strict'
import { appendFile, readFile, readdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buffer } from 'node:stream/consumers'
import { ZipFile } from 'yazl'
import { resources } from './browser.mjs'
import { packagePanel } from './packages.mjs'

const source = new URL('../../DSH_Skin_Engine_Development_Pack_v1.0/examples/skins/blue-arc/', import.meta.url)
const skin = { id: 'example.scene-artwork-acceptance', name: 'Scene Artwork Acceptance' }
const asset = 'assets/portrait.webp'
const artSelector = '[data-dsh-skin-scene-artwork]'
const sidebar = /^(收起(?:左)?侧边栏|展开(?:左)?侧边栏|打开(?:左)?侧边栏|Collapse sidebar|Expand sidebar)$/

async function sample() {
  const manifest = JSON.parse(await readFile(new URL('skin.json', source), 'utf8'))
  const scene = {
    schema: 'dsh.scene/v1',
    layout: {
      artwork: { asset, fit: 'contain', anchor: 'right center', focalPoint: [0.86, 0.32], scale: 1, opacity: 0.35 },
      safeArea: { contentLeftFraction: 0.65 },
      breakpoints: [
        { maxWidth: 520, artworkScale: 0.74, opacity: 0.22 }, { maxWidth: 760, artworkScale: 0.88, opacity: 0.26 },
        { maxWidth: 1280, artworkScale: 0.93, opacity: 0.3 }, { maxWidth: 1440, artworkScale: 0.97, opacity: 0.33 },
      ],
    },
    presets: { static: [], light: [], dynamic: [] },
  }
  const zip = new ZipFile()
  const add = (name, bytes) => zip.addBuffer(Buffer.from(bytes), name, { compress: false })
  add('skin.json', JSON.stringify({ ...manifest, ...skin, preview: undefined, engineApi: '^1.1.0',
    entry: { ...manifest.entry, scene: 'scene.json' }, capabilities: [...manifest.capabilities, 'scene'] }))
  add('scene.json', JSON.stringify(scene))
  add('theme.css', `:root[data-dsh-skin-id="${skin.id}"] { color-scheme: dark; }`)
  for (const name of ['tokens.json', 'effects.json', asset]) add(name, await readFile(new URL(name, source)))
  zip.end()
  return { archive: await buffer(zip.outputStream), legacy: { id: manifest.id, name: manifest.name }, scene }
}

export async function checkArtwork(session, ui, directory, profileDir, evidence, desktop) {
  const { page, cdp, open, close, activate, choose, detail, button, panel, apply, waitForSkin } = ui
  const { archive, legacy, scene } = await sample()
  const art = page.locator(artSelector)
  const message = page.getByText('Fixture response.', { exact: true })
  const card = page.locator('[data-composer-card]:visible')
  const editor = card.locator('[data-composer-input]')
  const screenshot = label => page.screenshot({ path: join(directory, `${label}.png`), scale: 'css' })
  const media = (...features) => cdp.send('Emulation.setEmulatedMedia', { features })

  await activate(page.getByRole('treeitem', { name: /Skin Engine acceptance history|未命名|Untitled/ }))
  await message.waitFor()
  await open()
  await packagePanel(ui).install(`${skin.id}.dshskin.zip`, archive)
  await choose(skin)
  await activate(button(detail(skin), 'Preview'))
  await waitForSkin(skin.id)
  await art.waitFor({ state: 'visible' })
  await activate(button(panel, 'Cancel preview'))
  await waitForSkin(null)
  assert.equal(await page.locator(resources).count(), 0)
  await apply(skin)
  await close()
  evidence.previewCleanup = true

  evidence.viewports = []
  for (const width of [1920, 1440, 1280, 760, 520]) {
    await session.resize(width, 820)
    let native = true
    try {
      await page.waitForFunction(width => Math.abs(innerWidth - width) <= 1, width, { timeout: 3500 })
    } catch (error) {
      if (!desktop) throw error
      native = false
      await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 820, deviceScaleFactor: 1, mobile: false })
      await page.waitForFunction(width => innerWidth === width, width)
    }
    const baseOpacity = scene.layout.artwork.opacity
    await page.waitForFunction(({ artSelector, breakpoints, baseOpacity }) => {
      const layer = document.querySelector(artSelector)
      const content = document.querySelector('[data-phase="active"] > [data-conversation-content][data-conversation-region="chat"]')
      const area = content?.getBoundingClientRect()
      const expectedOpacity = breakpoints.find(rule => innerWidth <= rule.maxWidth)?.opacity ?? baseOpacity
      return layer && !layer.hidden && area && Number(layer.style.opacity) === expectedOpacity
        && Math.abs(layer.getBoundingClientRect().right - Math.min(area.right, innerWidth)) < 1
    }, { artSelector, breakpoints: scene.layout.breakpoints, baseOpacity })
    const rendered = await art.evaluate((layer, point) => {
      const box = layer.getBoundingClientRect()
      const image = layer.firstElementChild
      const imageBox = image.getBoundingClientRect()
      const content = document.querySelector('[data-phase="active"] > [data-conversation-content][data-conversation-region="chat"]')
      const area = content.getBoundingClientRect()
      const style = getComputedStyle(layer)
      return {
        width: innerWidth, height: innerHeight, dpr: devicePixelRatio, sceneLeft: box.left, sceneRight: box.right,
        safeBoundary: area.left + (Math.min(area.right, innerWidth) - area.left) * 0.65,
        artworkWidth: box.width, focalX: imageBox.left + imageBox.width * point[0], focalY: imageBox.top + imageBox.height * point[1],
        artworkTop: box.top, artworkBottom: box.bottom, decodedWidth: image.naturalWidth, opacity: Number(style.opacity),
        contentOpacity: Number(style.getPropertyValue('--dsh-art-content-alpha')) * Number(style.opacity),
        passThrough: style.pointerEvents === 'none' && getComputedStyle(layer.parentElement).zIndex === '-2',
        masked: style.maskImage !== 'none', canvasLayers: document.querySelectorAll('canvas[data-dsh-skin-effect-layer="canvas"]').length,
      }
    }, scene.layout.artwork.focalPoint)
    assert(rendered.decodedWidth > 0 && rendered.passThrough && rendered.masked && !rendered.canvasLayers)
    assert(Math.abs(rendered.sceneLeft - rendered.safeBoundary) < 1)
    assert(rendered.sceneLeft < rendered.focalX && rendered.focalX < rendered.sceneRight)
    assert(rendered.artworkTop < rendered.focalY && rendered.focalY < rendered.artworkBottom)
    assert(rendered.contentOpacity <= 0.16001)
    const hit = node => {
      const box = node.getBoundingClientRect()
      return node.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2))
    }
    assert(await message.evaluate(hit), 'Conversation text must stay above the decoration')
    assert(await editor.evaluate(hit), 'Composer must stay above the decoration')
    evidence.viewports.push({ requestedWidth: width, native, ...rendered })
    if (width >= 1280 || width === 520) await screenshot(`artwork-${width}`)
  }
  if (evidence.viewports.some(item => !item.native)) await cdp.send('Emulation.clearDeviceMetricsOverride')
  await session.resize(1280, 820)
  await editor.press('x')
  assert(await editor.evaluate(node => node === document.activeElement && node.textContent === 'x'))
  await editor.press('Backspace')
  const commands = card.getByRole('button', { name: /添加文件或调用指令|Add files|Invoke commands/i })
  await commands.press('Enter')
  await page.getByRole('listbox').waitFor()
  await page.keyboard.press('Escape')
  await page.getByRole('listbox').waitFor({ state: 'hidden' })
  evidence.keyboard = true

  const left = await art.evaluate(node => node.getBoundingClientRect().left)
  const toggle = page.getByRole('button', { name: sidebar }).first()
  await activate(toggle)
  await page.waitForFunction(({ artSelector, left }) => {
    const layer = document.querySelector(artSelector)
    return layer && !layer.hidden && Math.abs(layer.getBoundingClientRect().left - left) > 20
  }, { artSelector, left })
  await activate(toggle)
  await page.waitForFunction(({ artSelector, left }) => {
    const layer = document.querySelector(artSelector)
    return layer && !layer.hidden && Math.abs(layer.getBoundingClientRect().left - left) < 2
  }, { artSelector, left })
  evidence.sidebarReflow = true
  try {
    await media({ name: 'prefers-reduced-transparency', value: 'reduce' })
    await art.waitFor({ state: 'hidden' })
    await waitForSkin(skin.id)
  } finally { await media() }
  await art.waitFor({ state: 'visible' })
  evidence.reducedTransparency = true

  await open()
  await apply(null)
  assert.equal(await page.locator(resources).count(), 0)
  evidence.defaultCleanup = true
  await apply(legacy)
  await close()
  const legacyImage = page.locator('[data-dsh-skin-effect-layer="artwork"] > img')
  await legacyImage.waitFor()
  assert.deepEqual(await legacyImage.evaluate(img => [img.naturalWidth > 0, getComputedStyle(img).objectFit]), [true, 'contain'])
  assert.equal(await art.count(), 0)
  evidence.legacyArtwork = true

  const installed = join(profileDir, 'skin-engine', 'installed')
  const [entry, ...unexpected] = await readdir(installed, { withFileTypes: true })
  assert(entry?.isDirectory() && /^skin-[0-9a-f-]{36}$/.test(entry.name) && !unexpected.length)
  const pkg = join(installed, entry.name)
  assert.equal(JSON.parse(await readFile(join(pkg, 'skin.json'), 'utf8')).id, skin.id)
  const imagePath = join(pkg, asset)
  const bytes = await readFile(imagePath)
  await unlink(imagePath)
  await open()
  await apply(skin)
  await close()
  assert.equal(await art.count(), 0)
  assert.equal((await ui.selection()).skinId, skin.id)
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--dsw-alias-bg-base').trim()), '#1b2439')
  evidence.missingArtworkUsesCanvas = true
  await screenshot('missing-artwork')

  await writeFile(imagePath, bytes)
  await open()
  await apply(legacy)
  await apply(skin)
  await close()
  await art.waitFor({ state: 'visible' })
  await appendFile(join(profileDir, 'cordis.patch.yml'), '\n- id: dsh-skin-engine\n  disabled: true\n')
  await waitForSkin(null)
  await page.locator(resources).first().waitFor({ state: 'detached' })
  evidence.disableCleanup = true
}
