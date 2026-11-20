import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'
import { build } from 'esbuild'
import React from 'react'
import { act, create } from 'react-test-renderer'

const directory = await mkdtemp(new URL('../.appearance-hierarchy-test-', import.meta.url))
let SkinDetail, SkinEffects
try {
  for (const [name, file] of [['detail', 'skin-detail'], ['effects', 'skin-effects']]) {
    const result = await build({ entryPoints: [fileURLToPath(new URL(`../src/client/${file}.tsx`, import.meta.url))],
      bundle: true, write: false, format: 'esm', jsx: 'automatic', external: ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives'] })
    await writeFile(`${directory}/${name}.mjs`, result.outputFiles[0].text)
  }
  ;({ SkinDetail } = await import(pathToFileURL(`${directory}/detail.mjs`).href))
  ;({ SkinEffects } = await import(pathToFileURL(`${directory}/effects.mjs`).href))
} finally { await rm(directory, { recursive: true, force: true }) }
const choice = { manifest: { id: 'com.dsh.skin.night-navigator', name: 'Navigator', version: '1.0.0', engineApi: '1.0.0', colorScheme: 'both' },
  source: 'built-in', previews: { dark: '/dark.png', light: '/light.png' } }
const base = { values: {}, result: { data: { tokens: { color: {} }, effects: [], diagnostics: [] } },
  disabled: false, blocked: false, packageChanged: false, busy: false, applied: false, edit() {}, apply() {}, discard() {}, preview() {}, chatPreview() {} }
async function render(t, component, extra = {}, selected = choice) {
  const oldDocument = globalThis.document
  const oldAct = globalThis.IS_REACT_ACT_ENVIRONMENT
  globalThis.document = { baseURI: 'https://dsh.test/' }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  let root
  const props = { t: key => key, id: 'detail', displayName: 'Navigator', choice: selected, scheme: 'dark', artworkEditorVisible: true,
    onOpenEffects() {}, onOpenManagement() {}, editor: { ...base, ...extra } }
  await act(async () => { root = create(React.createElement(component, props)) })
  t.after(async () => {
    await act(async () => root.unmount())
    globalThis.document = oldDocument
    globalThis.IS_REACT_ACT_ENVIRONMENT = oldAct
  })
  return { root, props }
}
function contains(node, type) { return node.findAllByType(type).length > 0 }
test('U2 preview and actions precede collapsed personalization and technical metadata', async t => {
  const { root } = await render(t, SkinDetail)
  const section = root.root.findByProps({ 'data-skin-detail': choice.manifest.id })
  const children = section.children.filter(node => typeof node !== 'string')
  assert.equal(children[0].props.className, 'dsh-skin-preview-art')
  assert.equal(children[1].type, 'header')
  assert.equal(children[2].props.className, 'dsh-skin-primary-actions')
  const custom = root.root.findAllByType('details').find(node => node.findByType('summary').children.includes('customize'))
  assert.equal(custom.props.open, undefined)
  assert(contains(custom, 'input'))
  assert.equal(root.root.findByProps({ 'data-skin-technical': true }).props.open, undefined)
  assert.equal(section.props.tabIndex, -1)
})
test('U2 preview appearance and editing controls survive ordinary rerenders', async t => {
  const { root, props } = await render(t, SkinDetail)
  const mode = root.root.findAllByType('select')[0]
  await act(async () => mode.props.onChange({ currentTarget: { value: 'light' } }))
  const upload = root.root.findByProps({ type: 'file' })
  await act(async () => root.update(React.createElement(SkinDetail, { ...props, editor: { ...base, draft: { value: {} } } })))
  assert.equal(root.root.findAllByType('select')[0].props.value, 'light')
  assert.equal(root.root.findByProps({ type: 'file' }), upload)
  assert(root.root.findAllByProps({ role: 'status' }).some(node => node.children.includes('appearanceUnsaved')))
})
test('U2 stale drafts retain disabled activation and review feedback', async t => {
  const { root } = await render(t, SkinDetail, { stale: true, draft: { value: {} }, reviewDraft() {} })
  const buttons = root.root.findAllByType('button')
  assert.equal(buttons.find(node => node.children.includes('apply')).props.disabled, true)
  assert.equal(buttons.find(node => node.children.includes('chatPreview')).props.disabled, true)
  assert(buttons.some(node => node.children.includes('rebaseDraft')))
})
test('U2 effect activation precedes fields without inventing controls', async t => {
  const { root } = await render(t, SkinEffects)
  const section = root.root.findByProps({ 'data-skin-effects': choice.manifest.id })
  const children = section.children.filter(node => typeof node !== 'string')
  assert.equal(children[1].props.className, 'dsh-skin-primary-actions')
  assert.equal(root.root.findAllByProps({ type: 'range' }).length, 0)
})

test('an unknown optional effect explains the partial appearance without blocking application', async t => {
  const result = { data: { ...base.result.data, diagnostics: [{ code: 'unknown-effect' }] } }
  const { root } = await render(t, SkinDetail, { result })
  assert(root.root.findAllByProps({ role: 'status' }).some(node => node.children.includes('error.skippedEffect')))
  assert.equal(root.root.findAllByType('button').find(node => node.children.includes('apply')).props.disabled, false)
})

test('V2 quick controls use declared effects and retain Alpha overrides on first edit', async t => {
  const selected = { ...choice, manifest: { ...choice.manifest, id: 'com.dsh.skin.deep-ocean-v2' } }
  const effect = { id: 'ambient.ocean-lightfield', enabled: true, params: { intensity: 0.72, beamLength: 0.78, drift: 0.45 } }
  const effects = { 'light.flow': { enabled: false, strength: 0 } }
  let draft
  const { root } = await render(t, SkinDetail, {
    result: { data: { ...base.result.data, effects: [effect] } }, values: { effects },
    edit(value) { draft = value },
  }, selected)
  const quick = root.root.findByProps({ 'data-skin-quick-controls': true })
  const ranges = quick.findAllByProps({ type: 'range' })
  assert.deepEqual(ranges.map(n => n.props.value), [0, 78, 45, 0])
  assert(ranges.slice(0, 3).every(n => n.props.disabled))
  quick.findByProps({ type: 'checkbox' }).props.onChange({ currentTarget: { checked: true } })
  assert.deepEqual(draft.effects, { ...effects, [effect.id]: { enabled: true, strength: 0 } })
})

test('only declared Aurora V2 strength and speed are promoted, with a separate transparency reset', async t => {
  const selected = { ...choice, manifest: { ...choice.manifest, id: 'com.dsh.skin.aurora-v2' } }
  const effect = { id: 'ambient.aurora-curtain', enabled: true, params: { intensity: 0.78, flowSpeed: 0.24, foldAmplitude: 0.52 } }
  const result = { data: { ...base.result.data, effects: [effect] } }
  let draft
  const { root, props } = await render(t, SkinDetail, { result, values: { composerTransparency: 75, quality: 'low' },
    edit(value) { draft = value } }, selected)
  const quick = root.root.findByProps({ 'data-skin-quick-controls': true })
  const ranges = quick.findAllByProps({ type: 'range' })
  assert.deepEqual(ranges.map(n => n.props.value), [78, 24, 75])
  assert.equal(quick.findByProps({ id: ranges[2].props['aria-describedby'] }).children[0], 'transparencyReadingHint')
  quick.findAllByType('button').find(n => n.children.includes('resetTransparency')).props.onClick()
  assert.deepEqual(draft, { quality: 'low' })
  for (const [id, percentage] of [['com.dsh.skin.aurora', 0], ['com.dsh.skin.deep-ocean', 18]]) {
    await act(async () => root.update(React.createElement(SkinDetail, { ...props,
      choice: { ...selected, manifest: { ...selected.manifest, id } }, editor: { ...base, result } })))
    assert.equal(root.root.findAllByProps({ 'data-skin-quick-controls': true }).length, 0)
    const input = root.root.findByProps({ 'aria-label': 'composerTransparency' })
    assert.equal(input.props.value, percentage)
    assert.equal(input.props['aria-describedby'], undefined)
  }
})
