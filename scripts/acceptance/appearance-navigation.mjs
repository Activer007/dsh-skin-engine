import assert from 'node:assert/strict'
import { appendFile } from 'node:fs/promises'
import { join } from 'node:path'
import { deepOcean } from './browser.mjs'
import { packageVersionPair, versionedSkin } from '../../test/fixtures/package-versions.mjs'

export async function checkAppearanceNavigation(ui, session, profileDir, directory, evidence) {
  const { page, panel, activate, selection } = ui
  const main = page.locator('[data-dsh-skin-appearance]')
  const launcher = name => page.getByRole('navigation', { name: /^(Global panels|全局面板)$/ }).getByRole('button', { name, exact: true })
  const english = launcher('Appearance Center')
  const chinese = launcher('外观中心')
  const composer = page.locator('[data-composer-input]:visible')
  await ui.close()
  await session.resize(1280, 820)
  await activate(page.getByRole('treeitem', { name: /Skin Engine acceptance history|未命名|Untitled/ }))
  const reply = page.getByText('Fixture response.', { exact: true })
  await reply.waitFor()
  const before = await selection()
  await english.waitFor()
  assert.equal(await english.count(), 1)
  await activate(english)
  await main.getByRole('heading', { name: 'Appearance Center' }).waitFor()
  for (const name of ['Skin gallery', 'Effects & performance', 'Skin management']) {
    await main.getByRole('tab', { name, exact: true }).waitFor()
  }
  assert.equal(await main.getByRole('button', { name: 'Preview', exact: true }).count(), 0)
  await activate(main.locator(`[data-skin-card="${deepOcean.id}"]`))
  await activate(main.getByRole('button', { name: 'Adjust effects', exact: true }))
  const quality = () => main.getByRole('combobox', { name: /^(Skin effect quality|皮肤效果质量)$/ })
  await quality().selectOption('high')
  assert.deepEqual(await selection(), before)
  await main.getByRole('tab', { name: 'Skin gallery', exact: true }).press('Enter')
  await main.getByRole('searchbox', { name: 'Search skins' }).fill('Deep')
  assert(await main.getByText(/Preview images are static/).isVisible())
  await page.screenshot({ path: join(directory, 'appearance-en-1280.png'), scale: 'css' })
  await main.getByRole('button', { name: 'Back to chat' }).press('Enter')
  await main.waitFor({ state: 'hidden' })
  await reply.waitFor()
  await composer.waitFor()
  assert.deepEqual(await selection(), before)

  await activate(english)
  await main.waitFor()
  await activate(launcher('Plugins'))
  await main.waitFor({ state: 'hidden' })
  await activate(english)
  await main.waitFor()
  assert.equal(await main.getByRole('searchbox', { name: 'Search skins' }).inputValue(), 'Deep')
  await activate(main.getByRole('button', { name: 'Adjust effects', exact: true }))
  assert.equal(await quality().inputValue(), 'high')
  await ui.open()
  for (const name of ['Skin gallery', 'Effects & performance', 'Skin management']) await ui.pageTab(name).waitFor()
  await ui.choose(deepOcean)
  assert(await ui.button(ui.detail(deepOcean), 'Preview').isDisabled())
  await activate(ui.button(ui.detail(deepOcean), 'Adjust effects'))
  await panel.getByRole('combobox', { name: 'Skin effect quality' }).selectOption('low')
  await ui.switchLanguage('zh')
  await ui.openSkinSection()
  await panel.getByRole('tab', { name: '皮肤库' }).waitFor()
  await ui.close()
  await chinese.waitFor()
  assert.equal(await chinese.count(), 1)
  assert.equal(await english.count(), 0)
  await main.getByRole('heading', { name: '外观中心' }).waitFor()
  assert.equal(await quality().inputValue(), 'high')
  assert.deepEqual(await selection(), before)
  assert.equal(await main.getByRole('button', { name: '预览', exact: true }).count(), 0)
  await session.resize(760, 820)
  await page.waitForFunction(() => innerWidth === 760 && innerHeight === 820)
  evidence.narrow = await main.evaluate(node => ({ viewport: [innerWidth, innerHeight], width: node.clientWidth, scroll: node.scrollWidth }))
  assert.equal(evidence.narrow.width, evidence.narrow.scroll)
  await page.screenshot({ path: join(directory, 'appearance-zh-760.png'), scale: 'css' })
  await main.getByRole('button', { name: '返回聊天' }).press('Space')
  await reply.waitFor()

  await session.resize(1280, 820)
  await activate(chinese)
  await ui.open()
  await ui.switchLanguage('en')
  await ui.openSkinSection()
  await ui.close()
  await english.waitFor()
  const bar = page.locator('[data-dsh-skin-chat-preview]')
  async function startPreview() {
    await main.getByRole('button', { name: 'Preview in chat', exact: true }).press('Enter')
    await main.waitFor({ state: 'hidden' })
    await composer.waitFor()
    await ui.waitForSkin(deepOcean.id)
    await bar.getByRole('button', { name: 'Apply', exact: true }).waitFor()
    assert.deepEqual(await selection(), before)
  }
  await startPreview()
  await page.screenshot({ path: join(directory, 'chat-preview-1280.png'), scale: 'css' })
  await bar.getByRole('button', { name: 'Cancel preview' }).press('Enter')
  await bar.waitFor({ state: 'hidden' })
  await ui.waitForSkin(before.skinId)
  await activate(english)
  await startPreview()
  await ui.open()
  await ui.choose(deepOcean)
  await activate(ui.button(ui.detail(deepOcean), 'Preview'))
  await bar.waitFor({ state: 'detached' })
  await ui.waitForSkin(deepOcean.id)
  await ui.close()
  await ui.waitForSkin(before.skinId)
  assert.deepEqual(await selection(), before)
  await activate(english)
  await startPreview()
  await activate(launcher('Plugins'))
  await bar.waitFor({ state: 'hidden' })
  await ui.waitForSkin(before.skinId)
  await activate(english)
  await startPreview()
  await page.evaluate(() => document.body.setAttribute('data-we-wallpaper', 'nav-05-acceptance'))
  try {
    await ui.waitForSkin(null)
    await bar.getByText('Wallpaper Engine owns the backdrop.').waitFor()
  } finally {
    await page.evaluate(() => document.body.removeAttribute('data-we-wallpaper'))
  }
  await bar.getByRole('button', { name: 'Dismiss' }).press('Enter')
  await bar.waitFor({ state: 'hidden' })
  await activate(english)
  await startPreview()
  const began = performance.now()
  await bar.waitFor({ state: 'hidden', timeout: 36_000 })
  const expiryMs = Math.round(performance.now() - began)
  assert(expiryMs >= 28_000)
  await ui.waitForSkin(before.skinId)
  await activate(english)
  await startPreview()
  await bar.getByRole('button', { name: 'Apply', exact: true }).press('Enter')
  await bar.waitFor({ state: 'hidden' })
  assert.equal((await selection()).preferences[deepOcean.id].quality, 'high')
  await ui.waitForSkin(deepOcean.id)
  evidence.chatPreview = { cancel: true, legacyPreviewTakesOver: true, navigationCancels: true, conflictReported: true, expiryMs, apply: true }
  await activate(english)
  await activate(main.getByRole('button', { name: 'Restore Default', exact: true }))
  await main.locator('[data-saved-skin=""]').waitFor()
  await checkMainPackageNavigation(ui, main, english, evidence)
  evidence.drafts = { mainAcrossNavigation: true, settingsCloseIsolated: true, languageRetained: true, unappliedSavedUnchanged: true, explicitApplySaved: true }
  await main.waitFor()
  await appendFile(join(profileDir, 'cordis.patch.yml'), '\n- id: dsh-skin-engine\n  disabled: true\n')
  await main.waitFor({ state: 'detached' })
  await english.waitFor({ state: 'detached' })
  await reply.waitFor()
  await composer.waitFor()
  await page.screenshot({ path: join(directory, 'chat-after-disable.png'), scale: 'css' })
  evidence.navigation = { english: true, chinese: true, otherPanel: true, backToSameSession: true, disabledWhileSelected: true }
}

/** The same application-level operation continues while its initiating panel is absent. */
export async function checkMainPackageNavigation(ui, main, launcher, evidence, exportPackage) {
  const { page, activate } = ui
  const [first, update] = await packageVersionPair()
  await activate(main.getByRole('tab', { name: 'Skin management', exact: true }))
  const file = { name: 'appearance-nav.dshskin.zip', mimeType: 'application/zip', buffer: first }
  const importer = main.getByLabel('Import .dshskin.zip', { exact: true })
  async function beginHeldUpload() {
    await page.evaluate(() => {
      const original = window.fetch
      let release
      const gate = new Promise(resolve => { release = resolve })
      const state = { appends: 0, release, clean() { release(); window.fetch = original; delete window.__appearanceUpload } }
      window.__appearanceUpload = state
      window.fetch = async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input, document.baseURI)
        if (url.pathname.endsWith('/packages/import') && url.searchParams.get('op') === 'append') {
          state.appends++
          await gate
        }
        return original(input, init)
      }
    })
    await importer.setInputFiles(file)
    await page.waitForFunction(() => window.__appearanceUpload.appends === 1)
  }

  async function navigateDuringUpload() {
    await activate(main.getByRole('button', { name: 'Back to chat', exact: true }))
    await main.waitFor({ state: 'hidden' })
    await activate(launcher)
    await main.waitFor()
    assert(await importer.isDisabled())
    await main.getByRole('progressbar').waitFor()
  }

  const release = () => page.evaluate(() => window.__appearanceUpload.release())
  const clean = () => page.evaluate(() => window.__appearanceUpload?.clean())
  try {
    await beginHeldUpload()
    await navigateDuringUpload()
    await activate(main.getByRole('button', { name: 'Cancel upload', exact: true }))
    await release()
    await main.getByRole('status').filter({ hasText: 'Upload cancelled. Host staging cleared.' }).waitFor()
    assert.equal(await main.locator('[data-package-id="' + versionedSkin.id + '"]').count(), 0)
  } finally { await clean() }
  try {
    await beginHeldUpload()
    await navigateDuringUpload()
    await release()
    await main.getByRole('status').filter({ hasText: 'Skin installed.' }).waitFor()
  } finally { await clean() }
  const actions = main.locator(`[data-managed-package="${versionedSkin.id}"]`)
  await actions.waitFor()
  await actions.getByLabel('Update from .dshskin.zip').setInputFiles({
    name: 'appearance-nav-update.dshskin.zip', mimeType: 'application/zip', buffer: update,
  })
  await main.getByRole('status').filter({ hasText: 'Skin updated to v1.1.0.' }).waitFor()
  // Keep the existing confirmations; do not bypass the package lifecycle UI.
  await activate(actions.getByRole('button', { name: /Roll back/, exact: false }))
  await activate(actions.getByRole('button', { name: 'Confirm rollback', exact: true }))
  await main.getByRole('status').filter({ hasText: /rolled back/ }).waitFor()
  if (exportPackage) evidence.export = await exportPackage(actions)
  await activate(actions.getByRole('button', { name: 'Uninstall…', exact: true }))
  await activate(actions.getByRole('button', { name: 'Confirm uninstall', exact: true }))
  await main.getByRole('status').filter({ hasText: 'Skin uninstalled.' }).waitFor()
  assert.equal(await main.locator(`[data-package-id="${versionedSkin.id}"]`).count(), 0)
  evidence.packages = { importSurvivesNavigation: true, cancelReadback: true, duplicateWriteDisabled: true, update: true, rollback: true, uninstall: true }
}
