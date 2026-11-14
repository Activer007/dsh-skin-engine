import assert from 'node:assert/strict'
import { join } from 'node:path'
import { deepOcean } from './browser.mjs'
import { packageVersionPair, versionedSkin } from '../../test/fixtures/package-versions.mjs'

export async function checkSystemSettings(ui, session, directory, evidence, { importFixture = true } = {}) {
  const { page, panel, activate, button, selection, waitForSkin } = ui
  const composition = page.locator('[data-composer-input]:visible')
  const main = page.locator('[data-dsh-skin-appearance]')
  const preview = page.locator('[data-dsh-skin-chat-preview]')
  const launcher = page.getByRole('button', { name: 'Appearance Center', exact: true })
  const mode = panel.getByRole('combobox', { name: 'Effects in this window' })
  const windowQuality = panel.getByRole('combobox', { name: 'Effect quality in this window' })
  await session.resize(1280, 820)
  await ui.open()
  evidence.settingsWidth = []
  for (const width of [1280, 760]) {
    await session.resize(width === 760 ? 761 : width, 820)
    await page.waitForFunction(width => Math.abs(innerWidth - width) <= 2 && innerWidth >= 760, width)
    const geometry = await panel.evaluate(node => {
      const dialog = node.closest('[role="dialog"]')
      const hostWidth = Math.round(dialog.getBoundingClientRect().width)
      return { viewport: innerWidth, dialog: hostWidth, panel: node.clientWidth, content: node.scrollWidth }
    })
    assert(geometry.dialog <= Math.min(geometry.viewport, 1000))
    assert.equal(geometry.panel, geometry.content)
    evidence.settingsWidth.push(geometry)
    await page.screenshot({ path: join(directory, `system-settings-${width}.png`), scale: 'css' })
  }
  assert.deepEqual(await panel.locator('h3').allTextContents(), ['Window effects', 'Emergency recovery', 'Diagnostics'])
  assert.equal(await panel.locator('[role="tab"], [data-skin-card], input[type="file"], [data-skin-effects]').count(), 0)
  await activate(button(panel, 'Check Host'))
  await panel.getByRole('status').filter({ hasText: /Host engine v\d/ }).waitFor()
  await ui.switchLanguage('zh')
  await ui.openSkinSection()
  assert.deepEqual(await panel.locator('h3').allTextContents(), ['窗口效果', '紧急恢复', '诊断'])
  await ui.switchLanguage('en')
  await ui.openSkinSection()
  await ui.close()
  await session.resize(1280, 820)
  await composition.waitFor()
  const before = await selection()

  await activate(launcher)
  await main.getByRole('tab', { name: 'Skin gallery' }).waitFor()
  await activate(main.locator(`[data-skin-card="${deepOcean.id}"]`))
  await activate(button(main, 'Adjust effects'))
  const quality = main.getByRole('combobox', { name: 'Skin effect quality' })
  assert.equal(await main.getByRole('combobox', { name: 'Effects in this window' }).count(), 0)
  await quality.selectOption('high')
  if (importFixture) {
    await activate(main.getByRole('tab', { name: 'Skin management' }))
    const [archive] = await packageVersionPair()
    await main.getByLabel('Import .dshskin.zip', { exact: true }).setInputFiles({
      name: 'sys-01.dshskin.zip', mimeType: 'application/zip', buffer: archive,
    })
    await main.locator(`[data-package-id="${versionedSkin.id}"]`).waitFor()
    await main.getByRole('status').filter({ hasText: 'Skin installed.' }).waitFor()
    await activate(main.getByRole('tab', { name: 'Effects & performance' }))
    await main.getByRole('combobox', { name: 'Skin to edit' }).selectOption(deepOcean.id)
  }
  assert.equal(await quality.inputValue(), 'high')
  await activate(button(main, 'Preview in chat'))
  await preview.getByRole('button', { name: 'Apply', exact: true }).waitFor()
  await waitForSkin(deepOcean.id)

  await ui.open()
  await ui.close()
  await preview.getByRole('button', { name: 'Apply', exact: true }).waitFor()
  assert.deepEqual(await selection(), before)
  await ui.open()
  await activate(button(panel, 'Cancel preview'))
  await waitForSkin(before.skinId)
  await preview.waitFor({ state: 'detached' })
  assert.deepEqual(await selection(), before)
  await ui.close()

  await activate(launcher)
  assert.equal(await quality.inputValue(), 'high')
  await activate(button(main, 'Apply'))
  await main.locator(`[data-saved-skin="${deepOcean.id}"]`).waitFor()
  const saved = await selection()
  assert.equal(saved.skinId, deepOcean.id)
  assert.equal(saved.preferences[deepOcean.id].quality, 'high')
  await activate(button(main, 'Back to chat'))
  await waitForSkin(deepOcean.id)
  await ui.open()
  await windowQuality.selectOption('low')
  await panel.locator('[data-dsh-skin-effective-quality]').filter({ hasText: /^low$/ }).waitFor()
  await mode.selectOption('off')
  await panel.getByText(/saved skin and its colors are unchanged/).waitFor()
  assert(await windowQuality.isDisabled())
  await waitForSkin(deepOcean.id)
  assert.deepEqual(await selection(), saved)
  await mode.selectOption('dynamic')
  const restore = button(panel, 'Restore Default')
  await activate(restore)
  await activate(button(panel, 'Keep current selection'))
  assert.deepEqual(await selection(), saved)
  await activate(restore)
  await activate(button(panel, 'Confirm restore'))
  await panel.getByRole('status').filter({ hasText: 'Default appearance restored.' }).waitFor()
  await waitForSkin(null)
  const restored = await selection()
  assert.equal(restored.skinId, null)
  assert.deepEqual(restored.preferences, saved.preferences)
  await ui.close()
  await composition.waitFor()
  evidence.checks = {
    englishAndChinese: true, nativeWidth: true, hostDiagnostics: true, windowModeAndQuality: true,
    settingsClosePreservesPreview: true, emergencyCancel: true, confirmedRestore: true,
    skinPreferencesKept: true, appearancePages: true, ...(importFixture && { appearanceZipImport: true }), draftSurvivesNavigation: true,
  }
}
