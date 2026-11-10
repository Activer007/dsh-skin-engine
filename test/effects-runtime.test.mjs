import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { build } from 'esbuild'

const root = fileURLToPath(new URL('../', import.meta.url))
const { outputFiles: [module] } = await build({
  stdin: {
    contents: `
      export { mountAuroraPaint } from './src/client/effects/aurora.ts';
      export { createFrameScheduler } from './src/client/effects/frame-scheduler.ts';
      export { mountCanvas } from './src/client/effects/canvas.ts';
      export { createDust } from './src/client/effects/dust.ts';
      export { createStarfield } from './src/client/effects/starfield.ts';
      export { createRipples } from './src/client/effects/ripple.ts';
      export { createHolographic } from './src/client/effects/holographic.ts';
      export { mountRefraction } from './src/client/effects/refraction.ts';
      export { createAutoQuality } from './src/client/effects/auto-quality.ts';
      export { effectQuality } from './src/client/effects/quality.ts';
      export { applyPreferences } from './src/shared/preferences.ts';
      export { layoutArtwork, mountArtwork } from './src/client/scene/artwork.ts';
      export { effectiveScenePreset, sceneEffects } from './src/client/scene/presets.ts';
    `,
    resolveDir: root,
  },
  write: false, bundle: true, format: 'esm',
})
const { mountAuroraPaint, createFrameScheduler, mountCanvas, createDust, createStarfield, createRipples, createHolographic, mountRefraction,
  createAutoQuality, effectQuality, applyPreferences, layoutArtwork, mountArtwork, effectiveScenePreset, sceneEffects } = await import(
  `data:text/javascript;base64,${Buffer.from(module.contents).toString('base64')}`
)

test('scene presets narrow the enabled effects and honor window and system motion limits', () => {
  const aurora = { id: 'ambient.aurora', enabled: true }
  const dust = { id: 'particles.dust', enabled: false }
  const flow = { id: 'light.flow', enabled: true }
  const effects = [aurora, dust, flow]
  const presets = { static: [], light: [aurora.id], dynamic: [aurora.id, dust.id] }
  assert.deepEqual(sceneEffects(effects, presets, 'static'), [])
  assert.deepEqual(sceneEffects(effects, presets, 'light'), [aurora])
  assert.deepEqual(sceneEffects(effects, presets, 'dynamic'), [aurora])
  assert.deepEqual(sceneEffects([aurora, { ...dust, enabled: true }], presets, 'dynamic').map(effect => effect.id), [aurora.id, dust.id])
  assert.equal(effectiveScenePreset('dynamic', 'dynamic', false), 'dynamic')
  assert.equal(effectiveScenePreset('dynamic', 'economy', false), 'light')
  assert.equal(effectiveScenePreset('dynamic', 'dynamic', true), 'static')
  for (const mode of ['off', 'static']) assert.equal(effectiveScenePreset('light', mode, false), 'static')
})

const illustrationLayout = {
  artwork: { asset: 'assets/portrait.webp', fit: 'contain', anchor: 'right center', focalPoint: [0.86, 0.36], scale: 1, opacity: 0.3 },
  safeArea: { contentLeftFraction: 0.7 },
  breakpoints: [{ maxWidth: 1280, artworkScale: 0.8, opacity: 0.2 }],
}

test('artwork layout keeps its focal point in the composition and protects the content column', () => {
  const viewport = { width: 1280, height: 820 }
  const content = { left: 280, top: 76, right: 1280, bottom: 820 }
  const composer = { left: 301, top: 692, right: 1253, bottom: 790 }
  const image = { width: 1672, height: 941 }
  const position = layoutArtwork(illustrationLayout, viewport, content, composer, image)
  assert.equal(position.left, 980)
  assert.equal(position.width, 300)
  assert.equal(position.opacity, 0.2)
  assert.equal(Math.round(position.imageWidth), 800)
  assert.equal(Math.round(position.imageX + position.imageWidth * 0.86), 225)
  assert.equal(Math.round(position.imageY + position.imageHeight * 0.36), 372)
  assert.equal(position.columnEnd, 281)
  assert(Math.abs(position.columnAlpha * position.opacity - 0.16) < 1e-8)
  const wide = layoutArtwork(illustrationLayout, { ...viewport, width: 1440 }, { ...content, right: 1440 }, composer, image)
  assert.equal(wide.opacity, 0.3)
  assert.equal(Math.round(wide.imageWidth), 1160)
  assert.equal(layoutArtwork(illustrationLayout, viewport, { ...content, right: 420 }, composer, image), undefined)
})

test('the artwork layer watches only its active surfaces and disconnects and detaches on release', () => {
  const watched = new Set()
  const attributes = new Set()
  const root = {}
  const document = { documentElement: root, defaultView: { innerWidth: 1280, innerHeight: 820, ResizeObserver: class {
    observe(node) { watched.add(node) }
    disconnect() { watched.clear() }
  } } }
  const content = { getBoundingClientRect: () => ({ left: 280, top: 76, right: 1280, bottom: 820 }) }
  const composer = { getBoundingClientRect: () => ({ left: 301, top: 692, right: 1253, bottom: 790, width: 952, height: 98 }) }
  let removed = false
  const image = { naturalWidth: 1672, naturalHeight: 941, style: {}, remove() { removed = true } }
  const node = { ownerDocument: document, style: { setProperty() {} }, append(child) { assert.equal(child, image) },
    setAttribute(key) { attributes.add(key) }, toggleAttribute(key, value) { if (value) attributes.add(key) } }
  const layer = mountArtwork(node, { kind: 'scene', image, layout: illustrationLayout }, () => {})
  assert.equal(layer.update(true, content, composer), true)
  assert.deepEqual(watched, new Set([root, content, composer]))
  assert.equal(layer.update(true, content), false)
  assert(node.hidden)
  assert.equal(watched.size, 0)
  assert.equal(layer.update(true, content, composer), true)
  layer.dispose()
  assert.equal(watched.size, 0)
  assert(removed)
})

test('aurora uses the decoded size and blur and releases obsolete images', async () => {
  const style = new Map()
  const attributes = new Map()
  const requests = []
  let resize
  let disconnected = false
  const node = { style: { setProperty: style.set.bind(style), removeProperty: style.delete.bind(style) },
    setAttribute: attributes.set.bind(attributes), removeAttribute: attributes.delete.bind(attributes) }
  const view = {
    Image: class {
      decode() {
        const deferred = Promise.withResolvers()
        requests.push({ source: this.src, ...deferred })
        return deferred.promise
      }
    },
    ResizeObserver: class {
      constructor(callback) { resize = width => callback([{ target: node, contentRect: { width, height: 90 } }]) }
      observe(target) { assert.equal(target, node) }
      disconnect() { disconnected = true }
    },
  }
  const paint = mountAuroraPaint(view, [node], '#28cbe2', '#7361ee')
  paint.configure(48)
  resize(120)
  paint.configure(24)
  requests[0].resolve()
  await Promise.resolve()
  assert.equal(attributes.size, 0)
  requests[1].reject(new Error('Image blocked'))
  await Promise.resolve()
  assert.equal(style.size, 0)

  resize(150)
  requests[2].resolve()
  await Promise.resolve()
  assert.match(decodeURIComponent(requests[2].source), /width="294" height="234"/)
  assert.equal(style.get('--dsh-aurora-padding'), '72px')
  assert(attributes.has('data-dsh-skin-aurora-image'))

  resize(160)
  paint.dispose()
  requests[3].resolve()
  await Promise.resolve()
  assert(disconnected)
  assert.equal(attributes.size, 0)
  assert.equal(style.size, 0)
})

function frameClock() {
  let now = 0
  let id = 0
  const frames = new Map()
  const timers = new Map()
  const clock = {
    performance: { now: () => now },
    requestAnimationFrame(callback) { frames.set(++id, callback); return id },
    cancelAnimationFrame(key) { frames.delete(key) },
    setTimeout(callback, delay) { timers.set(++id, { callback, due: now + delay }); return id },
    clearTimeout(key) { timers.delete(key) },
  }
  function step(time) {
    now = time
    for (const [key, timer] of timers) {
      if (timer.due <= now) { timers.delete(key); timer.callback() }
    }
    const ready = [...frames.values()]
    frames.clear()
    for (const callback of ready) callback(now)
  }
  return { clock, step, pending: () => frames.size + timers.size }
}

test('shared clock draws at the Balanced cadence and stops while hidden or idle', () => {
  const { clock, step, pending } = frameClock()
  const scheduler = createFrameScheduler(clock)
  const first = [], second = []
  assert.equal(pending(), 0)
  const removeFirst = scheduler.add(delta => first.push(delta))
  const removeSecond = scheduler.add(delta => second.push(delta))
  for (let n = 0; n <= 120; n++) {
    step(n * 1000 / 120)
    assert.equal(pending(), 1)
  }
  assert.equal(first.length, 31)
  assert.deepEqual(second, first)
  assert.equal(first[0], 0)
  scheduler.configure(30, true)
  assert.equal(pending(), 0)
  step(301000)
  assert.equal(first.length, 31)
  scheduler.configure(30, false)
  step(301017)
  assert.equal(first.at(-1), 0)
  step(301200)
  assert.equal(first.at(-1), 0.05)
  removeFirst()
  removeFirst()
  assert.equal(pending(), 1)
  removeSecond()
  removeSecond()
  assert.equal(pending(), 0)
})

test('refraction shares the clock, releases a lost context, restores it, and tolerates unavailable WebGL', () => {
  const { clock, step, pending } = frameClock()
  const scheduler = createFrameScheduler(clock)
  const draws = []
  const rendering = []
  const deleted = []
  let supported = false
  let lost = false
  let disconnected = 0
  let detached = 0
  let releasedContext = 0
  const gl = {
    NO_ERROR: 0, getError: () => 0, isContextLost: () => lost,
    createProgram: () => 'program', createBuffer: () => 'buffer', createTexture: () => 'texture', createShader: () => 'shader',
    deleteProgram: value => deleted.push(value), deleteBuffer: value => deleted.push(value),
    deleteTexture: value => deleted.push(value), deleteShader() {},
    shaderSource() {}, compileShader() {}, getShaderParameter: () => true, attachShader() {}, linkProgram() {},
    getProgramParameter: () => true, useProgram() {}, bindBuffer() {}, bufferData() {}, getAttribLocation: () => 0,
    enableVertexAttribArray() {}, vertexAttribPointer() {}, activeTexture() {}, bindTexture() {}, texParameteri() {}, texImage2D() {},
    getUniformLocation: name => name, uniform1i() {}, uniform1f() {}, uniform3f() {}, viewport() {},
    drawArrays() { draws.push(clock.performance.now()) },
    getExtension: () => ({ loseContext() { releasedContext++ } }),
  }
  const canvas = Object.assign(new EventTarget(), {
    width: 300, height: 150, setAttribute() {}, getContext: () => supported ? gl : null, remove() { detached++ },
  })
  const view = { ResizeObserver: class { observe() {} disconnect() { disconnected++ } } }
  const scene = { clientWidth: 1920, clientHeight: 1080, prepend() {}, ownerDocument: { createElement: () => canvas, defaultView: view } }
  const params = { distortion: 0.52, dispersion: 0.18, flowSpeed: 0.28, refractionScale: 0.65, quality: 'balanced' }
  const mount = () => mountRefraction(scene, scheduler, params, '#6dc7ff', 'high', active => rendering.push(active))
  assert.equal(mount(), undefined)
  assert.equal(pending(), 0)
  assert.deepEqual(rendering, [])

  supported = true
  const particles = scheduler.add(() => {})
  const effect = mount()
  assert(effect)
  assert(canvas.width * canvas.height <= 524288)
  assert.equal(pending(), 1)
  step(17)
  assert(draws.length >= 2)

  lost = true
  const event = new Event('webglcontextlost', { cancelable: true })
  canvas.dispatchEvent(event)
  assert(event.defaultPrevented)
  assert.deepEqual([canvas.width, canvas.height], [0, 0])
  assert.deepEqual(rendering, [true, false])
  assert.equal(pending(), 1)
  const before = draws.length
  step(67)
  assert.equal(draws.length, before)

  lost = false
  canvas.dispatchEvent(new Event('webglcontextrestored'))
  assert.deepEqual(rendering, [true, false, true])
  assert.equal(pending(), 1)
  assert(draws.length > before)
  effect.dispose()
  effect.dispose()
  canvas.dispatchEvent(new Event('webglcontextrestored'))
  assert.deepEqual(rendering, [true, false, true, false])
  assert.deepEqual(deleted.sort(), ['buffer', 'program', 'texture'])
  assert.deepEqual([disconnected, detached, releasedContext], [1, 1, 1])
  particles()
  assert.equal(pending(), 0)
})

test('Auto can sample CSS-only motion without leaving an idle frame', () => {
  const { clock, step, pending } = frameClock()
  const scheduler = createFrameScheduler(clock)
  const samples = []
  scheduler.trackCss(true)
  assert.equal(pending(), 0)
  scheduler.observe({ sample: interval => samples.push(interval), resetSamples() {} })
  assert.equal(pending(), 1)
  const release = scheduler.add(() => {})
  for (let n = 0; n <= 12; n++) step(n * 1000 / 60)
  assert.equal(samples.length, 6)
  release()
  assert.equal(pending(), 1)
  scheduler.trackCss(false)
  assert.equal(pending(), 0)
})

test('shared Canvas honors DPR and pixel budgets, retains static output and frees hidden backing storage', () => {
  const { clock, step, pending } = frameClock()
  const scheduler = createFrameScheduler(clock)
  const draws = []
  let onResize
  let detached = false
  let disconnected = false
  const listeners = new Set()
  const canvas = {
    width: 300, height: 150,
    setAttribute() {}, getContext: () => ({ setTransform() {}, clearRect() {} }),
    remove() { detached = true },
  }
  const view = {
    devicePixelRatio: 3,
    ResizeObserver: class {
      constructor(callback) { onResize = callback }
      observe() {}
      disconnect() { disconnected = true }
    },
    addEventListener(_event, listener) { listeners.add(listener) },
    removeEventListener(_event, listener) { listeners.delete(listener) },
  }
  const scene = { clientWidth: 1280, clientHeight: 900, ownerDocument: { defaultView: view, createElement: () => canvas }, append() {} }
  const renderer = mountCanvas(scene, scheduler, (_ctx, width, height, delta) => draws.push({ width, height, delta }))
  renderer.configure(effectQuality.balanced, true, false)
  assert.deepEqual([canvas.width, canvas.height], [1920, 1350])
  assert.equal(pending(), 0)
  renderer.configure(effectQuality.balanced, true, true)
  step(17)
  assert.equal(draws.at(-1).delta, 0)
  renderer.configure(effectQuality.balanced, false, false)
  assert.deepEqual([canvas.width, canvas.height], [0, 0])
  assert.equal(pending(), 0)
  renderer.configure(effectQuality.high, true, true)
  scene.clientWidth = 3840
  scene.clientHeight = 2160
  onResize()
  assert(canvas.width * canvas.height <= 8 * 1024 * 1024)
  assert.equal(draws.at(-1).width, 3840)
  renderer.dispose()
  renderer.dispose()
  assert.deepEqual([canvas.width, canvas.height], [0, 0])
  assert.equal(pending(), 0)
  assert(detached && disconnected)
  assert.equal(listeners.size, 0)
})

test('dust uses the quality particle budget and preserves positions on a zero-delta redraw', () => {
  const draw = createDust({ density: 1, speed: 0.25, sizeRange: [0.75, 2.25], opacity: 0.35, drift: 0.3 }, '#6dc7ff')
  let arcs = []
  const context = { beginPath() {}, arc(x, y, radius) { arcs.push([x, y, radius]) }, fill() {} }
  draw(context, 1280, 900, 0, effectQuality.balanced)
  assert.equal(arcs.length, 56)
  assert(arcs.every(([, , radius]) => radius >= 0.75 && radius <= 2.25))
  const initial = arcs
  arcs = []
  draw(context, 1280, 900, 0, effectQuality.low)
  assert.deepEqual(arcs, initial.slice(0, 24))
  arcs = []
  draw(context, 1280, 900, 0.033, effectQuality.high)
  assert.equal(arcs.length, 96)
  assert.notDeepEqual(arcs[0], initial[0])
  assert.equal(context.globalAlpha, 1)
})

test('starfield honors quality limits and returns to an idle static view', () => {
  const stars = createStarfield({ starCount: 128, brightness: 0.65, twinkle: 0, parallax: 0.8, depthLayers: 3 }, '#aabbff')
  const arcs = []
  const context = { beginPath() {}, arc(x, y, r) { arcs.push([x, y, r]) }, fill() {} }
  const draw = (quality, motion, elapsed = 0) => {
    stars.draw(context, 1280, 900, elapsed, effectQuality[quality], motion)
    return arcs.splice(0)
  }
  const first = draw('balanced', true)
  assert.equal(first.length, 72)
  assert.equal(stars.needsFrame(), false)
  stars.point(1, -1)
  assert(stars.needsFrame())
  const moving = draw('balanced', true, 0.033)
  assert.notDeepEqual(moving[0], first[0])
  for (let n = 0; n < 120; n++) draw('balanced', true, 0.033)
  assert.equal(stars.needsFrame(), false)
  assert.deepEqual(draw('low', false), first.slice(0, 32))
  stars.resetPointer()
  assert.deepEqual(draw('high', true).slice(0, 72), first)
  assert.equal(draw('high', true).length, 120)
  assert.equal(context.globalAlpha, 1)
})

test('ripple keeps only the four newest clicks and drops expired rings by wall time', () => {
  const ripples = createRipples({ durationMs: 500, maxRadius: 120, ringCount: 3, color: '#aaeeff' })
  const arcs = []
  const context = { beginPath() {}, arc(x, _y, r) { arcs.push([x, r]) }, stroke() {} }
  for (let n = 0; n < 10; n++) ripples.add(n, 10, n)
  ripples.draw(context, 250)
  assert.equal(arcs.length, 12)
  assert.deepEqual([...new Set(arcs.map(([x]) => x))], [6, 7, 8, 9])
  assert(arcs.every(([, radius]) => radius > 0 && radius < 120))
  assert.equal(context.globalAlpha, 1)
  ripples.draw(context, 509)
  assert.equal(arcs.length, 12)
  assert.equal(ripples.active(), false)
  ripples.add(3, 5, 520)
  ripples.clear()
  assert.equal(ripples.active(), false)
})

test('holographic hover coalesces local writes and releases its one-shot frame', () => {
  const { clock, step, pending } = frameClock()
  const scheduler = createFrameScheduler(clock)
  const properties = new Map()
  let layouts = 0
  const node = {
    style: { setProperty: (k, v) => properties.set(k, v), removeProperty: k => properties.delete(k) },
    getBoundingClientRect() { layouts++; return { width: 200, height: 800, left: 20, top: 40 } },
  }
  const holo = createHolographic(node, { iridescence: 0.5, edgeWidth: 1, pointerInfluence: 0.2, spectrum: 'prism', intensity: 0.6 }, scheduler)
  holo.point(70, 150)
  holo.point(220, 840)
  assert.equal(pending(), 1)
  assert.equal(layouts, 0)
  step(17)
  assert.equal(layouts, 1)
  assert.equal(pending(), 0)
  assert.equal(properties.get('--dsh-holo-x'), '60.0%')
  holo.point(30, 40)
  holo.reset()
  assert.equal(pending(), 0)
  assert.equal(properties.has('--dsh-holo-x'), false)
  assert.equal(properties.get('--dsh-holo-edge'), '1px')
})

test('Auto ignores brief pressure, drops on recurring misses and requires sustained recovery', () => {
  const auto = createAutoQuality()
  const sample = (count, interval, work) => {
    for (let n = 0; n < count; n++) auto.sample(interval, work)
  }
  sample(7, 50, 2)
  sample(17, 34, 1)
  assert.equal(auto.get(), 'balanced')
  sample(8, 34, 9)
  sample(16, 34, 1)
  assert.equal(auto.get(), 'low')
  sample(79, 50, 1)
  assert.equal(auto.get(), 'low')
  sample(1, 50, 5)
  sample(79, 50, 1)
  assert.equal(auto.get(), 'low')
  auto.resetSamples()
  sample(79, 50, 1)
  assert.equal(auto.get(), 'low')
  sample(1, 50, 1)
  assert.equal(auto.get(), 'balanced')
  sample(24, 52, 1)
  sample(9, 84, 1)
  sample(71, 50, 1)
  assert.equal(auto.get(), 'low')
  sample(7, 84, 1)
  sample(73, 50, 1)
  assert.equal(auto.get(), 'balanced')
})

test('pack declarations require a user preference before enabling WebGL', () => {
  const effect = { id: 'glass.refraction', enabled: true, renderer: 'webgl', params: { distortion: 0.25 } }
  const data = { effects: [effect], tokens: { colors: {} } }
  assert.equal(applyPreferences(data, undefined).effects[0].enabled, false)
  assert.equal(applyPreferences(data, { quality: 'auto' }).effects[0].enabled, false)
  const enabled = applyPreferences(data, { effects: { 'glass.refraction': { enabled: true, strength: 0.8 } } })
  assert.equal(enabled.effects[0].enabled, true)
  assert.equal(enabled.effects[0].params.distortion, 0.8)
  assert.equal(effect.params.distortion, 0.25)
})
