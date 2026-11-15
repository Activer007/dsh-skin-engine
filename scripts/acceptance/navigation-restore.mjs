import assert from 'node:assert/strict'
import { join } from 'node:path'
import { deepOcean } from './browser.mjs'
import { savePeerSelection } from './navigation-release.mjs'
import { packageVersionPair, versionedSkin } from '../../test/fixtures/package-versions.mjs'

const aurora = { id: 'com.dsh.skin.aurora' }
const applyPath = '/api/dsh-skin-engine/selection/apply'

export async function checkNavigationRestore(ui, directory, evidence) {
  const { page, activate, button, selection, waitForSkin, panel } = ui
  const main = page.locator('[data-dsh-skin-appearance]')
  const preview = page.locator('[data-dsh-skin-chat-preview]')
  const launcher = page.getByRole('navigation', { name: 'Global panels' })
    .getByRole('button', { name: 'Appearance Center', exact: true })
  const saved = (root, skin) => root.locator(`[data-saved-skin="${skin?.id ?? ''}"]`)
  const trigger = root => button(root, 'Restore Default')
  const confirm = root => button(root, 'Confirm restore')
  const cancel = root => button(root, 'Keep current selection')
  const restored = root => root.getByRole('status').filter({ hasText: /^Default appearance restored\.$/ })
  const focus = async control => {
    const handle = await control.elementHandle()
    try { await page.waitForFunction(element => element === document.activeElement, handle) }
    finally { await handle.dispose() }
  }
  const openConfirmation = async root => {
    await trigger(root).press('Enter')
    await focus(cancel(root))
    await root.getByRole('group', { name: 'Restore Default' }).getByText(/saved skin selection will be cleared/).waitFor()
  }
  const enterGallery = () => activate(main.getByRole('tab', { name: 'Skin gallery', exact: true }))

  await activate(launcher)
  await enterGallery()
  await activate(main.locator(`[data-skin-card="${deepOcean.id}"]`))
  await activate(button(main, 'Adjust effects'))
  await main.getByRole('combobox', { name: 'Skin effect quality' }).selectOption('high')
  await activate(button(main, 'Apply'))
  await saved(main, deepOcean).waitFor()
  const first = await selection()
  assert.equal(first.preferences[deepOcean.id].quality, 'high')

  const management = main.getByRole('tab', { name: 'Skin management' })
  await activate(management)
  const [archive] = await packageVersionPair()
  await main.getByLabel('Import .dshskin.zip', { exact: true }).setInputFiles({
    name: 'restore-default.dshskin.zip', mimeType: 'application/zip', buffer: archive,
  })
  const installed = main.locator(`[data-package-id="${versionedSkin.id}"]`)
  await installed.waitFor()
  await main.getByRole('status').filter({ hasText: 'Skin installed.' }).waitFor()
  await openConfirmation(main)
  await page.screenshot({ path: join(directory, 'appearance-restore-confirmation.png'), scale: 'css' })
  await cancel(main).press('Escape')
  await focus(trigger(main))
  assert.equal(await trigger(main).getAttribute('aria-expanded'), 'false')
  assert.deepEqual(await selection(), first)

  await openConfirmation(main)
  const peer = await savePeerSelection(page, aurora, first.revision)
  const collision = page.waitForResponse(response => new URL(response.url()).pathname === applyPath && response.status() === 409)
  await confirm(main).press('Enter')
  await collision
  await main.getByRole('status').filter({ hasText: /^Another window saved a different selection or preferences\.$/ }).waitFor()
  await saved(main, aurora).waitFor()
  assert.deepEqual(await selection(), peer)
  evidence.conflict = { status: 409, retainedRevision: peer.revision, retainedId: peer.skinId }

  await enterGallery()
  await activate(main.locator(`[data-skin-card="${deepOcean.id}"]`))
  await activate(button(main, 'Preview in chat'))
  await preview.waitFor()
  await waitForSkin(deepOcean.id)
  await ui.open()
  await saved(panel, aurora).waitFor()
  await openConfirmation(panel)
  await page.screenshot({ path: join(directory, 'settings-restore-confirmation.png'), scale: 'css' })
  await activate(cancel(panel))
  await focus(trigger(panel))
  await waitForSkin(deepOcean.id)
  await openConfirmation(panel)
  await page.evaluate(path => {
    const fetch = window.fetch
    const probe = { count: 0, dropped: false, restore() { window.fetch = fetch } }
    window.__restoreProbe = probe
    window.fetch = async function (input, options) {
      const url = new URL(input instanceof Request ? input.url : input, document.baseURI)
      const reset = url.pathname === path && options?.method === 'POST'
      if (reset) probe.count++
      const response = await fetch.call(this, input, options)
      if (reset && response.ok) {
        await response.json()
        probe.dropped = true
        throw new TypeError('Test disconnected after Host acknowledged the committed restore')
      }
      return response
    }
  }, applyPath)
  try {
    // Two events before React commits the disabled state must still produce one write.
    await confirm(panel).evaluate(node => { node.click(); node.click() })
    await restored(panel).waitFor()
    await focus(restored(panel))
    await saved(panel, null).waitFor()
    await waitForSkin(null)
    await preview.waitFor({ state: 'detached' })
    const actual = await selection()
    assert.equal(actual.skinId, null)
    assert.equal(actual.revision, peer.revision + 1)
    assert.deepEqual(actual.preferences, first.preferences)
    const probe = await page.evaluate(() => ({ count: window.__restoreProbe.count, dropped: window.__restoreProbe.dropped }))
    assert.deepEqual(probe, { count: 1, dropped: true })
    evidence.lostResponse = { ...probe, confirmedRevision: actual.revision, preferencesKept: true }
  } finally {
    await page.evaluate(() => { window.__restoreProbe?.restore(); delete window.__restoreProbe })
  }
  await ui.close()
  await activate(launcher)
  await saved(main, null).waitFor()
  await activate(management)
  await installed.waitFor()
  await enterGallery()
  await activate(main.locator(`[data-skin-card="${aurora.id}"]`))
  await activate(button(main, 'Apply'))
  await saved(main, aurora).waitFor()
  await openConfirmation(main)
  await confirm(main).press('Enter')
  await restored(main).waitFor()
  await focus(restored(main))
  await saved(main, null).waitFor()
  await ui.open()
  await saved(panel, null).waitFor()
  await ui.close()
  evidence.confirmation = { cancelFocus: true, escapeFocus: true, savedStateShared: true, packageKept: true, previewCancelled: true }
}
