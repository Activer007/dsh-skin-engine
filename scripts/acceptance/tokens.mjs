import assert from 'node:assert/strict'
import { appendFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { deepOcean, resources } from './browser.mjs'
import { contrast, packagePanel } from './packages.mjs'
import { candidates, event, foreign, marker } from './token-probe.mjs'

const modern = { id: 'com.dsh.skin.morning-observatory.scene', name: '晨光温室 · 场景版' }
const auditKeys = [
  ...Object.keys(foreign), ...Object.keys(candidates).filter(key => !Object.hasOwn(foreign, key)),
  '--dsw-specific-sidebar-fill', '--dsw-specific-menu', '--dsw-alias-state-business-primary', '--dsw-focus-ring-color',
]
const base = '--dsw-alias-bg-base'
const layer2 = '--dsw-alias-bg-layer-2'
const settingsSelector = '[role="dialog"][data-shortcut-modal="settings"]'

function paint(locator, parent = false) {
  return locator.evaluate((node, parent) => {
    const target = parent ? node.parentElement : node
    const style = getComputedStyle(target)
    return {
      background: style.backgroundColor, color: style.color, caret: style.caretColor,
      width: Math.round(target.getBoundingClientRect().width),
    }
  }, parent)
}

function rgb(hex) {
  return 'rgb(' + [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16)).join(', ') + ')'
}

export async function checkTokens(session, ui, sampleDir, profileDir, evidence) {
  const { page, open, close, apply, activate, appearance, waitForSkin, selection, mode } = ui
  const dialog = page.locator(settingsSelector)
  const editor = page.locator('[data-composer-input]:visible')
  const composer = page.locator('[data-composer-card]:visible')
  const body = page.getByText('Second turn response.', { exact: true })
  const code = page.locator('pre code:visible').filter({ hasText: 'const audit = true' })
  const sidebar = page.locator('[data-slot="sidebar"]')
  const sideLabel = page.getByRole('button', { name: /^(插件|Plugins)$/ }).first()
  const history = page.getByRole('treeitem', { name: /Skin Engine acceptance history|未命名|Untitled/ })
  const turn = page.getByRole('navigation', { name: /^(轮次导航|Turn navigation)$/ }).getByRole('button').first()
  const tooltip = page.getByRole('tooltip')
  const commands = composer.getByRole('button', { name: /添加文件或调用指令|Add files|Invoke commands/i })
  const menu = page.locator('[data-trigger-menu]:visible')
  const value = name => page.evaluate(name => getComputedStyle(document.body).getPropertyValue(name).trim(), name)
  const schemeIs = scheme => page.waitForFunction(scheme => document.documentElement.style.colorScheme === scheme, scheme)
  const ratio = async locator => Math.round((await contrast(locator)).ratio * 100) / 100
  async function probe(action) {
    await page.evaluate(({ event, action }) => {
      document.documentElement.dispatchEvent(new CustomEvent(event, { detail: action }))
    }, { event, action })
    await page.locator('html[' + marker + '="' + action + '"]').waitFor({ state: 'attached', timeout: 5000 })
  }
  async function resize(width) {
    await session.resize(width, 820)
    await page.waitForFunction(width => innerWidth === width, width, { timeout: 5000 })
  }
  async function snapshot() {
    const state = await page.evaluate(keys => ({
      viewport: [innerWidth, innerHeight], scheme: document.documentElement.style.colorScheme,
      source: document.documentElement.getAttribute('data-ds-theme-source'),
      tokens: Object.fromEntries(keys.map(key => {
        const styles = getComputedStyle(document.body)
        return [key, { computed: styles.getPropertyValue(key).trim(), inline: document.body.style.getPropertyValue(key).trim() }]
      })),
    }), auditKeys)
    state.canvas = await paint(page.locator('body'))
    state.sidebar = await paint(sidebar, true)
    const wide = state.viewport[0] >= 1000
    state.sidebarText = wide ? await ratio(sideLabel) : null
    state.body = { ...await paint(body), contrast: await ratio(body) }
    state.code = { ...await paint(code), contrast: await ratio(code) }
    state.composer = { ...await paint(composer), editor: await paint(editor), contrast: await ratio(editor) }
    if (wide) {
      await turn.hover()
      const preview = tooltip.filter({ hasText: /Local test conversation|Token audit second turn/ })
      await preview.waitFor({ timeout: 5000 })
      state.raised = await paint(preview)
    } else state.raised = null

    await commands.press('Enter')
    await menu.waitFor()
    const material = menu.locator(':scope > div[aria-hidden="true"]').first()
    state.menu = { ...await paint(material), contrast: await ratio(menu.getByRole('option').first()) }
    await page.keyboard.press('Escape')
    await menu.waitFor({ state: 'hidden' })

    // Open settings while the account trigger is visible, then measure its narrow presentation.
    if (!wide) await resize(1280)
    await open()
    await dialog.waitFor()
    const general = dialog.getByRole('button', { name: /^(通用设置|General)$/ })
    await activate(general)
    if (!wide) await resize(state.viewport[0])
    await general.press('Shift')
    state.dialog = { ...await paint(dialog), contrast: await ratio(general),
      focusVisible: await general.evaluate(node => node.matches(':focus-visible')) }
    await close()
    if (wide) {
      await activate(sideLabel)
      const primary = page.getByRole('button', { name: /^(添加插件|Add plugin)$/i })
      await primary.waitFor({ timeout: 6000 })
      state.brand = { ...await paint(primary), contrast: await ratio(primary) }
      await activate(history)
      await body.waitFor()
    }
    return state
  }
  function readable({ body, code, composer, sidebarText, menu, dialog, brand }) {
    assert(dialog.focusVisible, 'Expected keyboard focus in the native settings dialog')
    for (const ratio of [body.contrast, code.contrast, composer.contrast, sidebarText, menu.contrast, dialog.contrast, brand?.contrast]) {
      if (ratio != null) assert(ratio >= 4.5, 'Normal foreground contrast below 4.5:1: ' + ratio)
    }
  }
  async function keyboardInput() {
    await editor.press('x')
    assert(await editor.evaluate(node => node === document.activeElement && node.matches(':focus-visible') && node.textContent === 'x'))
    await editor.press('Backspace')
  }

  const handle = page.locator('html[' + marker + ']')
  await handle.waitFor({ state: 'attached' })
  evidence.inspectTokens = JSON.parse(await handle.getAttribute(marker + '-tokens'))
  await activate(history)
  await body.waitFor({ timeout: 8000 }).catch(async error => {
    evidence.seedState = await page.locator('[data-phase]').first().innerText({ timeout: 2000 }).catch(() => undefined)
    throw error
  })
  await open()
  await mode('off')
  await close()
  evidence.matrix = []
  for (const scheme of ['dark', 'light']) {
    await resize(1280)
    await open()
    await appearance(scheme)
    await schemeIs(scheme)
    await close()
    for (const width of [1280, 760]) {
      await resize(width)
      const row = { scheme, width }
      evidence.matrix.push(row)
      row.native = await snapshot()
      readable(row.native)
      await probe('candidates')
      try {
        row.probe = await snapshot()
        for (const [key, pair] of Object.entries(candidates)) assert.equal(row.probe.tokens[key].inline, pair[scheme])
        assert.equal(row.probe.dialog.background, rgb(candidates[layer2][scheme]))
        assert.equal(row.probe.composer.background, rgb(candidates['--dsw-specific-input-major'][scheme]))
        assert.notEqual(row.probe.body.color, row.native.body.color)
        if (row.native.brand) {
          assert.notEqual(row.probe.brand.background, row.native.brand.background)
          assert(row.probe.brand.contrast < 4.5, 'Expected the unpaired global brand change to fail contrast')
        }
        assert.equal(row.probe.menu.background, row.native.menu.background)
        assert.equal(row.probe.composer.editor.caret, row.native.composer.editor.caret)
        if (row.native.raised) assert.equal(row.probe.raised?.background, rgb(candidates['--dsw-alias-bg-layer-1'][scheme]))
      } finally { await probe('release') }
      row.released = await snapshot()
      assert.deepEqual(row.released, row.native)
      console.log('Verified native, probe, and release at ' + scheme + ' ' + width)
    }
  }

  await resize(1280)
  await open()
  await apply(deepOcean)
  await schemeIs('dark')
  await close()
  evidence.legacy = await snapshot()
  readable(evidence.legacy)
  assert.notEqual(evidence.legacy.canvas.background, evidence.matrix[0].native.canvas.background)
  assert.notEqual(evidence.legacy.sidebar.background, evidence.matrix[0].native.sidebar.background)
  assert.deepEqual(evidence.legacy.brand, evidence.matrix[0].native.brand)
  await keyboardInput()
  await open()
  await appearance('light')
  await schemeIs('light')
  await waitForSkin(null)
  assert.equal((await selection()).skinId, deepOcean.id)
  await close()
  assert.deepEqual(await snapshot(), evidence.matrix[2].native)
  evidence.hostAppearanceRestore = true

  await open()
  const filename = modern.id + '.dshskin.zip'
  await packagePanel(ui).install(filename, await readFile(join(sampleDir, filename)))
  await apply(modern)
  await close()
  evidence.scene = await snapshot()
  readable(evidence.scene)
  assert.notEqual(evidence.scene.canvas.background, evidence.matrix[2].native.canvas.background)
  await keyboardInput()
  await open()
  await apply(null)
  await close()
  assert.deepEqual(await snapshot(), evidence.matrix[2].native)
  evidence.defaultRestore = true

  await probe('foreign')
  await open()
  await apply(deepOcean)
  await schemeIs('dark')
  await close()
  assert.notEqual(await value(base), foreign[base].dark)
  assert.equal(await value(layer2), foreign[layer2].dark)
  await probe('conflict')
  await waitForSkin(null)
  assert.equal(await value(base), foreign[base].dark)
  assert.equal(await value(layer2), foreign[layer2].dark)
  assert.equal(await page.locator('body').getAttribute('data-we-wallpaper'), event)
  assert.equal((await selection()).skinId, deepOcean.id)
  assert(await ratio(body) >= 4.5 && await ratio(editor) >= 4.5)
  await keyboardInput()
  await probe('clear-conflict')
  await waitForSkin(deepOcean.id)
  evidence.conflictPreservesForeign = true
  await appendFile(join(profileDir, 'cordis.patch.yml'), '\n- id: dsh-skin-engine\n  disabled: true\n')
  await waitForSkin(null)
  assert.equal(await page.locator(resources).count(), 0)
  assert.equal(await value(base), foreign[base].dark)
  assert.equal(await value(layer2), foreign[layer2].dark)
  await probe('release')
  assert.equal((await paint(page.locator('body'))).background, evidence.matrix[0].native.canvas.background)
  evidence.disablePreservesForeign = true
}
