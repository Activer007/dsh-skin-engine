import assert from 'node:assert/strict'
import { resources } from './browser.mjs'
import { palette } from './packages.mjs'

const dawn = { id: 'com.dsh.skin.dawn-station', name: '曙光航站' }
const blue = { id: 'com.dsh.skin.blue-arc', name: '蓝弧远航' }
const crimson = { id: 'com.dsh.skin.crimson-rain', name: '绯雨霓虹' }
const artwork = '[data-dsh-skin-effect-layer="artwork"] img'
const applyPath = /\/api\/dsh-skin-engine\/selection\/apply$/
const cases = ['crossSchemeApply', 'previewCancel', 'saveConflict', 'restart', 'restoreDefault']

export function appearanceReport() {
  return Object.fromEntries(cases.map(name => [name, { status: 'BLOCKED' }]))
}

async function rendered(ui, skinId, scheme) {
  await ui.waitForSkin(skinId)
  await ui.page.waitForFunction(expected => document.documentElement.style.colorScheme === expected, scheme)
  return { skinId, scheme }
}

async function active(ui, skin, scheme) {
  await ui.appearance(scheme, { select: false })
  const state = await rendered(ui, skin?.id ?? null, scheme)
  const saved = await ui.selection()
  assert.equal(saved.skinId, state.skinId)
  return { ...state, saved }
}

async function crossSchemeControls(ui, skin, scheme) {
  await ui.choose(skin)
  const detail = ui.detail(skin)
  await detail.getByText(`Apply switches DSH to ${scheme} appearance.`, { exact: true }).waitFor()
  assert(await ui.button(detail, 'Preview').isDisabled())
  await ui.button(detail, 'Apply').and(ui.page.locator(':enabled')).waitFor()
}

export async function checkAppearance(report, openInProfile, signal) {
  async function check(name, action) {
    signal.throwIfAborted()
    try {
      const evidence = await action()
      signal.throwIfAborted()
      report[name] = { status: 'PASS', ...evidence }
    } catch (error) {
      if (!signal.aborted) report[name].status = 'FAIL'
      throw error
    }
  }

  let { ui } = await openInProfile('dark')
  await ui.open()
  const initial = await active(ui, null, 'dark')
  const nativePalette = await palette(ui.page)
  let committed

  await check('crossSchemeApply', async () => {
    await crossSchemeControls(ui, dawn, 'light')
    await ui.apply(dawn)
    const light = await active(ui, dawn, 'light')
    assert.equal(light.saved.revision, initial.saved.revision + 1)
    await crossSchemeControls(ui, blue, 'dark')
    await ui.apply(blue)
    const dark = await active(ui, blue, 'dark')
    assert.equal(dark.saved.revision, light.saved.revision + 1)
    committed = dark.saved
    return { initial, light, dark, crossSchemePreviewDisabled: true }
  })

  await check('previewCancel', async () => {
    await ui.choose(crimson)
    await ui.activate(ui.button(ui.detail(crimson), 'Preview'))
    const preview = await rendered(ui, crimson.id, 'dark')
    const during = await ui.selection()
    assert.deepEqual(during, committed)
    await ui.activate(ui.button(ui.panel, 'Cancel preview'))
    const restored = await active(ui, blue, 'dark')
    assert.deepEqual(restored.saved, committed)
    return { preview, during, restored }
  })

  await check('saveConflict', async () => {
    const { page } = ui
    await page.emulateMedia({ colorScheme: 'dark' })
    await ui.appearance('system')
    await rendered(ui, blue.id, 'dark')
    assert.deepEqual(await ui.selection(), committed)
    await crossSchemeControls(ui, dawn, 'light')
    let injected
    const conflict = async route => {
      const { skinId, expectedRevision } = route.request().postDataJSON()
      const transient = await page.locator('html').evaluate(node => ({
        skinId: node.getAttribute('data-dsh-skin-id'), scheme: node.style.colorScheme,
      }))
      injected = { status: 409, skinId, expectedRevision, transient }
      await route.fulfill({ status: 409, json: { error: 'selection-conflict' } })
    }
    await page.route(applyPath, conflict, { times: 1 })
    try {
      await ui.activate(ui.button(ui.detail(dawn), 'Apply'))
      await ui.panel.getByText('Another window saved a different selection or preferences.', { exact: true }).waitFor()
    } finally {
      await page.unroute(applyPath, conflict)
    }
    assert.deepEqual(injected, {
      status: 409, skinId: dawn.id, expectedRevision: committed.revision, transient: { skinId: dawn.id, scheme: 'light' },
    })
    await ui.appearance('system', { select: false })
    const restored = await rendered(ui, blue.id, 'dark')
    const saved = await ui.selection()
    assert.deepEqual(saved, committed)
    await ui.appearance('dark')
    return { injected, restored: { ...restored, preference: 'system', saved } }
  })

  await check('restart', async () => {
    const restarted = await openInProfile(null)
    ui = restarted.ui
    await ui.open()
    const restored = await active(ui, blue, 'dark')
    assert.deepEqual(restored.saved, committed)
    await ui.page.locator(artwork).waitFor({ state: 'visible' })
    assert(await ui.page.locator(artwork).evaluate(image => image.complete && image.naturalWidth > 0))
    return { restored, artworkLoaded: true }
  })

  await check('restoreDefault', async () => {
    await ui.apply(null)
    const restored = await active(ui, null, 'dark')
    assert.equal(restored.saved.revision, committed.revision + 1)
    const ownedResources = await ui.page.locator(resources).count()
    assert.equal(ownedResources, 0)
    const actualPalette = await palette(ui.page)
    assert.deepEqual(actualPalette, nativePalette)
    return { restored, ownedResources, palette: actualPalette }
  })
  await ui.close()
}
