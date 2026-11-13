import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { resources } from './browser.mjs'
import { contrast, packagePanel } from './packages.mjs'

const skin = { id: 'com.dsh.skin.night-navigator.motion', name: '夜航员 · 轻量视差' }
const artwork = '[data-dsh-skin-scene-artwork]'
const parallax = 'data-dsh-skin-artwork-parallax'
const light = 'data-dsh-skin-artwork-light'
const canvas = 'canvas[data-dsh-skin-effect-layer]'

export async function checkSceneMotion(session, ui, archive, directory, evidence) {
  const { page, cdp, open, close, apply, activate, mode, panel, waitForSkin, selection } = ui
  const art = page.locator(artwork)
  const text = page.getByText('Fixture response.', { exact: true })
  const editor = page.locator('[data-composer-input]:visible')
  const preset = panel.getByRole('combobox', { name: 'Scene motion preset' })
  const quality = panel.getByRole('combobox', { name: 'Effect quality in this window' })
  const read = () => art.evaluate(node => {
    const image = node.querySelector('img')
    const transform = getComputedStyle(image).transform
    const offset = new DOMMatrix(transform === 'none' ? undefined : transform)
    const glow = getComputedStyle(node, '::after')
    return {
      viewport: [innerWidth, innerHeight], image: [image.naturalWidth, image.naturalHeight],
      offset: [offset.m41, offset.m42], transform, target: ['x', 'y'].map(axis => parseFloat(node.style.getPropertyValue('--dsh-art-shift-' + axis)) || 0),
      glow: { opacity: Number(glow.opacity), background: glow.backgroundImage },
      boxes: [node, image].map(element => [element.offsetLeft, element.offsetTop, element.offsetWidth, element.offsetHeight]),
    }
  })
  const checkState = async (hasParallax, hasLight) => {
    await art.waitFor()
    await page.waitForFunction(({ artwork, parallax, light, hasParallax, hasLight }) => {
      const node = document.querySelector(artwork)
      return node?.hasAttribute(parallax) === hasParallax && node.hasAttribute(light) === hasLight
    }, { artwork, parallax, light, hasParallax, hasLight })
    const state = await read()
    assert(state.image.every(Boolean))
    assert.equal(await page.locator(canvas).count(), 0)
    if (!hasParallax) assert.equal(state.transform, 'none')
    if (!hasLight) assert.equal(state.glow.background, 'none')
    return state
  }
  const measure = async (file, state) => {
    const nodes = await Promise.all([text.elementHandle(), editor.elementHandle()])
    try {
      // A responsive sidebar may still be sliding out after the viewport changes.
      await page.waitForFunction(nodes => {
        const sidebar = document.querySelector('[data-sidebar-drawer] [data-slot="sidebar"]')?.parentElement
        if (sidebar && sidebar.getBoundingClientRect().right > 1) return false
        return nodes.every(node => {
          const box = node.getBoundingClientRect()
          return node.contains(document.elementFromPoint(box.left + Math.min(8, box.width / 2), box.top + box.height / 2))
        })
      }, nodes, { polling: 100 })
    } finally { await Promise.all(nodes.map(node => node.dispose())) }
    const png = await page.screenshot({ path: join(directory, file), scale: 'css' })
    const backdrop = 'data:image/png;base64,' + png.toString('base64')
    const ratios = await Promise.all([contrast(text, false, backdrop), contrast(editor)])
    assert(ratios.every(item => item.ratio >= 4.5))
    return { ...state, screenshot: file, bodyContrast: ratios[0].ratio, inputContrast: ratios[1].ratio }
  }
  const resize = async width => {
    await session.resize(width, 820)
    await page.waitForFunction(width => innerWidth === width, width)
  }
  const select = async (control, value) => {
    await open()
    await ui.showEffects()
    await control.selectOption(value)
    await close()
  }

  await resize(1280)
  await activate(page.getByRole('treeitem', { name: /Skin Engine acceptance history|未命名|Untitled/ }))
  await text.waitFor()
  const zip = await readFile(archive)
  evidence.sampleSha256 = createHash('sha256').update(zip).digest('hex')
  await open()
  await packagePanel(ui).install(basename(archive), zip)
  await apply(skin)
  await close()
  const saved = await selection()
  const base = await checkState(true, true)
  assert.match(base.glow.background, /radial-gradient/)
  assert.equal(base.glow.opacity, 0.22)

  const surface = page.locator('[data-dsh-skin-effect-surface="canvas"][data-phase]')
  const box = await surface.boundingBox()
  assert(box)
  await page.mouse.move(Math.floor(box.x + box.width - 36), Math.floor(box.y + box.height / 4))
  await page.waitForFunction(selector => {
    const node = document.querySelector(selector)
    const shift = parseFloat(node.style.getPropertyValue('--dsh-art-shift-x'))
    const matrix = getComputedStyle(node.querySelector('img')).transform
    return shift > 4 && matrix !== 'none' && Math.abs(new DOMMatrix(matrix).m41 - shift) <= 0.1
  }, artwork, { polling: 100, timeout: 5000 })
  evidence.dynamic = await measure('wide-parallax.png', await read())
  assert(evidence.dynamic.offset[0] > 4 && evidence.dynamic.offset[0] <= 8)
  assert(Math.abs(evidence.dynamic.offset[1]) <= 4)
  assert.deepEqual(evidence.dynamic.boxes, base.boxes)
  const beforeInput = (await read()).target
  await editor.hover()
  await editor.press('x')
  assert(await editor.evaluate(node => node === document.activeElement && node.textContent === 'x'))
  await editor.press('Backspace')
  assert.deepEqual((await read()).target, beforeInput)
  evidence.inputUnaffected = true

  await select(preset, 'light')
  await checkState(false, true)
  await select(preset, 'dynamic')
  await select(quality, 'low')
  evidence.low = await measure('wide-static.png', await checkState(false, false))
  assert.deepEqual(evidence.low.boxes, base.boxes)
  await select(quality, 'high')
  await checkState(true, true)
  await open()
  await mode('economy')
  await close()
  await checkState(false, false)
  await open()
  await mode('dynamic')
  await close()
  await checkState(true, true)
  evidence.lowAndEconomyRestored = true

  try {
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
    evidence.reducedMotion = await checkState(false, false)
  } finally { await cdp.send('Emulation.setEmulatedMedia', { features: [] }) }
  await checkState(true, true)
  await resize(760)
  evidence.narrow = await measure('narrow-static.png', await checkState(false, false))
  await resize(1280)
  await checkState(true, true)

  if (session.hide) {
    const hidden = Promise.withResolvers()
    await page.exposeFunction('__skinArtworkHidden', hidden.resolve)
    await page.evaluate(({ artwork, parallax, light }) => {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'hidden') return
        const node = document.querySelector(artwork)
        void window.__skinArtworkHidden({ visibility: document.visibilityState,
          parallax: node?.hasAttribute(parallax), light: node?.hasAttribute(light) })
      })
    }, { artwork, parallax, light })
    let timer
    try {
      await session.hide()
      evidence.hidden = await Promise.race([hidden.promise, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Desktop did not report native hiding')), 30_000)
      })])
      assert.deepEqual(evidence.hidden, { visibility: 'hidden', parallax: false, light: false })
    } finally {
      clearTimeout(timer)
      await session.show()
    }
    await checkState(true, true)
  }

  const conflict = 'data-we-wallpaper'
  try {
    await page.locator('body').evaluate((body, conflict) => body.setAttribute(conflict, 'next-09-fixture'), conflict)
    await waitForSkin(null)
    await art.waitFor({ state: 'detached' })
  } finally { await page.locator('body').evaluate((body, conflict) => body.removeAttribute(conflict), conflict) }
  await waitForSkin(skin.id)
  await checkState(true, true)
  assert.deepEqual(await selection(), saved)
  evidence.conflictAndRestore = true
  await open()
  await apply(null)
  await close()
  assert.equal(await page.locator(resources).count(), 0)
  evidence.defaultCleanup = true
}
