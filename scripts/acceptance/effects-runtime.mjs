import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, realpath, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { buffer } from 'node:stream/consumers'
import { ZipFile } from 'yazl'
import { deepOcean, resources } from './browser.mjs'
import { packagePanel } from './packages.mjs'
import { visibilityCycle } from './rendering.mjs'

const skin = { id: 'example.effects-runtime', name: 'Effects Runtime Acceptance' }
const demo = { id: 'example.ambient-provider', name: 'Ambient Light Provider' }
const attribute = 'data-dsh-skin-effect-layer'
const layers = value => `[${attribute}="${value}"]`
const canvas = layers('canvas')
const refraction = layers('refraction')
const fallback = layers('refraction-fallback')
const source = new URL('../../DSH_Skin_Engine_Development_Pack_v1.0/examples/skins/', import.meta.url)

async function oldFormatZip(withAmbient = false) {
  const [ocean, neon] = await Promise.all(['deep-ocean', 'obsidian-neon'].map(async name =>
    JSON.parse(await readFile(new URL(`${name}/effects.json`, source), 'utf8')).effects))
  const effects = [...ocean, ...neon.filter(effect => !ocean.some(entry => entry.id === effect.id))]
  assert.equal(effects.length, 8)
  if (withAmbient) effects.push({ id: 'ambient.light', renderer: 'css', enabled: true, params: {} })
  return effectsZip(skin, effects, ['tokens', 'css', 'effects:css', 'effects:canvas2d', 'effects:webgl'])
}

function effectsZip(skin, effects, capabilities) {
  const zip = new ZipFile()
  const add = (name, data) => zip.addBuffer(Buffer.from(data), name, { mtime: new Date('2026-01-01T00:00:00Z') })
  add('skin.json', JSON.stringify({ schema: 'dsh.skin/v1', ...skin, version: '1.0.0', engineApi: '^1.0.0', colorScheme: 'dark',
    capabilities,
    entry: { tokens: 'tokens.json', effects: 'effects.json', styles: 'theme.css' } }))
  add('tokens.json', JSON.stringify({ schema: 'dsh.tokens/v1', colors: { canvas: '#0b1220', surface: '#111d2d', accent: '#6dc7ff' } }))
  add('effects.json', JSON.stringify({ schema: 'dsh.effects/v1', effects }))
  add('theme.css', '')
  zip.end()
  return buffer(zip.outputStream)
}

async function probeRenderer(page, selector, attribute) {
  await page.evaluate(({ selector, attribute }) => {
    const prototype = HTMLCanvasElement.prototype
    const context = prototype.getContext
    const { clearRect, fill, stroke } = CanvasRenderingContext2D.prototype
    let blocked = true
    let attempts = 0
    let frames = 0
    let fills = 0
    let strokes = 0
    prototype.getContext = function (kind, ...args) {
      if (kind === 'webgl' && this.getAttribute(attribute) === 'refraction') {
        attempts++
        if (blocked) return null
      }
      return context.call(this, kind, ...args)
    }
    Object.assign(CanvasRenderingContext2D.prototype, {
      clearRect(...args) {
        if (this.canvas.matches(selector)) { frames++; fills = 0 }
        return clearRect.apply(this, args)
      },
      fill(...args) {
        if (this.canvas.matches(selector)) fills++
        return fill.apply(this, args)
      },
      stroke(...args) {
        if (this.canvas.matches(selector)) strokes++
        return stroke.apply(this, args)
      },
    })
    window.__skinEffectAudit = {
      allow() { blocked = false },
      read: () => ({ attempts, frames, fills, strokes }),
      clean() {
        prototype.getContext = context
        Object.assign(CanvasRenderingContext2D.prototype, { clearRect, fill, stroke })
        delete window.__skinEffectAudit
      },
    }
  }, { selector, attribute })
}

async function staticSignature(page) {
  return page.locator(`[${attribute}]:visible`).evaluateAll((nodes, attribute) => nodes.map(node => {
    const style = getComputedStyle(node)
    return {
      layer: node.getAttribute(attribute), parent: node.parentElement.getAttribute(attribute),
      position: style.position, pointerEvents: style.pointerEvents, background: style.backgroundImage,
      variables: Array.from(node.style).filter(key => key.startsWith('--dsh-')).map(key => [key, node.style.getPropertyValue(key)]),
    }
  }), attribute)
}

export async function checkEffectsRuntime(session, ui, seconds, evidence, sampleNativeEvents = false) {
  const { page, open, close, apply, choose, mode } = ui
  const read = () => page.evaluate(() => window.__skinEffectAudit.read())
  const ready = () => page.waitForFunction(() => document.visibilityState === 'visible', undefined, { polling: 100 })
  const zip = await oldFormatZip()
  evidence.sampleSha256 = createHash('sha256').update(zip).digest('hex')
  await probeRenderer(page, canvas, attribute)
  try {
    await open()
    await packagePanel(ui).install(`${skin.id}.dshskin.zip`, zip)
    await mode('static')
    await apply(skin)
    await close()
    await session.show?.()
    await ready()
    await page.waitForFunction(() => window.__skinEffectAudit.read().fills === 120)
    evidence.static = { ...await read(), layers: await staticSignature(page) }
    assert.equal(evidence.static.attempts, 0)
    assert.deepEqual(evidence.static.layers.map(item => item.layer).sort(), ['aurora', 'aurora', 'canvas', 'flow', 'glass', 'holographic'])
    await page.waitForFunction(() => document.getAnimations().every(animation => !animation.animationName?.startsWith('dsh-skin-')))

    await open()
    await mode('dynamic')
    await choose(skin)
    const toggle = (await ui.editSkinEffects(skin)).getByRole('checkbox', { name: 'Liquid Refraction', exact: true })
    await toggle.press('Space')
    assert(await toggle.isChecked())
    await apply(skin)
    await close()
    await page.locator(fallback).waitFor()
    evidence.noWebgl = { attempts: (await read()).attempts, canvases: await page.locator(refraction).count() }
    assert.deepEqual(evidence.noWebgl, { attempts: 1, canvases: 0 })
    await page.evaluate(() => window.__skinEffectAudit.allow())

    await open()
    await apply(null)
    await apply(skin)
    await close()
    await page.waitForFunction(({ refraction, fallback }) =>
      document.querySelector(refraction + ':not([hidden])') || document.querySelector(fallback + ':not([hidden])'), { refraction, fallback })
    const gpu = page.locator(refraction)
    if (await gpu.count()) {
      evidence.gpu = await gpu.evaluate(node => ({ width: node.width, height: node.height }))
      assert(evidence.gpu.width * evidence.gpu.height > 0 && evidence.gpu.width * evidence.gpu.height <= 524288)
      const canLose = await gpu.evaluate(node => {
        const extension = node.getContext('webgl').getExtension('WEBGL_lose_context')
        extension?.loseContext()
        return !!extension
      })
      if (canLose) {
        await page.locator(fallback).waitFor()
        assert.deepEqual(await gpu.evaluate(node => [node.width, node.height]), [0, 0])
        evidence.gpu.lostToCss = true
        // The native visibility cycle disposes the lost surface and allocates one on resume.
      }
    } else evidence.gpu = { unavailable: true }
    const sidebar = page.locator('[data-dsh-skin-effect-surface="glass"]')
    await sidebar.hover()
    await page.waitForFunction(selector => document.querySelector(selector)?.style.getPropertyValue('--dsh-holo-angle'), layers('holographic'))
    const ripple = await page.locator('[data-dsh-skin-effect-surface="canvas"][data-phase]').evaluate(node => {
      const rect = node.getBoundingClientRect()
      return { x: Math.floor(rect.right - 32), y: Math.floor(rect.top + rect.height / 2) }
    })
    await page.mouse.click(ripple.x, ripple.y)
    await page.waitForFunction(() => window.__skinEffectAudit.read().strokes > 0, undefined, { polling: 100 })
    evidence.interactions = { holographic: true, ripple: true }

    evidence.visibility = {}
    await visibilityCycle(session, ui, seconds, evidence.visibility, {
      prepare: async () => { await session.show?.(); await ready() },
      minimizeWindow: true,
      sampleNativeEvents: sampleNativeEvents || !session.hide,
    })
    if (evidence.gpu.lostToCss) {
      await gpu.waitFor()
      evidence.gpu.resumed = true
    }
    await open()
    await mode('off')
    await page.waitForFunction(({ canvas, refraction }) => {
      const node = document.querySelector(canvas)
      return node?.width === 0 && node.height === 0 && !document.querySelector(refraction)
    }, { canvas, refraction }, { polling: 100 })
    await apply(null)
    await close()
    await page.locator(resources).first().waitFor({ state: 'detached' })
    assert.equal(await page.locator(resources).count(), 0)
    evidence.default = { resources: 0 }
  } finally { await page.evaluate(() => window.__skinEffectAudit?.clean()).catch(() => {}) }
}

export async function checkSettingsEffects(ui, session, directory, evidence) {
  const { page, panel, button, activate, selection, waitForSkin, cdp } = ui
  await session.resize(1280, 820)
  await ui.open()
  await ui.apply(deepOcean)
  const saved = await selection()
  const packages = packagePanel(ui)
  const zip = await oldFormatZip(true)
  await packages.install('settings-effects.dshskin.zip', zip)
  await ui.choose(skin)
  await ui.showEffects()
  const editor = panel.getByRole('combobox', { name: 'Skin to edit' })
  assert.equal(await editor.inputValue(), deepOcean.id)
  await ui.showGallery({ resetDetails: false })
  const controls = await ui.editSkinEffects(skin)
  const windowEffects = panel.getByRole('region', { name: 'Window effects' })
  const windowMode = windowEffects.getByRole('combobox', { name: 'Effects in this window' })
  const windowQuality = windowEffects.getByRole('combobox', { name: 'Effect quality in this window' })
  const effectiveQuality = windowEffects.locator('[data-dsh-skin-effective-quality]')
  const quality = controls.getByRole('combobox', { name: 'Skin effect quality' })
  const ambient = controls.getByRole('slider', { name: 'Ambient Light strength' })
  const refractionToggle = controls.getByRole('checkbox', { name: 'Liquid Refraction' })
  await ambient.waitFor()
  assert.equal(await editor.inputValue(), skin.id)
  assert.deepEqual(await Promise.all(['Environment', 'Materials', 'Interaction'].map(group =>
    controls.getByRole('group', { name: group, exact: true }).getByRole('checkbox').count())), [5, 3, 1])
  assert.equal(await ambient.inputValue(), '64')
  assert.equal(await refractionToggle.isChecked(), false)
  await quality.selectOption('low')
  await ambient.fill('50')
  await windowQuality.selectOption('high')
  assert.equal(await quality.inputValue(), 'low')
  assert.equal(await effectiveQuality.textContent(), 'high')
  assert.deepEqual(await selection(), saved)
  await editor.selectOption(deepOcean.id)
  await editor.selectOption(skin.id)
  assert.equal(await ambient.inputValue(), '50')
  await probeRenderer(page, canvas, attribute)
  try {
    await refractionToggle.press('Space')
    await activate(button(controls, 'Preview'))
    await waitForSkin(skin.id)
    await windowEffects.getByText(/Liquid Refraction · CSS fallback/).waitFor()
    assert.deepEqual(await selection(), saved)
    await windowMode.selectOption('economy')
    assert(await windowQuality.isDisabled())
    assert.equal(await effectiveQuality.textContent(), 'low')
    await windowMode.selectOption('off')
    await windowEffects.getByText('Effects are off in this window.').waitFor()
    assert.equal(await effectiveQuality.count(), 0)
    assert(await windowQuality.isDisabled())
    assert(await refractionToggle.isChecked())
    await windowMode.selectOption('dynamic')
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
    await windowEffects.getByText('The system’s reduced motion setting limits animations.').waitFor()
    await cdp.send('Emulation.setEmulatedMedia', { features: [] })
    await activate(button(panel, 'Cancel preview'))
    await waitForSkin(deepOcean.id)
    await activate(button(controls, 'Apply'))
    await panel.locator('[data-saved-skin="' + skin.id + '"]').waitFor()
    const applied = await selection()
    assert.deepEqual(applied.preferences[skin.id], {
      quality: 'low', effects: { 'ambient.light': { strength: 0.5 }, 'glass.refraction': { enabled: true } },
    })
    assert.equal(await windowQuality.inputValue(), 'high')
    await ambient.fill('75')
    await activate(button(controls, 'Discard changes'))
    assert.equal(await ambient.inputValue(), '50')
    assert.deepEqual(await selection(), applied)
    evidence.saved = applied.preferences[skin.id]
    evidence.window = { scope: 'current window', economy: 'low', off: true, reducedMotion: true, cssFallback: true }
    evidence.viewport = await panel.evaluate(node => ({ viewport: [innerWidth, innerHeight], content: node.clientWidth }))
    await page.screenshot({ path: join(directory, 'settings-effects-1280.png'), scale: 'css' })
    await ui.apply(null)
  } finally {
    await page.evaluate(() => window.__skinEffectAudit?.clean())
  }
}

export async function checkAmbientProvider(ui, directory, evidence) {
  const { page, open, close, mode, choose, detail, button, activate, panel, waitForSkin, apply } = ui
  const selector = layers('ambient-light')
  const light = page.locator(selector)
  const zip = await effectsZip(demo, [
    { id: 'ambient.light', renderer: 'css', enabled: true, params: {} },
    { id: 'example.unapproved', renderer: 'css', enabled: true, params: {} },
  ], ['tokens', 'css', 'effects:css'])
  evidence.sampleSha256 = createHash('sha256').update(zip).digest('hex')
  await open()
  await mode('dynamic')
  await packagePanel(ui).install(`${demo.id}.dshskin.zip`, zip)
  await choose(demo)
  await activate(button(detail(demo), 'Preview'))
  await waitForSkin(demo.id)
  await light.waitFor()
  assert.equal(await light.count(), 1)
  await activate(button(panel, 'Cancel preview'))
  await waitForSkin(null)
  await light.waitFor({ state: 'detached' })
  await apply(demo)
  await close()
  await light.waitFor()
  const owner = await light.elementHandle()
  const opacity = () => light.evaluate(node => Number(node.style.opacity))
  async function samplePulse() {
    const first = await opacity()
    await page.waitForFunction(({ selector, first }) => Math.abs(Number(document.querySelector(selector)?.style.opacity) - first) > 0.0005,
      { selector, first }, { polling: 100 })
    return [first, await opacity()]
  }
  try {
    evidence.dynamicOpacity = await samplePulse()
    evidence.layers = await staticSignature(page)
    assert.deepEqual(evidence.layers.map(layer => layer.layer), ['ambient-light'])
    assert.equal(evidence.layers[0].pointerEvents, 'none')
    assert.match(evidence.layers[0].background, /radial-gradient/)
    evidence.viewport = await page.evaluate(() => [innerWidth, innerHeight])
    await page.screenshot({ path: join(directory, 'ambient-provider.png'), scale: 'css' })
    await open()
    await mode('static')
    await close()
    evidence.staticOpacity = await light.evaluate(async node => {
      const before = Number(node.style.opacity)
      await new Promise(resolve => setTimeout(resolve, 160))
      return [before, Number(node.style.opacity)]
    })
    assert.deepEqual(evidence.staticOpacity, [0.14, 0.14])
    await open()
    await mode('dynamic')
    await close()
    evidence.resumedOpacity = await samplePulse()
    evidence.sameNode = await light.evaluate((node, mounted) => node === mounted, owner)
    assert(evidence.sameNode)
    await open()
    await apply(null)
    await close()
    await light.waitFor({ state: 'detached' })
    evidence.remaining = await page.locator(resources).count()
    assert.equal(evidence.remaining, 0)
  } finally { await owner.dispose() }
}

export async function checkAmbientPreferences(ui, directory, profileDir, evidence, rollback, foreground) {
  const { page, panel, activate, button, choose, selection, apply, waitForSkin } = ui
  const light = page.locator(layers('ambient-light'))
  const name = 'Ambient Light'
  await ui.open()
  await ui.mode('static')
  const packages = packagePanel(ui)
  const oldZip = await oldFormatZip()
  await packages.install(`${skin.id}.dshskin.zip`, oldZip)
  await choose(skin)
  const oldControls = await ui.editSkinEffects(skin)
  const quality = oldControls.getByRole('combobox', { name: /^Skin effect quality/ })
  await quality.selectOption('low')
  assert.equal(await oldControls.getByRole('checkbox', { name, exact: true }).count(), 0)
  await apply(skin)
  const before = await selection()
  assert.equal(before.preferences[skin.id].quality, 'low')
  evidence.legacy = { zipSha256: createHash('sha256').update(oldZip).digest('hex'), selection: before }

  const real = await realpath(profileDir)
  const key = createHash('sha256').update(process.platform === 'win32' ? real.toLowerCase() : real).digest('hex')
  const storage = join(dirname(dirname(profileDir)), 'storages', `skin_engine_selection_${key}.json`)
  const backup = rollback ? await readFile(storage) : undefined

  const ambientZip = await effectsZip(demo, [
    { id: 'ambient.light', renderer: 'css', enabled: true, params: {} },
  ], ['tokens', 'css', 'effects:css'])
  await packages.install(`${demo.id}.dshskin.zip`, ambientZip)
  await choose(demo)
  const controls = await ui.editSkinEffects(demo)
  const effect = controls.getByRole('checkbox', { name, exact: true })
  const strength = controls.getByRole('slider', { name: `${name} strength` })
  await strength.waitFor()
  assert.equal(await strength.inputValue(), '64')
  assert(await effect.isChecked())
  await controls.getByRole('combobox', { name: /^Skin effect quality/ }).selectOption('high')
  evidence.intensities = []
  for (const [percent, expected] of [[0, 0], [50, 0.11], [100, 0.22]]) {
    await strength.fill(String(percent))
    assert.equal(Number(await strength.inputValue()), percent)
    await activate(button(controls, 'Preview'))
    await waitForSkin(demo.id)
    if (expected) {
      await page.waitForFunction(({ selector, expected }) => Number(document.querySelector(selector)?.style.opacity) === expected,
        { selector: layers('ambient-light'), expected })
    } else assert.equal(await light.count(), 0)
    evidence.intensities.push({ percent, opacity: expected })
    assert.deepEqual(await selection(), before)
    await activate(button(panel, 'Cancel preview'))
    await waitForSkin(skin.id)
  }
  await effect.press('Space')
  assert.equal(await effect.isChecked(), false)
  assert(await strength.isDisabled())
  await apply(demo)
  assert.equal(await light.count(), 0)
  evidence.disabled = (await selection()).preferences[demo.id].effects['ambient.light']
  assert.deepEqual(evidence.disabled, { enabled: false, strength: 1 })
  await ui.editSkinEffects(demo)
  await effect.press('Space')
  await apply(demo)
  await page.waitForFunction(selector => Number(document.querySelector(selector)?.style.opacity) === 0.22, layers('ambient-light'))
  evidence.saved = await selection()
  assert.deepEqual(evidence.saved.preferences[demo.id].effects['ambient.light'], { enabled: true, strength: 1 })
  assert.equal(evidence.saved.preferences[skin.id].quality, 'low')
  evidence.viewport = await page.evaluate(() => [innerWidth, innerHeight])
  evidence.contentWidth = await panel.evaluate(node => node.getBoundingClientRect().width)
  await foreground?.()
  await page.screenshot({ path: join(directory, 'ambient-preferences.png'), scale: 'css' })

  if (rollback) {
    const old = await rollback.installOld()
    const rejected = await old.page.evaluate(async () => {
      const response = await fetch(new URL('api/dsh-skin-engine/selection', document.baseURI))
      return { status: response.status, body: await response.json() }
    })
    assert.deepEqual(rejected, { status: 503, body: { error: 'selection-unavailable' } })
    await old.waitForSkin(null)
    const restored = await rollback.restore(async () => {
      assert.deepEqual(await readFile(storage).then(JSON.parse).then(data => data.global), evidence.saved)
      await writeFile(storage, backup)
    })
    assert.deepEqual(await restored.selection(), before)
    await restored.waitForSkin(skin.id)
    await restored.open()
    await restored.apply(null)
    evidence.rollback = { rejected, restored: before, native: await restored.selection() }
  } else {
    await apply(null)
  }
}
