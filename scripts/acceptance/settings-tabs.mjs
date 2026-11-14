import assert from 'node:assert/strict'
import { join } from 'node:path'
import { deepOcean } from './browser.mjs'
import { contrast } from './packages.mjs'

export async function checkSettingsTabs(ui, session, directory, evidence) {
  const { page, panel, activate, button, detail, selection, waitForSkin, pageTab } = ui
  await session.resize(1280, 820)
  await ui.open()
  const initial = await selection()
  const gallery = pageTab('Skin gallery')
  const effects = pageTab('Effects & performance')
  const manage = pageTab('Skin management')
  await ui.choose(deepOcean)
  const preferences = await ui.editSkinEffects(deepOcean)
  const quality = preferences.getByRole('combobox', { name: 'Skin effect quality' })
  await quality.selectOption('low')
  await activate(button(preferences, 'Preview'))
  await waitForSkin(deepOcean.id)
  async function active(tab) {
    assert.equal(await tab.getAttribute('aria-selected'), 'true')
    assert(await tab.evaluate(node => node === document.activeElement))
    assert.equal(await panel.getByRole('tabpanel').count(), 1)
    assert(await button(panel, 'Cancel preview').isVisible())
  }
  await activate(gallery)
  await gallery.press('ArrowRight')
  await active(effects)
  assert.equal(await quality.inputValue(), 'low')
  await effects.press('End')
  await active(manage)
  await manage.press('Home')
  await active(gallery)
  assert.deepEqual(await selection(), initial)

  async function dimensions() {
    return panel.evaluate(node => ({ viewport: [innerWidth, innerHeight], content: node.clientWidth, scroll: node.scrollWidth }))
  }
  const search = panel.getByRole('searchbox', { name: 'Search skins' })
  evidence.wide = await dimensions()
  assert(evidence.wide.content >= 840)
  assert(await search.isVisible())
  assert(await detail(deepOcean).isVisible())
  await page.screenshot({ path: join(directory, 'settings-tabs-1280.png'), scale: 'css' })
  await session.resize(760, 820)
  evidence.narrow = await dimensions()
  assert(evidence.narrow.content < 840)
  assert.equal(evidence.narrow.content, evidence.narrow.scroll)
  assert.equal(await search.isVisible(), false)
  const back = button(panel, 'Back to gallery')
  await back.press('Enter')
  const card = panel.getByRole('button', { name: /^Deep Ocean / })
  assert(await card.evaluate(node => node === document.activeElement))
  await card.press('Enter')
  assert(await back.evaluate(node => node === document.activeElement))
  await page.screenshot({ path: join(directory, 'settings-tabs-760.png'), scale: 'css' })
  await activate(effects)
  await activate(button(panel, 'Cancel preview'))
  await waitForSkin(initial.skinId)
  // At 760px the shell may hide its account-menu opener. Restore the
  // regular viewport to verify the focus return to that same opener.
  await session.resize(1280, 820)
  const account = page.getByRole('button', { name: /^(账号菜单|Account menu)$/ })
  await page.keyboard.press('Escape')
  await panel.waitFor({ state: 'hidden' })
  await account.waitFor()
  // Resizing can replace the shell's original opener. Verify focus return in
  // a regular-width open/close cycle with the opener mounted throughout.
  await ui.open()
  await page.keyboard.press('Escape')
  await panel.waitFor({ state: 'hidden' })
  await page.waitForFunction(() => /^(账号菜单|Account menu)$/.test(document.activeElement?.getAttribute('aria-label') ?? ''))
  evidence.keyboard = { arrowAndBoundaries: true, detailFocus: true, escape: true }
  evidence.crossPage = { draft: true, previewCancel: true, savedUnchanged: true }
}

export async function checkSettingsControls(ui, session, directory, evidence) {
  const { page, panel, button, cdp, detail } = ui
  await session.resize(1280, 820)
  await ui.open()
  await ui.choose(deepOcean)
  const gallery = ui.pageTab('Skin gallery')
  const effects = ui.pageTab('Effects & performance')
  const tablist = panel.getByRole('tablist')
  const apply = button(detail(deepOcean), 'Apply')
  assert(await apply.getAttribute('data-dsh-skin-native-control') !== null)
  assert.equal(await apply.evaluate(node => node.getBoundingClientRect().height), 36)
  assert(await tablist.evaluate(node => !!node.closest('[data-dsh-skin-native-control]')))
  const dark = await contrast(apply)
  assert(dark.ratio >= 4.5)
  await gallery.press('ArrowRight')
  assert.equal(await effects.getAttribute('aria-selected'), 'true')
  assert(await effects.evaluate(node => node === document.activeElement))
  const toggle = panel.getByRole('switch', { name: 'Liquid Glass', exact: true })
  const strength = panel.getByRole('slider', { name: 'Liquid Glass strength' })
  await toggle.waitFor()
  assert.equal(await toggle.getAttribute('aria-checked'), 'true')
  await toggle.press('Space')
  assert.equal(await toggle.getAttribute('aria-checked'), 'false')
  assert(await strength.isDisabled())
  await toggle.press('Space')
  assert.equal(await toggle.getAttribute('aria-checked'), 'true')
  assert(await strength.isEnabled())
  await button(panel.getByRole('tabpanel'), 'Discard changes').press('Enter')
  await ui.appearance('light')
  await ui.choose(deepOcean)
  const light = await contrast(apply)
  assert(light.ratio >= 4.5)
  await page.screenshot({ path: join(directory, 'settings-controls-light.png'), scale: 'css' })
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] })
  try {
    await effects.press('Enter')
    await toggle.press('Tab')
    await page.keyboard.press('Shift+Tab')
    await page.waitForFunction(() => {
      const node = document.activeElement
      return node?.getAttribute('role') === 'switch' && node.matches(':focus-visible') && getComputedStyle(node).outlineStyle !== 'none'
    })
    assert(await toggle.evaluate(node => node === document.activeElement))
    assert(await toggle.evaluate(node => parseFloat(getComputedStyle(node).borderTopWidth) > 0))
    await session.resize(760, 820)
    evidence.narrow = await panel.evaluate(node => ({ viewport: [innerWidth, innerHeight], content: node.clientWidth, scroll: node.scrollWidth }))
    assert.equal(evidence.narrow.scroll, evidence.narrow.content)
    await page.screenshot({ path: join(directory, 'settings-controls-forced-colors.png'), scale: 'css' })
  } finally {
    await cdp.send('Emulation.setEmulatedMedia', { features: [] })
  }
  await session.resize(1280, 820)
  await page.keyboard.press('Escape')
  await panel.waitFor({ state: 'hidden' })
  evidence.wide = await page.evaluate(() => [innerWidth, innerHeight])
  evidence.controls = { hostButton: true, hostSwitch: true, hostTabs: true, keyboard: true, forcedColors: true, dark, light }
}
