import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { releaseSampleDirectories } from '../release-assets.mjs'
import { resources } from './browser.mjs'
import { contrast, packagePanel, palette, zipJson } from './packages.mjs'

const artwork = '[data-dsh-skin-scene-artwork]'
const chat = '[data-phase="active"] > [data-conversation-content][data-conversation-region="chat"]'

export async function checkCharacterSamples(session, ui, sampleDir, directory, evidence) {
  const { page, cdp, panel, detail, open, close, apply, choose, activate, button, waitForSkin, selection } = ui
  const packages = packagePanel(ui)
  const body = page.getByText('中文场景验收。', { exact: true })
  const code = page.locator('pre code:visible').first()
  const editor = page.locator('[data-composer-input]:visible')
  const layer = page.locator(artwork)
  const parallax = page.locator(`${artwork}[data-dsh-skin-artwork-parallax]`)
  const glow = page.locator(`${artwork}[data-dsh-skin-artwork-light]`)
  const resize = async width => {
    await session.resize(width, 820)
    await page.waitForFunction(width => Math.abs(innerWidth - width) <= 1, width, { timeout: 5000 })
  }
  const clean = async () => assert.equal(await page.locator(resources).count(), 0)

  async function measure(slug, scheme, width, scene, tokens) {
    const { asset, variants, opacity, focalPoint } = scene.layout.artwork
    const expected = variants?.[scheme] ?? asset
    const expectedOpacity = scene.layout.breakpoints.find(rule => width <= rule.maxWidth)?.opacity ?? opacity
    await page.waitForFunction(({ artwork, expected, expectedOpacity, scheme }) => {
      const node = document.querySelector(artwork)
      const img = node?.querySelector('img')
      return img?.complete && img.naturalWidth > 0 && new URL(img.src).searchParams.get('path') === expected
        && Number(node.style.opacity) === expectedOpacity && document.documentElement.style.colorScheme === scheme
    }, { artwork, expected, expectedOpacity, scheme })
    const expectedColors = { ...tokens.colors, ...tokens.variants?.[scheme] }
    assert.deepEqual(await palette(page), { canvas: expectedColors.canvas, sidebar: expectedColors.surface })
    const layout = await layer.evaluate((node, { chat, focalPoint, safeFraction }) => {
      const region = document.querySelector(chat).getBoundingClientRect()
      const box = node.getBoundingClientRect()
      const img = node.querySelector('img').getBoundingClientRect()
      return {
        viewport: [innerWidth, innerHeight],
        left: box.left, right: box.right, focusX: img.left + img.width * focalPoint[0],
        safeBoundary: region.left + (Math.min(region.right, innerWidth) - region.left) * safeFraction,
        passesPointer: getComputedStyle(node).pointerEvents === 'none',
      }
    }, { chat, focalPoint, safeFraction: scene.layout.safeArea.contentLeftFraction })
    assert(Math.abs(layout.left - layout.safeBoundary) < 1, JSON.stringify(layout))
    assert(layout.passesPointer && layout.left < layout.focusX && layout.focusX < layout.right, JSON.stringify(layout))
    for (const locator of [body, code, editor]) await locator.waitFor({ state: 'visible' })
    const screenshot = `${slug}-${scheme}-${width}.png`
    const png = await page.screenshot({ path: join(directory, screenshot), scale: 'css' })
    const url = `data:image/png;base64,${png.toString('base64')}`
    const ratios = await Promise.all([body, code, editor].map(node => contrast(node, false, url).then(value => value.ratio)))
    assert(ratios.every(ratio => ratio >= 4.5), `${screenshot}: contrast ${ratios.join(', ')}`)
    return { scheme, image: expected, opacity: expectedOpacity, ...layout, ratios, screenshot }
  }

  await resize(1280)
  await activate(page.getByRole('treeitem', { name: /Skin Engine acceptance history|未命名|Untitled/ }))
  await body.waitFor()
  const names = releaseSampleDirectories.filter(path => path.startsWith('characters/')).map(path => path.split('/')[1])
  evidence.samples = []
  await open()
  const native = {}
  for (const scheme of ['light', 'dark']) {
    await ui.appearance(scheme)
    native[scheme] = await palette(page)
  }
  for (const slug of names) {
    const filename = `example.${slug}.dshskin.zip`
    const bytes = await readFile(join(sampleDir, filename))
    const manifest = await zipJson(bytes)
    const scene = await zipJson(bytes, 'scene.json')
    const tokens = await zipJson(bytes, 'tokens.json')
    const schemes = manifest.colorScheme === 'both' ? ['light', 'dark'] : [manifest.colorScheme]
    const skin = { id: manifest.id, name: manifest.name }
    const sample = { id: skin.id, sha256: createHash('sha256').update(bytes).digest('hex'), views: [] }
    evidence.samples.push(sample)
    await ui.appearance(schemes[0])
    await packages.install(filename, bytes)
    await choose(skin)
    const savedBefore = await selection()
    await activate(button(detail(skin), 'Preview'))
    await waitForSkin(skin.id)
    await layer.waitFor()
    await activate(button(panel, 'Cancel preview'))
    await waitForSkin(null)
    assert.deepEqual(await selection(), savedBefore)
    await clean()
    sample.previewCancelled = true
    if (manifest.colorScheme === 'both') await (await ui.editSkinEffects(skin)).getByLabel('Skin effect quality').selectOption('low')
    await apply(skin)
    const applied = await selection()
    if (manifest.colorScheme === 'both') assert.equal(applied.preferences[skin.id].quality, 'low')
    for (const scheme of schemes) {
      await ui.appearance(scheme)
      if (manifest.preview?.[scheme]) {
        const preview = await packages.loadPreview(skin)
        assert(preview.width >= 1000, 'Gallery should decode the packaged preview')
      }
      await close()
      sample.views.push(await measure(slug, scheme, 1280, scene, tokens))
      if (scene.layout.artwork.motion) {
        await parallax.waitFor()
        await glow.waitFor()
        try {
          await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
          await parallax.waitFor({ state: 'detached' })
          await glow.waitFor({ state: 'detached' })
          await layer.waitFor()
          sample.reducedMotion = true
        } finally { await cdp.send('Emulation.setEmulatedMedia', { features: [] }) }
      }
      await resize(760)
      await parallax.waitFor({ state: 'detached' })
      sample.views.push(await measure(slug, scheme, 760, scene, tokens))
      if (slug === 'last-train-study') {
        await editor.press('x')
        assert(await editor.evaluate(node => node === document.activeElement && node.textContent === 'x'))
        await editor.press('Backspace')
        sample.narrowInput = true
      }
      assert.deepEqual(await selection(), applied)
      await resize(1280)
      await open()
    }
    if (manifest.colorScheme !== 'both') {
      await apply(null)
      await clean()
      assert.deepEqual(await palette(page), native[schemes[0]])
      sample.defaultCleanup = true
    }
    await choose(skin)
    await packages.remove(skin)
    await waitForSkin(null)
    assert.equal((await selection()).skinId, null)
    await clean()
    assert.deepEqual(await palette(page), native[schemes.at(-1)])
    assert(!(await packages.getCatalogue()).skins.some(item => item.manifest.id === skin.id))
    sample.uninstalled = true
  }
  await close()
}
