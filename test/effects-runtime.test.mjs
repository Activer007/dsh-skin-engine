import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { build } from 'esbuild'

const root = fileURLToPath(new URL('../', import.meta.url))
const { outputFiles: [module] } = await build({
  stdin: {
    contents: `
      export { oceanLightfield } from './src/client/effects/providers/ocean-lightfield.ts';
      export { mountAuroraPaint } from './src/client/effects/aurora.ts';
      export { createFrameScheduler } from './src/client/effects/frame-scheduler.ts';
      export { mountCanvas } from './src/client/effects/canvas.ts';
      export { createDust } from './src/client/effects/dust.ts';
      export { createBubbles } from './src/client/effects/bubbles.ts';
      export { createStarfield } from './src/client/effects/starfield.ts';
      export { createRipples } from './src/client/effects/ripple.ts';
      export { createHolographic } from './src/client/effects/holographic.ts';
      export { mountRefraction } from './src/client/effects/refraction.ts';
      export { createAutoQuality } from './src/client/effects/auto-quality.ts';
      export { effectQuality } from './src/client/effects/quality.ts';
      export { applyPreferences } from './src/shared/preferences.ts';
      export { layoutArtwork, mountArtwork } from './src/client/scene/artwork.ts';
      export { limitArtworkTravel, mountArtworkMotion } from './src/client/scene/artwork-motion.ts';
      export { effectiveScenePreset, sceneEffects } from './src/client/scene/presets.ts';
      export { effectDefinitions, parseSkinEffects } from './src/core/effects.ts';
      export { EFFECT_PROVIDER_API, defineProvider } from './src/client/effects/providers/contract.ts';
      export { createProviderRegistry } from './src/client/effects/providers/runtime.ts';
      export { createEffectsRuntime } from './src/client/effects/p0.ts';
    `,
    resolveDir: root,
  },
  write: false, bundle: true, format: 'esm',
})
const { oceanLightfield, mountAuroraPaint, createFrameScheduler, mountCanvas, createDust, createBubbles, createStarfield, createRipples, createHolographic, mountRefraction,
  createAutoQuality, effectQuality, applyPreferences, layoutArtwork, mountArtwork, limitArtworkTravel, mountArtworkMotion,
  effectiveScenePreset, sceneEffects, effectDefinitions, parseSkinEffects, EFFECT_PROVIDER_API, defineProvider, createProviderRegistry,
  createEffectsRuntime } = await import(
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

const providerLayout = { mode: 'dynamic', quality: 'balanced', canvas: true, sidebarGrid: true, filterSupported: true,
  reducedTransparency: false }
const providerPlayback = { ...providerLayout, dynamic: true, visible: true, p1Motion: true }
const declare = definition => ({ id: definition.id, renderer: definition.renderer, enabled: true, params: {} })

test('trusted registration uses the same strict schema and renderer as ZIP declarations', () => {
  const entry = declare(effectDefinitions.ambientLight)
  const parse = effects => parseSkinEffects({ schema: 'dsh.effects/v1', effects }, ['effects:css'])
  const approved = parse([entry, { ...entry, id: 'example.unapproved', params: { source: 'ignored' } }])
  assert.deepEqual(approved.effects, [{ ...entry, params: { intensity: 0.14, speed: 0.3 } }])
  assert.equal(approved.diagnostics[0].code, 'unknown-effect')
  for (const invalid of [
    [{ ...entry, renderer: 'webgl' }], [{ ...entry, params: { intensity: 0.3 } }],
    [{ ...entry, params: { shader: 'unapproved' } }], [entry, entry],
  ]) assert.throws(() => parse(invalid))
  assert.throws(() => parseSkinEffects({ schema: 'dsh.effects/v1', effects: [entry] }, []))
  const provider = defineProvider(effectDefinitions.ambientLight, { api: EFFECT_PROVIDER_API, budget: () => 0, mount: () => ({}) })
  assert.equal(provider.schema, effectDefinitions.ambientLight.schema)
  assert.equal(provider.renderer, 'css')
  assert.throws(() => createProviderRegistry([provider, provider]), /Duplicate effect Provider/)
  assert.throws(() => createProviderRegistry([{ ...provider, api: '2.0.0' }]), /Incompatible effect Provider API/)
})

test('a scene owns one instance per Provider and transfers shared frame work across pause and release', () => {
  const time = frameClock()
  const scheduler = createFrameScheduler(time.clock)
  const calls = []
  const resources = new Set()
  const base = { frames: scheduler, layer(name) {
    resources.add(name)
    return { node: {}, release: () => resources.delete(name) }
  } }
  const provider = defineProvider(effectDefinitions.ambientLight, {
    api: EFFECT_PROVIDER_API,
    budget: quality => ({ low: 1, balanced: 2, high: 3 })[quality],
    mount(context, params) {
      calls.push(['mount', params.intensity])
      context.layer('owned-layer')
      let release
      return {
        layout(state, budget) { calls.push(['layout', budget]); return state.canvas },
        resume() { calls.push('resume'); release = context.frames.add(() => calls.push('frame')) },
        pause() { calls.push('pause'); release() },
        dispose() { calls.push('dispose'); release?.() },
      }
    },
  })
  const registry = createProviderRegistry([provider])
  const effect = declare(effectDefinitions.ambientLight)
  const mount = () => registry.mount([effect, effect], base, () => {}, (id, stage) => assert.fail(`${id} ${stage}`))
  const owners = mount()
  assert.equal(owners.length, 1)
  const [first] = owners
  assert(first.layout({ ...providerLayout, quality: 'high' }))
  first.update(providerPlayback)
  first.update(providerPlayback)
  assert.equal(time.pending(), 1)
  time.step(0)
  first.update({ ...providerPlayback, dynamic: false, visible: false })
  assert.equal(time.pending(), 0)
  first.update(providerPlayback)
  assert.equal(time.pending(), 1)
  first.dispose()
  assert.equal(resources.size, 0)
  const [second] = mount()
  first.dispose()
  assert.equal(resources.size, 1)
  second.dispose()
  assert.equal(resources.size, 0)
  assert.equal(time.pending(), 0)
  assert.deepEqual(calls, [['mount', 0.14], ['layout', 3], 'resume', 'frame', 'pause', 'resume', 'dispose',
    ['mount', 0.14], 'dispose'])
})

test('partial mount, draw and frame failures release owned resources and leave sibling effects running', () => {
  const time = frameClock()
  const scheduler = createFrameScheduler(time.clock)
  const events = []
  const base = { frames: scheduler }
  const mount = (providers, effects) => createProviderRegistry(providers).mount(effects.map(declare), base, () => {},
    (id, stage) => events.push([id, stage]))
  const partial = defineProvider(effectDefinitions.refraction, {
    api: EFFECT_PROVIDER_API, budget: () => 1,
    mount(context) {
      context.own(() => events.push('released partial mount'))
      context.frames.add(() => assert.fail('failed mount retained a frame'))
      throw new Error('allocation failed')
    },
    fallback(context, _params, stage) {
      assert.equal(stage, 'mount')
      context.own(() => events.push('released CSS fallback'))
      return { layout: () => true }
    },
  })
  const failingDraw = defineProvider(effectDefinitions.dust, {
    api: EFFECT_PROVIDER_API, budget: () => 1,
    mount() {
      return { canvas: { visible: () => true, animated: () => false, draw() { throw new Error('paint failed') } },
        dispose() { throw new Error('release failed') } }
    },
  })
  const frameProvider = (definition, task) => defineProvider(definition, {
    api: EFFECT_PROVIDER_API, budget: () => 1,
    mount(context) {
      context.own(() => events.push(`released ${definition.id}`))
      return { resume() { context.frames.add(task) } }
    },
  })
  const brokenFrame = frameProvider(effectDefinitions.ambientLight, () => { throw new Error('frame failed') })
  let siblingFrames = 0
  const sibling = frameProvider(effectDefinitions.aurora, () => { siblingFrames++ })
  const owners = mount([partial, failingDraw, brokenFrame, sibling],
    [effectDefinitions.refraction, effectDefinitions.dust, effectDefinitions.ambientLight, effectDefinitions.aurora])
  assert(owners[0].layout(providerLayout))
  assert.equal(time.pending(), 0)
  for (const owner of owners) owner.update(providerPlayback)
  assert.equal(time.pending(), 1)
  const canvasState = []
  owners[1].draw({ save: () => canvasState.push('save'), restore: () => canvasState.push('restore') }, 10, 10, 0)
  assert.deepEqual(canvasState, ['save', 'restore'])
  assert(!owners[1].canvas)
  time.step(0)
  time.step(34)
  assert.equal(siblingFrames, 2)
  assert.equal(time.pending(), 1)
  for (const owner of owners) { owner.dispose(); owner.dispose() }
  assert.equal(time.pending(), 0)
  assert.deepEqual(events, ['released partial mount', ['glass.refraction', 'mount'], ['particles.dust', 'dispose'],
    ['particles.dust', 'draw'], 'released ambient.light', ['ambient.light', 'frame'], 'released CSS fallback', 'released ambient.aurora'])
})

test('a new window owner replaces the previous owner before subscribers can select again', async () => {
  const { clock } = frameClock()
  const motionListeners = new Set()
  const motion = { matches: false, addEventListener: (_event, fn) => motionListeners.add(fn),
    removeEventListener: (_event, fn) => motionListeners.delete(fn) }
  const runtime = createEffectsRuntime({ defaultView: { ...clock, matchMedia: () => motion } })
  const mount = quality => runtime.mount([], undefined, quality, undefined, { static: [], light: [], dynamic: [] })
  let releaseSubscriber
  runtime.subscribe(() => {
    if (!releaseSubscriber && runtime.getEffectiveQuality() === 'balanced') releaseSubscriber = mount('high')
  })
  const releaseFirst = mount('low')
  const releaseSecond = mount('balanced')
  assert.equal(motionListeners.size, 1)
  await Promise.resolve()
  assert.equal(runtime.getEffectiveQuality(), 'high')
  releaseFirst()
  releaseSecond()
  assert.equal(motionListeners.size, 1)
  releaseSubscriber()
  releaseSubscriber()
  assert.equal(motionListeners.size, 0)
})

test('artwork motion respects clip edges and coalesces only eligible input on the shared clock', () => {
  assert.equal(limitArtworkTravel(8, 250, -500, 760, 0.86), 8)
  assert.equal(limitArtworkTravel(8, 250, -10, 262, 0.86), 2)
  assert.equal(limitArtworkTravel(8, 250, 0, 260, 0.86), 0)
  assert.equal(limitArtworkTravel(8, 250, -40, 350, 0.14), 0)

  const { clock, step, pending } = frameClock()
  const scheduler = createFrameScheduler(clock)
  const styles = new Map()
  const attributes = new Set()
  const handlers = new Map()
  class Element { closest() { return null } }
  let selected = 'None'
  const document = { defaultView: { Element, innerWidth: 1200, innerHeight: 800 }, getSelection: () => ({ type: selected }) }
  const surface = {
    ownerDocument: document,
    addEventListener(name, callback, { signal, passive }) {
      assert(passive)
      handlers.set(name, callback)
      signal.addEventListener('abort', () => handlers.delete(name), { once: true })
    },
  }
  const node = {
    style: { setProperty: (key, value) => styles.set(key, value), removeProperty: key => styles.delete(key) },
    setAttribute: key => attributes.add(key), removeAttribute: key => attributes.delete(key),
  }
  const configure = mountArtworkMotion(node, {
    parallax: { maxX: 8, maxY: 4, settleMs: 260 }, ambientLight: { color: '#77aaff', opacity: 0.22 },
  }, scheduler)
  configure(surface)
  assert(attributes.has('data-dsh-skin-artwork-light'))
  assert.equal(handlers.size + pending(), 0)
  configure(surface, { x: 8, y: 4 })
  const target = new Element()
  const event = { target, clientX: 1600, clientY: -100, isPrimary: true, pointerType: 'mouse', isTrusted: true }
  const point = override => handlers.get('pointermove')({ ...event, ...override })
  point({ isTrusted: false })
  point({ pointerType: 'touch' })
  point({ target: { closest: () => true } })
  point({ clientX: Infinity })
  selected = 'Range'
  point({})
  selected = 'None'
  target.closest = () => target
  point({})
  target.closest = () => null
  assert.equal(pending(), 0)
  const particleTask = scheduler.add(() => {})
  point({ clientX: 0 })
  point({})
  assert.equal(pending(), 1)
  step(17)
  assert.equal(styles.get('--dsh-art-shift-x'), '8.00px')
  assert.equal(styles.get('--dsh-art-shift-y'), '-4.00px')
  particleTask()
  assert.equal(pending(), 0)
  handlers.get('pointerleave')()
  step(34)
  assert.equal(styles.get('--dsh-art-shift-x'), '0.00px')
  point({})
  configure()
  configure()
  assert.equal(handlers.size + styles.size + attributes.size + pending(), 0)
})

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

test('a skin can double dust and bubble counts within the current quality budget', () => {
  let dustCount = 0
  let bubbleRings = 0
  const context = { beginPath() {}, arc() {}, fill() { dustCount++ }, stroke() { bubbleRings++ } }
  const drawDust = createDust({ density: 1, densityMultiplier: 2, speed: 0.25, sizeRange: [0.75, 2.25], opacity: 0.35, drift: 0.3 }, '#6dc7ff')
  const drawBubbles = createBubbles({ density: 1, densityMultiplier: 2, speed: 0.35, opacity: 0.55 }, '#6dc7ff')
  for (const budget of [effectQuality.balanced, effectQuality.high]) {
    dustCount = bubbleRings = 0
    drawDust(context, 1280, 860, 0, budget)
    drawBubbles(context, 1280, 860, 0, budget.bubbles)
    assert.equal(dustCount, 2 * budget.dust)
    assert.equal(bubbleRings, 2 * budget.bubbles * 2) // Each bubble draws its ring and highlight.
  }
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

test('fixed stars keep the same coordinates across frames and remounts while alpha changes', () => {
  const params = { starCount: 108, brightness: 0.34, twinkle: 0.32, parallax: 0, depthLayers: 2 }
  const sky = createStarfield(params, '#66e0d0')
  const remounted = createStarfield(params, '#66e0d0')
  function frame(stars, delta) {
    const points = []
    const opacity = []
    const ctx = { beginPath() {}, arc(x, y) { points.push([x, y]) }, fill() { opacity.push(this.globalAlpha) } }
    stars.draw(ctx, 1280, 860, delta, effectQuality.high, true)
    return { points, opacity }
  }
  const first = frame(sky, 0)
  sky.point(1, -1)
  const second = frame(sky, 0.5)
  assert.equal(first.points.length, 108)
  assert.deepEqual(second.points, first.points)
  assert.deepEqual(frame(remounted, 0).points, first.points)
  assert.notDeepEqual(second.opacity, first.opacity)
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


test('ocean lightfield budgets and static states share the scene clock and release the shaft texture', () => {
  const tile = { getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }) }
  const release = []
  const context = { scene: { ownerDocument: { createElement: () => tile } }, own: clean => release.push(clean) }
  const declaration = { id: oceanLightfield.id, renderer: 'canvas2d', enabled: true, params: { beamCount: 5 } }
  const instance = oceanLightfield.mount(context, declaration)
  let beams = 0
  const draw = { save() {}, restore() {}, transform() {}, drawImage() { beams++ } }
  for (const [quality, count] of [['low', 2], ['balanced', 4], ['high', 5]]) {
    instance.update({ canvas: true, dynamic: true, quality }, quality)
    assert.equal(instance.canvas.animated(), quality !== 'low')
    beams = 0
    instance.canvas.draw(draw, 1280, 860, 0.03)
    assert.equal(beams, count)
  }
  instance.update({ canvas: true, dynamic: false, quality: 'high' }, 'high')
  assert.equal(instance.canvas.animated(), false)
  assert.equal(instance.canvas.visible(), true)
  instance.update({ canvas: false, dynamic: false, quality: 'high' }, 'high')
  assert.equal(instance.canvas.visible(), false)
  assert.equal(oceanLightfield.mount(context, { ...declaration, params: { intensity: 0 } }), undefined)
  release.forEach(clean => clean())
  assert.deepEqual([tile.width, tile.height], [0, 0])
})
