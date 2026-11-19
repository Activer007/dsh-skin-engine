import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { resources, showMode } from './browser.mjs'
import { sample, visibilityCycle } from './rendering.mjs'

export async function measureBeta(host, session, [ocean, oceanV2, aurora, auroraV2], evidence) {
  await host.activate('Back to chat')
  const samples = []
  async function measure(skin) {
    const prepare = async () => {
      if (skin) await host.apply(skin)
      else await showMode(host.ui, 'default', session.show)
      await session.show?.()
      await host.page.bringToFront()
    }
    const result = await sample(host.ui, skin ? 'p0' : 'default', session.show, prepare)
    samples.push({ skin: skin?.id ?? 'default', ...result })
    console.log(skin?.name ?? 'Default', result.p95)
  }
  const order = [null, ocean, oceanV2, aurora, auroraV2]
  for (const skin of order) await measure(skin)
  function regressions(round) {
    return [2, 4].flatMap(index => ['input', 'sidebar'].filter(key =>
      [round[0], round[index - 1]].some(reference => round[index].p95[key] - reference.p95[key] > 16.7))
      .map(key => round[index].skin + '/' + key))
  }
  const initial = regressions(samples)
  if (initial.length) {
    for (const skin of order.toReversed()) await measure(skin)
    const repeated = regressions(samples.slice(5).reverse()).filter(key => initial.includes(key))
    evidence.performance = { samples, initial, repeated }
    assert.deepEqual(repeated, [], 'Repeatable V2 interaction regression')
  }
  return { samples, initial }
}

export async function cycleBeta(host, session, [ocean, oceanV2, aurora, auroraV2], desktop, evidence) {
  const snapshots = []
  const counts = () => host.page.evaluate(() => ({
    scenes: document.querySelectorAll('[data-dsh-skin-effect-scene]').length,
    layers: document.querySelectorAll('[data-dsh-skin-effect-layer]').length,
    canvases: document.querySelectorAll('[data-dsh-skin-effect-scene] canvas').length,
    images: document.querySelectorAll('[data-dsh-skin-aurora-image]').length,
  }))
  const expected = new Map()
  for (let i = 0; i < 100; i++) {
    const skin = [oceanV2, auroraV2, ocean, aurora][i % 4]
    evidence.switching = { attempt: i + 1, id: skin.id }
    await host.apply(skin)
    if ((i + 1) % 20 === 0) console.log('Validated skin switch', i + 1)
    const value = await counts()
    assert.equal(value.scenes, 1)
    assert(value.canvases > 0)
    if (expected.has(skin.id)) {
      const baseline = expected.get(skin.id)
      assert.equal(value.canvases, baseline.canvases)
      assert.equal(value.layers, baseline.layers)
    } else expected.set(skin.id, value)
    if (i < 4 || i >= 96) {
      await host.ui.cdp.send('HeapProfiler.collectGarbage')
      const counters = await host.ui.cdp.send('Memory.getDOMCounters')
      snapshots.push({ switch: i + 1, id: skin.id, ...value, counters })
    }
  }
  evidence.switches = { total: 100, snapshots }
  evidence.background = {}
  await visibilityCycle(session, host.ui, 300, evidence.background, {
    prepare: () => host.apply(oceanV2), minimizeWindow: desktop,
  })
  await showMode(host.ui, 'default', session.show)
  assert.equal(await host.page.locator(resources).count(), 0)
}

export async function captureBeta(host, session, oceanV2, auroraV2) {
  for (const skin of [oceanV2, auroraV2]) {
    await host.apply(skin)
    for (let phase = 0; phase < 3; phase++) {
      if (phase) await delay(3000)
      await host.take(skin.id + '-phase-' + phase)
    }
  }
  await host.ui.activate(host.page.getByRole('treeitem', { name: /Skin Engine acceptance history|Untitled/ }))
  await host.page.getByText('const fixture = true', { exact: true }).waitFor()
  for (const skin of [auroraV2, oceanV2]) {
    await host.apply(skin)
    await host.page.getByText('const audit = true', { exact: true }).scrollIntoViewIfNeeded()
    const input = host.page.locator('[contenteditable=true]:visible').last()
    await input.fill('Review the code above.\n核对输入框与正文的对比度。\nKeep the final line legible.')
    await host.take(skin.id + '-reading')
    await session.resize(760, 860)
    await host.take(skin.id + '-760')
    await session.resize(1280, 860)
    await input.fill('')
  }
}
