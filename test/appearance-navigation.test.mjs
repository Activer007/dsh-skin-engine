import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const bundle = await build({
  entryPoints: ['src/client/appearance-navigation.tsx'], bundle: true, write: false,
  platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives'],
})
const result = { exports: {} }
const jsx = (type, props) => ({ type, props })
const require = createRequire(import.meta.url)
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(result, result.exports,
  id => id === 'react/jsx-runtime' ? { jsx, jsxs: jsx } : id === 'react' ? {} : require(id))
const { registerAppearanceNavigation, AppearancePanel, AppearanceIcon, APPEARANCE_PANEL } = result.exports

function register(t = key => key) {
  const registrations = [], injected = [], selected = []
  const ctx = {
    layout: { selectPanel: id => selected.push(id) },
    slots: {
      inject(name, callback) { injected.push(name); return callback() },
      register(options, component) { registrations.push({ options, component }); return () => {} },
    },
  }
  registerAppearanceNavigation(ctx, t, { controller: 'one-controller', settingsSession: 'main-session', packageOperations: 'app-operations' })
  return { registrations, injected, selected }
}

function nodes(node) {
  if (!node || typeof node !== 'object') return []
  return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]
}

test('registers paired official keyed main and sidebar list entries only', () => {
  const { registrations, injected } = register()
  assert.deepEqual(injected, ['main', 'sidebar.panellist'])
  assert.equal(registrations.length, 2)
  const [main, sidebar] = registrations.map(row => row.options)
  assert.equal(main.key, APPEARANCE_PANEL)
  assert.equal(main.id, undefined)
  assert.equal(sidebar.id, APPEARANCE_PANEL)
  assert.equal(sidebar.key, undefined)
  assert.equal(sidebar.locale, main.locale)
  assert.equal(sidebar.label(), 'appearanceCenter')
})

test('label resolves current locale rather than freezing text during registration', () => {
  let language = 'en'
  const { registrations } = register(() => language === 'en' ? 'Appearance Center' : '外观中心')
  assert.equal(registrations[1].options.label(), 'Appearance Center')
  language = 'zh'
  assert.equal(registrations[1].options.label(), '外观中心')
})

test('return to chat uses official layout null, never changes a session or skin', () => {
  const { registrations, selected } = register()
  const props = registrations[0].options.inject()
  assert.equal(props.controller, 'one-controller')
  assert.equal(props.settingsSession, 'main-session')
  assert.equal(props.packageOperations, 'app-operations')
  props.backToChat()
  assert.deepEqual(selected, [null])
})

test('main wraps shared workspace without mounting a settings modal lifecycle', () => {
  const backToChat = () => {}
  const tree = AppearancePanel({ backToChat, t: key => key, settingsSession: 'main-session' })
  assert.equal(tree.props['data-dsh-skin-appearance'], '')
  assert.equal(tree.props['data-dsh-skin-engine'], undefined)
  const workspace = tree.props.children
  assert.equal(workspace.type.name, 'SkinWorkspace')
  assert.equal(workspace.props.settingsSession, 'main-session')
  assert.equal(workspace.props.backToChat, backToChat)
})

test('sidebar owns interactive surface; icon uses native size and is decorative', () => {
  const icon = AppearanceIcon({ size: 18, active: true })
  assert.equal(icon.type, 'svg')
  assert.equal(icon.props.width, 18)
  assert.equal(icon.props.height, 18)
  assert.equal(icon.props['aria-hidden'], 'true')
  assert.equal(nodes(icon).filter(node => node.type === 'button').length, 0)
})

test('manifest explicitly loads official layout/sidebar without removing settings', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'))
  for (const dependency of ['locale', 'ui-settings', 'ui-theme', 'ui-layout', 'ui-sidebar']) {
    assert.ok(pkg.dsh.client.inject.includes(`@deepseek-ai/dsh-client-${dependency}`))
  }
})
