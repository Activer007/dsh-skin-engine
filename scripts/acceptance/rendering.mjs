import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { setTimeout as delay } from 'node:timers/promises'
import { showMode } from './browser.mjs'

const sidebarName = /^(收起(?:左)?侧边栏|展开(?:左)?侧边栏|打开(?:左)?侧边栏|Collapse sidebar|Expand sidebar)$/
const p95 = values => Math.round([...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1] * 10) / 10

async function sample(ui, mode, foreground) {
  const { page } = ui
  await showMode(ui, mode, foreground)
  await delay(600)
  const viewport = await page.evaluate(() => ({
    width: innerWidth, height: innerHeight, dpr: devicePixelRatio,
    focused: document.hasFocus(), visibility: document.visibilityState,
  }))
  assert(viewport.focused && viewport.visibility === 'visible', 'Keep the isolated host focused during performance sampling')
  const composer = page.locator('[data-composer-input]:visible').first()
  const sidebar = page.getByRole('button', { name: sidebarName }).first()
  await composer.waitFor()
  await sidebar.waitFor()
  await page.evaluate(() => {
    const state = { frames: [], input: [], sidebar: [], visibilityChanges: [], focusLost: false, longTasks: [], draws: 0, phase: 'idle' }
    const events = new AbortController()
    const listener = (event, key) => {
      if (!event.isTrusted || state.phase !== key) return
      const begin = performance.now()
      requestAnimationFrame(() => state[key].push(performance.now() - begin))
    }
    window.addEventListener('keydown', event => {
      if (event.key === 'x' && event.target.closest('[data-composer-input]')) listener(event, 'input')
    }, { capture: true, signal: events.signal })
    window.addEventListener('click', event => {
      if (event.target.closest('button[aria-label*="侧边栏"],button[aria-label*="sidebar"]')) listener(event, 'sidebar')
    }, { capture: true, signal: events.signal })
    document.addEventListener('visibilitychange', () => state.visibilityChanges.push(document.visibilityState), { signal: events.signal })
    window.addEventListener('blur', () => { state.focusLost = true }, { signal: events.signal })
    const append = entries => entries.forEach(entry => state.longTasks.push({ start: entry.startTime, ms: entry.duration }))
    const observer = new PerformanceObserver(list => append(list.getEntries()))
    observer.observe({ type: 'longtask' })
    const prototype = CanvasRenderingContext2D.prototype
    const clear = prototype.clearRect
    prototype.clearRect = function (...args) {
      if (this.canvas.matches('[data-dsh-skin-effect-layer="canvas"]')) state.draws++
      return clear.apply(this, args)
    }
    let frameId
    state.idle = new Promise(resolve => {
      let first
      let previous
      const next = timestamp => {
        first ??= timestamp
        if (previous !== undefined) state.frames.push(timestamp - previous)
        previous = timestamp
        if (state.frames.length < 180) frameId = requestAnimationFrame(next)
        else {
          state.idleDrawFps = state.draws * 1000 / (timestamp - first)
          resolve()
        }
      }
      frameId = requestAnimationFrame(next)
    })
    state.clean = () => {
      cancelAnimationFrame(frameId)
      append(observer.takeRecords())
      observer.disconnect()
      events.abort()
      prototype.clearRect = clear
      delete window.__skinAcceptancePerf
    }
    window.__skinAcceptancePerf = state
  })

  try {
    await page.waitForFunction(() => window.__skinAcceptancePerf.frames.length === 180)
    await composer.focus()
    await page.evaluate(() => { window.__skinAcceptancePerf.phase = 'input' })
    for (let i = 0; i < 24; i++) {
      await page.keyboard.press('x')
      await page.keyboard.press('Backspace')
      await delay(90)
    }
    await page.evaluate(() => { window.__skinAcceptancePerf.phase = 'sidebar' })
    for (let i = 0; i < 16; i++) {
      await sidebar.click({ force: true })
      await delay(220)
    }
    const metrics = await page.evaluate(async () => {
      await new Promise(resolve => requestAnimationFrame(resolve))
      const state = window.__skinAcceptancePerf
      const canvas = document.querySelector('canvas[data-dsh-skin-effect-layer="canvas"]')
      state.clean()
      return {
        frames: state.frames, input: state.input, sidebar: state.sidebar, longTasks: state.longTasks,
        visibilityChanges: state.visibilityChanges, focusLost: state.focusLost,
        focused: document.hasFocus(), visibility: document.visibilityState,
        idleDrawFps: state.idleDrawFps, draws: state.draws,
        canvas: canvas ? [canvas.width, canvas.height] : null,
        effectNodes: document.querySelectorAll('[data-dsh-skin-effect-layer]').length,
      }
    })
    assert.deepEqual(metrics.visibilityChanges, [])
    assert(!metrics.focusLost && metrics.focused && metrics.visibility === 'visible', 'Host lost focus during performance sampling')
    assert.equal(metrics.input.length, 24)
    assert.equal(metrics.sidebar.length, 16)
    assert.equal(metrics.draws > 0, mode === 'p0')
    if (mode === 'default') assert.equal(metrics.effectNodes, 0)
    return {
      mode, viewport, ...metrics,
      p95: Object.fromEntries(['frames', 'input', 'sidebar'].map(key => [key, p95(metrics[key])])),
    }
  } finally {
    await page.evaluate(() => window.__skinAcceptancePerf?.clean()).catch(() => {})
  }
}

export async function performanceComparison(ui, evidence, foreground) {
  const rounds = evidence.rounds = []
  const dimensions = sample => [sample.viewport.width, sample.viewport.height, sample.viewport.dpr]
  const orders = [['default', 'static', 'p0'], ['p0', 'static', 'default']]
  for (const order of orders) {
    const samples = []
    for (const mode of order) {
      try {
        const result = await sample(ui, mode, foreground)
        if (rounds.length || samples.length) assert.deepEqual(dimensions(result), dimensions(rounds[0]?.samples[0] ?? samples[0]))
        samples.push(result)
        console.log(`Performance round ${rounds.length + 1}, ${mode}`, result.p95, `long tasks=${result.longTasks.length}`)
      } catch (error) {
        evidence.invalid = { order, mode, samples, reason: error.message }
        throw error
      }
    }
    const baseline = samples.find(entry => entry.mode === 'default')
    const dynamic = samples.find(entry => entry.mode === 'p0')
    const deltas = Object.fromEntries(Object.keys(baseline.p95).map(key => [key, Number((dynamic.p95[key] - baseline.p95[key]).toFixed(1))]))
    rounds.push({ order, samples, p0MinusDefaultMs: deltas })
  }
  evidence.repeatedP95AboveThreshold = Object.keys(rounds[0].p0MinusDefaultMs)
    .filter(key => rounds.every(round => round.p0MinusDefaultMs[key] > 16.7))
}

export async function visibilityCycle(session, ui, seconds, evidence) {
  const { page } = session
  await showMode(ui, 'p0', session.show)
  await page.locator('[data-composer-input]:visible').first().focus()
  await ui.cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false })
  await page.evaluate(() => {
    const selector = 'canvas[data-dsh-skin-effect-layer="canvas"]'
    const originalCanvas = document.querySelector(selector)
    const originalScene = document.querySelector('[data-dsh-skin-effect-scene]')
    const prototype = CanvasRenderingContext2D.prototype
    const clear = prototype.clearRect
    const arc = prototype.arc
    const events = new AbortController()
    const changes = []
    let draws = 0
    let first = false
    let position
    let lastHiddenPosition
    let firstResumedPosition
    prototype.clearRect = function (...args) {
      if (this.canvas.matches(selector)) { draws++; first = true }
      return clear.apply(this, args)
    }
    prototype.arc = function (x, y, radius, ...args) {
      if (first && this.canvas.matches(selector)) {
        first = false
        position = [x, y, radius]
        if (document.visibilityState === 'visible' && lastHiddenPosition && !firstResumedPosition) firstResumedPosition = position
      }
      return arc.call(this, x, y, radius, ...args)
    }
    document.addEventListener('visibilitychange', () => {
      changes.push(document.visibilityState)
      if (document.visibilityState === 'hidden') lastHiddenPosition = position
    }, { signal: events.signal })
    window.__skinAcceptanceCycle = {
      read() {
        const canvas = document.querySelector(selector)
        const scene = document.querySelector('[data-dsh-skin-effect-scene]')
        return {
          visibility: document.visibilityState, changes, draws, position, lastHiddenPosition, firstResumedPosition,
          viewport: [innerWidth, innerHeight], canvas: canvas ? [canvas.width, canvas.height] : null,
          sameCanvas: canvas === originalCanvas, sameScene: scene === originalScene,
          aurora: document.querySelectorAll('[data-dsh-skin-aurora-image]').length,
          animations: scene?.getAnimations({ subtree: true }).map(animation => animation.playState),
        }
      },
      clean() {
        prototype.clearRect = clear
        prototype.arc = arc
        events.abort()
        delete window.__skinAcceptanceCycle
      },
    }
  })
  const read = () => page.evaluate(() => window.__skinAcceptanceCycle.read())
  evidence.source = session.hide ? 'Electron native minimize and hide' : 'Chrome native tab switch'
  evidence.hidden = []
  let foreground
  let restoreBrowserWindow
  try {
    await page.waitForFunction(() => Boolean(window.__skinAcceptanceCycle.read().position), undefined, { polling: 100 })
    evidence.before = await read()
    assert.equal(evidence.before.visibility, 'visible')
    if (session.hide) await session.hide()
    else {
      await page.keyboard.press('Shift')
      const browserCdp = await session.browser.newBrowserCDPSession()
      const { targetInfo: original } = await ui.cdp.send('Target.getTargetInfo')
      foreground = await page.context().newPage()
      const control = await page.context().newCDPSession(foreground)
      await control.send('Emulation.setFocusEmulationEnabled', { enabled: false })
      await foreground.goto('about:blank')
      const { targetInfo: sibling } = await control.send('Target.getTargetInfo')
      const { windowId } = await browserCdp.send('Browser.getWindowForTarget', { targetId: original.targetId })
      const { windowId: siblingWindow } = await browserCdp.send('Browser.getWindowForTarget', { targetId: sibling.targetId })
      evidence.sameBrowserWindow = windowId === siblingWindow
      await foreground.bringToFront()
      assert.equal(await foreground.evaluate(() => document.visibilityState), 'visible')
      await delay(800)
      if ((await read()).visibility === 'visible') {
        await browserCdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } })
        restoreBrowserWindow = () => browserCdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } })
        evidence.source = 'Chrome native window minimize'
      }
    }
    const deadline = performance.now() + 10_000
    let snapshot = await read()
    while (snapshot.visibility !== 'hidden' || snapshot.canvas?.some(Boolean) || snapshot.aurora !== 0) {
      assert(performance.now() < deadline, `Host did not pause: ${JSON.stringify(snapshot)}`)
      await delay(100)
      snapshot = await read()
    }
    const hiddenDraws = snapshot.draws
    const start = performance.now()
    for (let step = 0; step <= 5; step++) {
      const target = seconds * 1000 * step / 5
      await delay(Math.max(0, target - (performance.now() - start)))
      snapshot = await read()
      assert.equal(snapshot.visibility, 'hidden', `Host became visible at ${Math.round(performance.now() - start)} ms: ${JSON.stringify(snapshot)}`)
      assert.equal(snapshot.draws, hiddenDraws)
      assert.equal(snapshot.aurora, 0)
      assert.deepEqual(snapshot.canvas, [0, 0])
      assert(snapshot.animations?.length && snapshot.animations.every(mode => mode === 'paused'))
      assert(snapshot.sameCanvas && snapshot.sameScene && snapshot.lastHiddenPosition)
      evidence.hidden.push({ elapsedMs: Math.round(performance.now() - start), ...snapshot })
      console.log(`Native background pause: ${Math.round(target / 1000)} s`)
    }
    if (session.show) await session.show()
    else {
      await restoreBrowserWindow?.()
      await page.bringToFront()
    }
    await page.waitForFunction(() => {
      const state = window.__skinAcceptanceCycle.read()
      return state.visibility === 'visible' && state.firstResumedPosition && state.aurora === 2
        && state.animations?.length > 0 && state.animations.every(mode => mode === 'running')
    }, undefined, { polling: 100 })
    evidence.resumed = await read()
    await delay(1200)
    evidence.settled = await read()
    assert.deepEqual(evidence.settled.changes, ['hidden', 'visible'])
    assert(evidence.settled.sameCanvas && evidence.settled.sameScene && evidence.settled.canvas.every(Boolean))
    assert(evidence.settled.draws > evidence.resumed.draws && evidence.settled.aurora === 2)
    assert.deepEqual(evidence.resumed.viewport, evidence.before.viewport)
    assert.deepEqual(evidence.resumed.firstResumedPosition, evidence.resumed.lastHiddenPosition)
  } finally {
    await restoreBrowserWindow?.().catch(() => {})
    await foreground?.close()
    await session.show?.().catch(() => {})
    await page.evaluate(() => window.__skinAcceptanceCycle?.clean()).catch(() => {})
  }
}
