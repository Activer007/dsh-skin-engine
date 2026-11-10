import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buffer } from 'node:stream/consumers'
import { fromBufferPromise } from 'yauzl'
import { ZipFile } from 'yazl'
import { resources } from './browser.mjs'
import { contrast, packagePanel, palette } from './packages.mjs'

const samples = ['night-navigator', 'morning-observatory', 'crimson-rain']
const effects = { 'ambient.aurora': 'aurora', 'light.flow': 'flow', 'particles.dust': 'canvas' }
const json = bytes => JSON.parse(bytes.toString('utf8'))
const artwork = '[data-dsh-skin-scene-artwork]'

async function readZip(bytes) {
  const archive = await fromBufferPromise(bytes)
  const files = new Map()
  try {
    for await (const entry of archive.eachEntry()) {
      files.set(entry.fileName, await buffer(await archive.openReadStreamPromise(entry)))
    }
  } finally { archive.close() }
  return files
}

async function previousZip(files, manifest) {
  const archive = new ZipFile()
  for (const [name, bytes] of files) archive.addBuffer(
    name === 'skin.json' ? Buffer.from(JSON.stringify({ ...manifest, version: '0.9.0' })) : bytes,
    name, { compress: false },
  )
  archive.end()
  return buffer(archive.outputStream)
}

function checkLayers(page, preset, wanted) {
  return page.waitForFunction(({ preset, wanted }) => {
    const scene = document.querySelector('[data-dsh-skin-scene-preset]')
    const names = [...document.querySelectorAll('[data-dsh-skin-effect-layer]:not([hidden])')]
      .map(node => node.getAttribute('data-dsh-skin-effect-layer'))
      .filter(name => name !== 'artwork')
      .map(name => name === 'edge' ? 'flow' : name)
    return scene?.getAttribute('data-dsh-skin-scene-preset') === preset &&
      [...new Set(names)].sort().join(',') === wanted.join(',')
  }, { preset, wanted })
}

function shortFrameSample(page) {
  return page.evaluate(async () => {
    const clear = CanvasRenderingContext2D.prototype.clearRect
    let draws = 0
    const samples = []
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas.matches('[data-dsh-skin-effect-layer="canvas"]')) draws++
      return clear.apply(this, args)
    }
    try {
      await new Promise(resolve => {
        let previous
        function frame(time) {
          if (previous !== undefined) samples.push(time - previous)
          previous = time
          if (samples.length < 30) requestAnimationFrame(frame)
          else resolve()
        }
        requestAnimationFrame(frame)
      })
      const p95 = samples.toSorted((a, b) => a - b)[Math.ceil(samples.length * 0.95) - 1]
      return { intervals: samples.length, p95, draws, visible: document.visibilityState === 'visible' }
    } finally { CanvasRenderingContext2D.prototype.clearRect = clear }
  })
}

export async function checkSceneSamples(session, ui, sampleDir, directory, evidence, previewsOnly) {
  const { page, cdp, panel, detail, open, close, apply, choose, activate, button, waitForSkin, selection } = ui
  const packages = packagePanel(ui)
  const presetControl = panel.getByRole('combobox', { name: 'Scene motion preset' })
  const quality = panel.getByRole('combobox', { name: 'Effect quality in this window' })
  const message = page.getByText('中文场景验收。', { exact: true })
  const code = page.locator('pre code:visible').first()
  const editor = page.locator('[data-composer-input]:visible')
  const screenshot = name => page.screenshot({ path: join(directory, name + '.png'), scale: 'css' })
  const media = (...features) => cdp.send('Emulation.setEmulatedMedia', { features })
  const resize = async width => {
    await session.resize(width, 820)
    await page.waitForFunction(width => Math.abs(innerWidth - width) <= 1, width)
  }

  await resize(1280)
  await activate(page.getByRole('treeitem', { name: /Skin Engine acceptance history|未命名|Untitled/ }))
  await message.waitFor()
  evidence.samples = []
  await open()
  for (const slug of samples) {
    const filename = 'com.dsh.skin.' + slug + '.scene.dshskin.zip'
    const bytes = await readFile(join(sampleDir, filename))
    const files = await readZip(bytes)
    const manifest = json(files.get('skin.json'))
    const scene = json(files.get('scene.json'))
    const skin = { id: manifest.id, name: manifest.name }
    const first = !previewsOnly && slug === samples[0]
    const result = { id: skin.id, sha256: createHash('sha256').update(bytes).digest('hex'), presets: [] }
    evidence.samples.push(result)
    await packages.install(filename, first ? await previousZip(files, manifest) : bytes)
    await choose(skin)
    if (first) {
      const saved = await selection()
      await activate(button(detail(skin), 'Preview'))
      await waitForSkin(skin.id)
      await page.locator(artwork).waitFor()
      await activate(button(panel, 'Cancel preview'))
      await waitForSkin(null)
      assert.deepEqual(await selection(), saved)
      assert.equal(await page.locator(resources).count(), 0)
      await choose(skin)
      await ui.expand(detail(skin).locator('summary').filter({ hasText: /^Package actions$/ }))
      await detail(skin).getByLabel('Update from .dshskin.zip').setInputFiles({
        name: filename, mimeType: 'application/zip', buffer: bytes,
      })
      await panel.getByRole('status').filter({ hasText: 'Skin updated to v' + manifest.version + '.' }).waitFor()
      result.previewCancelAndUpdate = true
    }
    if (!previewsOnly) {
      result.thumbnail = await packages.loadPreview(skin)
      assert.equal(result.thumbnail.width, 640)
    }
    await apply(skin)
    for (const preset of previewsOnly ? ['dynamic'] : ['static', 'light', 'dynamic']) {
      await presetControl.selectOption(preset)
      await close()
      const layers = scene.presets[preset].map(id => effects[id]).sort()
      await checkLayers(page, preset, layers)
      const image = page.locator(artwork + ' > img')
      await image.waitFor()
      assert(await image.evaluate(img => img.complete && img.naturalWidth > 0))
      assert.equal((await palette(page)).canvas, json(files.get('tokens.json')).colors.canvas)
      const running = () => page.evaluate(() => document.getAnimations().filter(animation =>
        animation.animationName?.startsWith('dsh-skin-') && animation.playState === 'running').length)
      if (preset === 'static') assert.equal(await running(), 0)
      else await page.waitForFunction(() => document.getAnimations().some(animation =>
        animation.animationName?.startsWith('dsh-skin-') && animation.playState === 'running'))
      const shot = slug + '-' + preset
      const png = await screenshot(shot)
      const data = { preset, layers, screenshot: shot + '.png' }
      if (!previewsOnly) {
        const bodyBackdrop = 'data:image/png;base64,' + png.toString('base64')
        const ratios = await Promise.all([contrast(message, false, bodyBackdrop), contrast(code), contrast(editor)])
        data.contrast = Object.fromEntries(['body', 'code', 'input'].map((key, index) => [key, ratios[index].ratio]))
        assert(Object.values(data.contrast).every(ratio => ratio >= 4.5), JSON.stringify(data.contrast))
        if (first && preset !== 'light') {
          data.frames = await shortFrameSample(page)
          assert(data.frames.visible && (preset === 'static' ? data.frames.draws === 0 : data.frames.draws > 0))
        }
      }
      result.presets.push(data)
      await open()
    }
    if (!previewsOnly && slug === 'morning-observatory') {
      await quality.selectOption('low')
      await panel.locator('[data-dsh-skin-effective-quality]').filter({ hasText: /^low$/ }).waitFor()
      await close()
      await resize(760)
      await checkLayers(page, 'dynamic', ['canvas', 'flow'])
      await page.locator(artwork).waitFor()
      await editor.press('x')
      assert(await editor.evaluate(node => node === document.activeElement && node.matches(':focus-visible')))
      await editor.press('Backspace')
      await page.keyboard.insertText('中文场景输入')
      assert(await editor.evaluate(node => node === document.activeElement && node.textContent === '中文场景输入'))
      await editor.press('ControlOrMeta+a')
      await editor.press('Backspace')
      assert((await contrast(editor)).ratio >= 4.5)
      try {
        await media({ name: 'prefers-reduced-motion', value: 'reduce' })
        await checkLayers(page, 'static', [])
        await page.locator(artwork).waitFor()
        await media({ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-reduced-transparency', value: 'reduce' })
        await page.locator(artwork).waitFor({ state: 'hidden' })
        assert((await contrast(message)).ratio >= 4.5)
        await waitForSkin(skin.id)
      } finally { await media() }
      await resize(1280)
      await page.locator(artwork).waitFor()
      await open()
      await quality.selectOption('')
      result.lowQualityReducedMotionAndFallback = true
    }
  }
  await apply(null)
  assert.equal(await page.locator(resources).count(), 0)
  await close()
  evidence.defaultCleanup = true
}
