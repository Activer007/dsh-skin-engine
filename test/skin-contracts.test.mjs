import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { checkSkinCompatibility, parseSkinManifest, parseSkinPackage, readBuiltInSkins } from '../lib/host.js'

const manifest = {
  schema: 'dsh.skin/v1',
  id: 'fixture.skin',
  name: 'Fixture',
  version: '1.0.0',
  engineApi: '^1.0.0',
  dshCompatibility: '>=0.2.0',
  entry: { tokens: 'tokens.json', styles: 'theme.css', effects: 'effects.json' },
  capabilities: ['tokens', 'css', 'assets', 'effects:css', 'effects:canvas2d', 'effects:webgl'],
}
const tokens = { schema: 'dsh.tokens/v1' }
const effects = { schema: 'dsh.effects/v1', effects: [] }
const files = { manifest, tokens, effects }
const dshVersion = '0.2.2-rc.1'
const sceneManifest = {
  ...manifest, engineApi: '^1.1.0', entry: { ...manifest.entry, scene: 'scene.json' },
  assets: ['assets/art.webp', 'assets/ui.woff2'], capabilities: [...manifest.capabilities, 'scene'],
}
const scene = {
  schema: 'dsh.scene/v1',
  layout: {
    artwork: { asset: 'assets/art.webp', fit: 'contain', anchor: 'right center', focalPoint: [0.86, 0.36], scale: 1, opacity: 0.3 },
    safeArea: { contentLeftFraction: 0.7 },
    breakpoints: [{ maxWidth: 760, artworkScale: 0.82, opacity: 0.22 }],
  },
  presets: { static: [], light: ['ambient.aurora'], dynamic: ['ambient.aurora'] },
}
const sceneFiles = {
  ...files, manifest: sceneManifest, scene,
  effects: { ...effects, effects: [{ id: 'ambient.aurora', renderer: 'css', enabled: false, params: {} }] },
}

function reject(operation, file, path, code) {
  assert.throws(operation, error => error.name === 'SkinValidationError'
    && error.diagnostics.some(issue => issue.file === file && issue.path === path && (!code || issue.code === code)))
}

test('the exact Host artifact reads and validates the packaged examples', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(pkg.engines.dsh, dshVersion)
  const examples = await readBuiltInSkins()
  assert.deepEqual(examples.map(example => example.manifest.id), [
    'com.dsh.skin.deep-ocean', 'com.dsh.skin.aurora', 'com.dsh.skin.obsidian-neon', 'com.dsh.skin.paper-light',
    'com.dsh.skin.mist-pine', 'com.dsh.skin.night-navigator',
    'com.dsh.skin.morning-observatory', 'com.dsh.skin.jade-archive', 'com.dsh.skin.rainline',
    'com.dsh.skin.blue-arc', 'com.dsh.skin.dawn-station', 'com.dsh.skin.moonlit-horizon', 'com.dsh.skin.crimson-rain',
  ])
  assert.deepEqual(examples.map(example => example.effects.length), [5, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  assert.deepEqual(examples.map(example => example.manifest.colorScheme), [
    'dark', 'dark', 'dark', 'light', 'light', 'dark', 'light', 'light', 'dark',
    'dark', 'light', 'dark', 'dark',
  ])
  assert.deepEqual(examples[3].manifest.preview, { light: 'preview/light.png' })
  assert.equal(examples[0].effects.find(effect => effect.id === 'glass.refraction')?.enabled, false)
  assert.deepEqual(examples[2].effects.map(effect => effect.id), [
    'glass.liquid', 'glass.holographic', 'particles.starfield', 'interaction.ripple',
  ])
  for (const example of examples) {
    assert.deepEqual(example.diagnostics, [])
    assert.equal(checkSkinCompatibility(example.manifest, dshVersion), undefined)
    assert(!Object.hasOwn(example, 'scene'))
  }
})

test('SceneSpec is opt-in and preserves the compatibility of API 1.0-only packages', () => {
  for (const engineApi of ['1.0.0', '~1.0.0', '^1.0.0']) {
    const legacy = parseSkinPackage({ ...files, manifest: { ...manifest, engineApi } })
    assert.equal(checkSkinCompatibility(legacy.manifest, dshVersion), undefined)
    assert(!Object.hasOwn(legacy, 'scene'))
  }
  const parsed = parseSkinPackage(sceneFiles)
  assert.deepEqual(parsed.scene, scene)
  assert.equal(parsed.effects[0].enabled, false)
  assert.equal(checkSkinCompatibility(parsed.manifest, dshVersion), undefined)
  for (const engineApi of ['*', '^1.0.0 || ^1.1.0', '>=1.1.0-rc.1']) {
    reject(() => parseSkinManifest({ ...sceneManifest, engineApi }), 'skin.json', 'engineApi', 'scene-engine-api')
  }
  for (const engineApi of ['1.1.0', '1.2.0', '^1.2.0', '1.3.0']) {
    assert.equal(checkSkinCompatibility(parseSkinManifest({ ...sceneManifest, engineApi }), dshVersion), undefined)
  }
  assert.equal(checkSkinCompatibility(parseSkinManifest({ ...sceneManifest, engineApi: '^1.5.0' }), dshVersion).code, 'incompatible-engine')
  reject(() => parseSkinManifest({ ...sceneManifest, capabilities: manifest.capabilities }), 'skin.json', 'capabilities', 'scene-capability-mismatch')
  reject(() => parseSkinManifest({ ...sceneManifest, entry: manifest.entry }), 'skin.json', 'capabilities', 'scene-capability-mismatch')
  reject(() => parseSkinManifest({ ...sceneManifest, entry: { ...manifest.entry, scene: '../scene.json' } }), 'skin.json', 'entry.scene')
  reject(() => parseSkinPackage({ ...sceneFiles, scene: undefined }), 'scene.json', '')
  reject(() => parseSkinPackage({ ...files, scene }), 'scene.json', '', 'undeclared-scene')
})

test('dual appearance keeps the v1 base, gates variants on API 1.3, and validates both assets', () => {
  const dual = {
    ...sceneFiles,
    manifest: { ...sceneManifest, colorScheme: 'both', engineApi: '^1.3.0', assets: [...sceneManifest.assets, 'assets/night.webp'] },
    tokens: { ...tokens, colors: { canvas: '#eee', surface: '#abc' }, variants: { dark: { canvas: '#111' } } },
    scene: { ...scene, layout: { ...scene.layout, artwork: { ...scene.layout.artwork, variants: { dark: 'assets/night.webp' } } } },
  }
  const parsed = parseSkinPackage(dual)
  assert.deepEqual(parsed.tokens.colors, dual.tokens.colors)
  assert.deepEqual(parsed.tokens.variants, dual.tokens.variants)
  assert.deepEqual(parsed.scene, dual.scene)
  assert.equal(checkSkinCompatibility(parsed.manifest, dshVersion), undefined)
  assert.equal(parseSkinPackage({ ...files, manifest: { ...manifest, colorScheme: 'both' } }).tokens.variants, undefined)
  reject(() => parseSkinPackage({ ...dual, manifest: { ...dual.manifest, colorScheme: 'light' } }),
    'skin.json', 'colorScheme', 'dual-appearance-scheme')
  reject(() => parseSkinPackage({ ...dual, manifest: { ...dual.manifest, engineApi: '^1.2.0 || ^1.3.0' } }),
    'skin.json', 'engineApi', 'dual-appearance-engine-api')
  reject(() => parseSkinPackage({ ...dual, tokens: { ...dual.tokens, variants: { dark: { canvas: 'red' } } } }),
    'tokens.json', 'variants.dark.canvas')
  reject(() => parseSkinPackage({ ...dual, tokens: { ...dual.tokens, variants: { system: {} } } }),
    'tokens.json', 'variants')
  reject(() => parseSkinPackage({ ...dual, tokens: { ...dual.tokens, colors: {} } }),
    'tokens.json', 'variants.light.canvas', 'incomplete-surface-pair')
  for (const asset of ['assets/Night.webp', 'assets/ui.woff2', 'https://example.test/art.webp']) {
    const artwork = { ...scene.layout.artwork, variants: { light: asset } }
    reject(() => parseSkinPackage({ ...dual, scene: { ...scene, layout: { ...scene.layout, artwork } } }),
      'scene.json', 'layout.artwork.variants.light', 'invalid-artwork-asset')
  }
})

test('artwork motion requires an audited safe area, the CSS capability, and bounded package data', () => {
  const motion = { parallax: { maxX: 8, maxY: 4, settleMs: 180 }, ambientLight: { color: '#77aaff', opacity: 0.24 } }
  const layout = { ...scene.layout, artwork: { ...scene.layout.artwork, motion } }
  const manifest = { ...sceneManifest, engineApi: '^1.4.0' }
  const files = { ...sceneFiles, manifest, scene: { ...scene, layout } }
  assert.deepEqual(parseSkinPackage(files).scene.layout.artwork.motion, motion)
  reject(() => parseSkinPackage({ ...files, manifest: sceneManifest }), 'skin.json', 'engineApi', 'artwork-motion-engine-api')
  reject(() => parseSkinPackage({ ...files, manifest: { ...manifest, capabilities: manifest.capabilities.filter(x => x !== 'effects:css') },
    effects: { schema: 'dsh.effects/v1', effects: [] }, scene: { ...files.scene, presets: { static: [], light: [], dynamic: [] } } }),
  'skin.json', 'capabilities', 'missing-capability')
  reject(() => parseSkinPackage({ ...files, scene: { ...scene, layout: { ...layout, safeArea: undefined } } }),
    'scene.json', 'layout.safeArea', 'missing-artwork-safe-area')
  const parseMotion = value => parseSkinPackage({ ...files, scene: { ...scene, layout: { ...layout, artwork: { ...layout.artwork, motion: value } } } })
  for (const [key, value] of [['maxX', 9], ['maxY', -1], ['settleMs', 179], ['settleMs', 501]]) {
    reject(() => parseMotion({ ...motion, parallax: { ...motion.parallax, [key]: value } }),
      'scene.json', `layout.artwork.motion.parallax.${key}`)
  }
  reject(() => parseMotion({ ...motion, ambientLight: { color: 'url(https://example.test/a)', opacity: 0.1 } }),
    'scene.json', 'layout.artwork.motion.ambientLight.color')
  reject(() => parseMotion({ ...motion, ambientLight: { ...motion.ambientLight, opacity: 0.25 } }),
    'scene.json', 'layout.artwork.motion.ambientLight.opacity')
  reject(() => parseMotion({ ...motion, parallax: { ...motion.parallax, target: 'body' } }),
    'scene.json', 'layout.artwork.motion.parallax')
})

test('SceneSpec refuses unowned assets, layout outside its bounds, and invalid effect references', () => {
  const { artwork, breakpoints } = scene.layout
  const withLayout = fields => ({ ...scene, layout: { ...scene.layout, ...fields } })
  const withPresets = fields => ({ ...scene, presets: { ...scene.presets, ...fields } })
  for (const [field, value] of [
    ['asset', '../art.webp'], ['asset', 'https://example.test/art.webp'], ['asset', 'assets/ui.woff2'],
    ['asset', 'assets/Art.webp'], ['asset', 'assets/art.svg'], ['fit', 'auto'], ['anchor', 'right 30%'],
    ['focalPoint', [1.01, 0]], ['scale', 1.51], ['opacity', 0.36],
  ]) {
    const path = `layout.artwork.${field}${field === 'focalPoint' ? '.0' : ''}`
    reject(() => parseSkinPackage({ ...sceneFiles, scene: withLayout({ artwork: { ...artwork, [field]: value } }) }), 'scene.json', path)
  }
  for (const [value, path] of [
    [withLayout({ artwork: { ...artwork, shader: 'shader.glsl' } }), 'layout.artwork'],
    [withLayout({ safeArea: { contentLeftFraction: 0.95 } }), 'layout.safeArea.contentLeftFraction'],
    [withLayout({ breakpoints: [...breakpoints, ...breakpoints] }), 'layout.breakpoints.1.maxWidth'],
    [withLayout({ breakpoints: [{ ...breakpoints[0], maxWidth: 319 }] }), 'layout.breakpoints.0.maxWidth'],
    [withPresets({ static: ['ambient.aurora'] }), 'presets.static'],
    [withPresets({ light: [{ id: 'ambient.aurora', enabled: true }] }), 'presets.light.0'],
    [withPresets({ dynamic: ['particles.dust'] }), 'presets.dynamic.0'],
    [withPresets({ light: ['ambient.aurora', 'ambient.aurora'] }), 'presets.light.1'],
  ]) {
    reject(() => parseSkinPackage({ ...sceneFiles, scene: value }), 'scene.json', path)
  }
  const unregistered = { id: 'future.effect', renderer: 'css', enabled: true, params: {} }
  reject(() => parseSkinPackage({ ...sceneFiles, effects: { ...effects, effects: [unregistered] },
    scene: withPresets({ light: [], dynamic: [unregistered.id] }) }), 'scene.json', 'presets.dynamic.0', 'undeclared-effect')
})

test('manifest version, runtime adapter, and data API requirements are independent', () => {
  for (const version of ['1.0.0-01', '1.0.0-alpha..1', '1.0.0+', 'v1.0.0', ' 1.0.0']) {
    reject(() => parseSkinManifest({ ...manifest, version }), 'skin.json', 'version')
  }
  for (const engineApi of ['', '  ', 'release', 'workspace:*']) {
    reject(() => parseSkinManifest({ ...manifest, engineApi }), 'skin.json', 'engineApi')
  }
  assert.equal(parseSkinManifest({ ...manifest, version: '1.0.0-rc.1+build.2' }).version, '1.0.0-rc.1+build.2')
  const parsed = parseSkinManifest(manifest)
  assert.equal(checkSkinCompatibility(parsed, dshVersion), undefined)
  // A DSH profile exemption can load the engine; it cannot add a verified adapter.
  for (const runtime of [undefined, '0.2.2', '0.2.2-alpha.1', '0.3.0-rc.1', '0.2.2rc1']) {
    assert.equal(checkSkinCompatibility(parsed, runtime).code, 'unsupported-host')
  }
  assert.equal(checkSkinCompatibility(parseSkinManifest({ ...manifest, engineApi: '^2.0.0' }), dshVersion).code, 'incompatible-engine')
  assert.equal(checkSkinCompatibility(parseSkinManifest({ ...manifest, dshCompatibility: '>=0.3.0' }), dshVersion).code, 'incompatible-dsh')
})

test('manifest rejects unknown fields, unsafe resource paths, and undeclared capabilities', () => {
  reject(() => parseSkinManifest({ ...manifest, script: 'run.js' }), 'skin.json', '', 'unrecognized_keys')
  reject(() => parseSkinManifest({ ...manifest, entry: { ...manifest.entry, tokens: '../tokens.json' } }), 'skin.json', 'entry.tokens')
  reject(() => parseSkinManifest({ ...manifest, capabilities: ['shell'] }), 'skin.json', 'capabilities.0')
  reject(() => parseSkinManifest({ ...manifest, capabilities: ['css', 'css'] }), 'skin.json', 'capabilities', 'duplicate-capability')
  for (const path of [
    'assets/../image.png', 'assets/%2e%2e/image.png', 'C:/image.png', '//server/image.png',
    'assets\\image.png', 'assets/image.png:alt', 'assets/con.jpg', 'assets/lpt1.webp',
    'assets/dir./image.png', 'assets/image.png ', 'assets/image.svg', 'assets/1/2/3/4/5/6/7/image.png',
  ]) {
    reject(() => parseSkinManifest({ ...manifest, assets: [path] }), 'skin.json', 'assets.0')
  }
  reject(() => parseSkinManifest({ ...manifest, assets: ['assets/a.png', 'assets/A.png'] }), 'skin.json', 'assets', 'duplicate-path')
  reject(() => parseSkinManifest({ ...manifest, preview: { dark: 'preview/font.woff2' } }), 'skin.json', 'preview.dark')
  reject(() => parseSkinManifest({ ...manifest, capabilities: ['css', 'tokens'], assets: ['assets/a.png'] }), 'skin.json', 'capabilities', 'missing-capability')
  reject(() => parseSkinPackage({ ...files, manifest: { ...manifest, capabilities: ['tokens'] } }), 'skin.json', 'capabilities', 'missing-capability')
  const shared = { light: 'preview/share.webp', dark: 'preview/share.webp' }
  assert.deepEqual(parseSkinManifest({ ...manifest, preview: shared, assets: ['assets/fonts/ui.woff2'] }).preview, shared)
})

test('missing tokens retain native defaults and typed values reject CSS syntax', () => {
  assert.deepEqual(parseSkinPackage(files).tokens, { schema: 'dsh.tokens/v1', colors: {}, radius: {}, typography: {}, shadow: {} })
  for (const [section, field, value] of [
    ['colors', 'canvas', 'url(https://example.test)'], ['colors', 'accent', '#fff; color: red'],
    ['radius', 'panel', 65], ['radius', 'control', '8px'], ['radius', 'pill', 1000],
    ['typography', 'uiFont', 'system-ui; display: none'], ['shadow', 'panel', '0 18px 60px rgba(256,0,0,.28)'],
    ['shadow', 'panel', '0 18px 60px rgba(0,0,0,.28), 0 0 0 red'],
  ]) {
    reject(() => parseSkinPackage({ ...files, tokens: { ...tokens, [section]: { [field]: value } } }), 'tokens.json', `${section}.${field}`)
  }
})

test('all eight effect definitions provide bounded defaults and skip unknown IDs', () => {
  const ids = [
    ['glass.liquid', 'css'], ['ambient.aurora', 'css'], ['particles.dust', 'canvas2d'], ['light.flow', 'css'],
    ['interaction.ripple', 'canvas2d'], ['particles.starfield', 'canvas2d'], ['glass.holographic', 'css'], ['glass.refraction', 'webgl'],
  ]
  const entries = ids.map(([id, renderer]) => ({ id, renderer, enabled: true, params: {} }))
  entries.push({ id: 'future.effect', renderer: 'future', enabled: true, params: { ignored: true } })
  const parsed = parseSkinPackage({ ...files, effects: { ...effects, effects: entries } })
  assert.deepEqual(parsed.effects.map(({ id, renderer }) => [id, renderer]), ids)
  assert.equal(parsed.effects[0].params.blur, 16)
  assert.deepEqual(parsed.effects[2].params.sizeRange, [0.75, 2.25])
  assert.equal(parsed.effects[7].params.quality, 'balanced')
  assert.deepEqual(parsed.diagnostics.map(({ code, path }) => [code, path]), [['unknown-effect', 'effects.8.id']])
})

test('known effects reject invalid params, renderers, repeated IDs, and missing permissions', () => {
  const glass = { id: 'glass.liquid', renderer: 'css', enabled: false, params: {} }
  const parseEffects = (entries, input = manifest) => parseSkinPackage({ ...files, manifest: input, effects: { ...effects, effects: entries } })
  reject(() => parseEffects([{ ...glass, renderer: 'webgl' }]), 'effects.json', 'effects.0.renderer')
  reject(() => parseEffects([{ ...glass, params: { blur: 25 } }]), 'effects.json', 'effects.0.params.blur')
  reject(() => parseEffects([{ ...glass, params: { script: 'x' } }]), 'effects.json', 'effects.0.params')
  reject(() => parseEffects([glass, glass]), 'effects.json', 'effects.1.id', 'duplicate-effect')
  reject(() => parseEffects([glass], { ...manifest, capabilities: ['tokens', 'css'] }), 'effects.json', 'effects.0.renderer', 'missing-capability')
  reject(() => parseEffects([{ ...glass, id: 'light.flow', params: { count: 3 } }]), 'effects.json', 'effects.0.params.count')
  reject(() => parseEffects([{ ...glass, id: 'particles.dust', renderer: 'canvas2d', params: { sizeRange: [4, 2] } }]), 'effects.json', 'effects.0.params.sizeRange')
})
