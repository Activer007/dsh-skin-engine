import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buffer } from 'node:stream/consumers'
import { ZipFile } from 'yazl'
import { resources } from './browser.mjs'
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

async function oldFormatZip() {
  const [ocean, neon] = await Promise.all(['deep-ocean', 'obsidian-neon'].map(async name =>
    JSON.parse(await readFile(new URL(`${name}/effects.json`, source), 'utf8')).effects))
  const effects = [...ocean, ...neon.filter(effect => !ocean.some(entry => entry.id === effect.id))]
  assert.equal(effects.length, 8)
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
  const { page, open, close, apply, choose, mode, detail } = ui
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
    const toggle = detail(skin).getByRole('checkbox', { name: 'Liquid Refraction', exact: true })
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
