import assert from 'node:assert/strict'
import { join } from 'node:path'
import { deepOcean } from './browser.mjs'

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
