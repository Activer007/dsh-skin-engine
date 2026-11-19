import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import { parseSkinPackage } from '../lib/host.js'

const { outputFiles } = await build({ entryPoints: ['src/shared/preferences.ts'], bundle: true,
  write: false, platform: 'node', format: 'cjs' })
const module = { exports: {} }
new Function('module', 'exports', outputFiles[0].text)(module, module.exports)
const { applyPreferences, effectControls, effectPreferenceFor } = module.exports

const specs = [
  ['glass.liquid', 'css', 'blur', 16, 0, 24, {}],
  ['ambient.aurora', 'css', 'intensity', 0.45, 0, 1, { movement: 0.2 }],
  ['light.flow', 'css', 'intensity', 0.22, 0, 1, {}],
  ['particles.dust', 'canvas2d', 'density', 0.35, 0, 1, { densityMultiplier: 3 }],
  ['particles.bubbles', 'canvas2d', 'density', 0.6, 0, 1, { densityMultiplier: 4 }],
  ['interaction.ripple', 'canvas2d', 'maxRadius', 120, 80, 220, {}],
  ['particles.starfield', 'canvas2d', 'brightness', 0.5, 0, 1, { parallax: 0 }],
  ['glass.holographic', 'css', 'intensity', 0.4, 0, 1, {}],
  ['glass.refraction', 'webgl', 'distortion', 0.2, 0, 1, {}],
  ['ambient.light', 'css', 'intensity', 0.14, 0, 0.22, { illuminateArtwork: true }],
  ['scene.brightness', 'css', 'level', 1, 0.5, 1.5, {}],
]

const manifest = { schema: 'dsh.skin/v1', id: 'fixture.effects', name: 'Legacy effects', version: '1.0.0',
  engineApi: '1.6.0', capabilities: ['tokens', 'css', 'effects:css', 'effects:canvas2d', 'effects:webgl'],
  entry: { tokens: 'tokens.json', styles: 'theme.css', effects: 'effects.json' } }
const oldEffects = specs.map(([id, renderer, , , , , params]) => ({ id, renderer, enabled: true, params }))
const parse = effects => parseSkinPackage({ manifest, tokens: { schema: 'dsh.tokens/v1' },
  effects: { schema: 'dsh.effects/v1', effects } })

test('every legacy normalized strength maps to the existing native domain with identical defaults', () => {
  const parsed = parse(oldEffects)
  for (const [index, [id, , parameter, initial, minimum, maximum]] of specs.entries()) {
    const effect = parsed.effects[index]
    assert.equal(effect.params[parameter], initial, id)
    for (const strength of [0, 0.37, 1]) {
      const preferences = JSON.parse(JSON.stringify({ effects: { [id]: { enabled: true, strength } } }))
      const rendered = applyPreferences(parsed, preferences).effects[index]
      assert.equal(rendered.params[parameter], minimum + strength * (maximum - minimum), id)
      assert(rendered.enabled, id)
    }
    for (const value of [minimum - 0.01, maximum + 0.01]) {
      assert.throws(() => parse([{ ...oldEffects[index], params: { ...oldEffects[index].params, [parameter]: value } }]),
        { name: 'SkinValidationError' })
    }
  }
})

test('controls preserve particle multipliers, fixed stars, artwork light, aurora controls and WebGL opt-in', () => {
  const parsed = parse(oldEffects)
  const byId = id => parsed.effects.find(effect => effect.id === id)
  const dust = effectControls(byId('particles.dust'), { strength: 0.5 })
  const bubbles = effectControls(byId('particles.bubbles'))
  assert.deepEqual([dust.minimum, dust.maximum, dust.percentage], [0, 300, 150])
  assert.deepEqual([bubbles.minimum, bubbles.maximum, bubbles.percentage], [0, 400, 240])
  assert.equal(effectControls(byId('particles.starfield')).label, 'effect.fixedStars')
  const light = effectControls(byId('ambient.light'), { strength: 0.6 })
  assert.deepEqual([light.label, light.measure, light.maximum, light.percentage], ['effect.artworkLight', 'brightness', 200, 120])
  const brightness = effectControls(byId('scene.brightness'))
  assert.deepEqual([brightness.minimum, brightness.maximum, brightness.percentage], [50, 150, 100])
  const aurora = byId('ambient.aurora')
  assert.deepEqual(effectControls(aurora, { speed: 0.7 }).additional.map(item =>
    [item.key, item.minimum, item.maximum, item.percentage]), [['movement', 0, 100, 20], ['speed', 10, 100, 70]])
  assert.deepEqual(effectControls({ ...aurora, params: { ...aurora.params, movement: undefined } }).additional, [])
  const updates = applyPreferences(parsed, { effects: { 'ambient.aurora': { movement: 0.8, speed: 0.7 } } })
  assert.equal(updates.effects[1].params.movement, 0.8)
  assert.equal(updates.effects[1].params.speed, 0.7)
  const refraction = effectControls(byId('glass.refraction'))
  assert.equal(refraction.enabled, false)
  assert.equal(refraction.hint, 'optionalWebgl')
  assert.equal(applyPreferences(parsed, undefined).effects.find(effect => effect.id === 'glass.refraction').enabled, false)
})

test('Aurora V2 reads Alpha curtain settings until the new effect has explicit preferences', () => {
  const id = 'com.dsh.skin.aurora-v2'
  const legacyId = 'ambient.aurora'
  const curtainId = 'ambient.aurora-curtain'
  const legacy = { enabled: false, strength: 0, speed: 0.31, movement: 0.64 }
  const preferences = { effects: { [legacyId]: legacy } }
  const raw = { id: curtainId, enabled: true, renderer: 'css', params: { intensity: 0.78, flowSpeed: 0.24, foldAmplitude: 0.52 } }
  const data = { manifest: { id }, tokens: { colors: {} }, effects: [raw] }
  const [curtain] = applyPreferences(data, preferences).effects
  assert.equal(curtain.enabled, false)
  assert.deepEqual(curtain.params, { intensity: 0, flowSpeed: 0.31, foldAmplitude: 0.64 })
  const controls = effectControls(raw, effectPreferenceFor(id, preferences.effects, curtainId))
  assert.equal(controls.enabled, false)
  assert.equal(controls.percentage, 0)
  assert.deepEqual(controls.additional.map(({ percentage }) => percentage), [64, 31])

  const explicit = { effects: { [legacyId]: legacy, [curtainId]: { ...legacy, enabled: true, strength: 0.57 } } }
  assert.equal(applyPreferences(data, explicit).effects[0].params.intensity, 0.57)
  assert.equal(applyPreferences(data, explicit).effects[0].enabled, true)
  assert.deepEqual(effectPreferenceFor(id, explicit.effects, legacyId), legacy)
  assert.equal(applyPreferences({ ...data, manifest: { id: 'fixture.curtain' } }, preferences).effects[0], raw)
})


test('Ocean V2 inherits only its Alpha light flow until a lightfield preference exists', () => {
  const id = 'com.dsh.skin.deep-ocean-v2'
  const key = 'ambient.ocean-lightfield'
  const legacy = { enabled: false, strength: 0 }
  const preferences = { 'light.flow': legacy, 'particles.dust': { strength: 0.72 } }
  assert.deepEqual(effectPreferenceFor(id, preferences, key), legacy)
  const next = { ...preferences, [key]: { enabled: true, strength: 0.41, length: 0.81, movement: 0.2 } }
  assert.deepEqual(effectPreferenceFor(id, next, key), next[key])
  assert.deepEqual(effectPreferenceFor(id, next, 'light.flow'), legacy)
  assert.equal(effectPreferenceFor('com.dsh.skin.deep-ocean', preferences, key), undefined)
  assert.equal(effectPreferenceFor('com.dsh.skin.deep-ocean-living-light', preferences, key), undefined)
})
