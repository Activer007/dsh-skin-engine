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
  }
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
