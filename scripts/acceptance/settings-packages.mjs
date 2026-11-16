import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { packageVersionPair, versionedSkin as skin } from '../../test/fixtures/package-versions.mjs'
import { deepOcean, openSkinTechnical } from './browser.mjs'
import { packagePanel, zipJson } from './packages.mjs'

export async function checkSettingsPackages(ui, session, directory, evidence) {
  const { page, panel, button, activate, selection, waitForSkin } = ui
  const packages = packagePanel(ui)
  const status = panel.locator('.dsh-skin-package-status').getByRole('status')
  const [first, next] = await packageVersionPair()
  const file = { name: 'settings-packages-update.dshskin.zip', mimeType: 'application/zip', buffer: next }
  await session.resize(1280, 820)
  await ui.open()
  await ui.choose(deepOcean)
  const detail = ui.detail(deepOcean)
  assert.equal(await detail.getByRole('button', { name: 'Export ZIP' }).count(), 0)
  await openSkinTechnical(detail)
  await activate(button(detail, 'Manage this skin'))
  const builtIn = panel.locator('[data-managed-package="' + deepOcean.id + '"]')
  await button(builtIn, 'Export ZIP').waitFor()
  assert.equal(await builtIn.getByRole('button', { name: 'Uninstall…' }).count(), 0)
  const diagnostics = panel.getByText('Maintenance and diagnostics', { exact: true })
  assert.equal(await diagnostics.evaluate(node => node.parentElement.open), false)
  await activate(diagnostics)
  await activate(button(panel, 'Check Host'))
  await panel.getByRole('status').filter({ hasText: 'Host engine v' }).waitFor()
  await activate(diagnostics)

  await packages.install('settings-packages.dshskin.zip', first)
  await ui.apply(skin)
  const saved = await selection()
  const old = (await packages.getCatalogue()).skins.find(item => item.manifest.id === skin.id)
  assert.equal(old.manifest.version, '1.0.0')
  const actions = await packages.openActions(skin)
  const desktop = new URL(page.url()).protocol === 'dsh-app:'
  const download = desktop ? undefined : page.waitForEvent('download')
  await activate(button(actions, 'Export ZIP'))
  const filename = skin.id + '.dshskin.zip'
  let archive
  if (desktop) {
    await status.filter({ hasText: 'Skin archive saved to Downloads.' }).waitFor()
    archive = await readFile(join(directory, 'downloads', filename))
  } else {
    const exported = await download
    assert.equal(exported.suggestedFilename(), filename)
    archive = await readFile(await exported.path())
    await status.filter({ hasText: 'Skin archive prepared.' }).waitFor()
  }
  const manifest = await zipJson(archive)
  assert.deepEqual([manifest.id, manifest.version], [skin.id, '1.0.0'])

  async function gateAppend(failCancel) {
    await page.evaluate(fail => {
      const original = window.fetch
      let release
      const gate = new Promise(resolve => { release = resolve })
      const state = { appends: 0, release, clean() { release(); window.fetch = original; delete window.__skinPackageGate } }
      window.__skinPackageGate = state
      window.fetch = async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input, document.baseURI)
        if (url.pathname !== '/api/dsh-skin-engine/packages/update') return original(input, init)
        if (url.searchParams.get('op') === 'append') {
          state.appends++
          await gate
        }
        if (fail && url.searchParams.get('op') === 'cancel') {
          await original(input, init)
          throw new Error('Isolated fixture dropped the cancellation acknowledgement')
        }
        return original(input, init)
      }
    }, failCancel)
  }

  const upload = actions.getByLabel('Update from .dshskin.zip')
  async function holdUpload(failCancel) {
    await gateAppend(failCancel)
    await upload.setInputFiles(file)
    await page.waitForFunction(() => window.__skinPackageGate.appends === 1)
    await panel.getByRole('progressbar', { name: 'ZIP update progress' }).waitFor()
    assert(await upload.isDisabled())
    await activate(ui.pageTab('Effects & performance'))
    assert(await panel.getByText(file.name, { exact: true }).isVisible())
    assert.equal(await page.evaluate(() => window.__skinPackageGate.appends), 1)
  }
  const clearGate = () => page.evaluate(() => window.__skinPackageGate?.clean())
  try {
    await holdUpload(true)
    await activate(button(panel, 'Cancel update'))
    await page.evaluate(() => window.__skinPackageGate.release())
    await status.filter({ hasText: 'Host cleanup could not be confirmed.' }).waitFor()
    assert.equal((await packages.getCatalogue()).skins.find(item => item.manifest.id === skin.id).revision, old.revision)
    assert.deepEqual(await selection(), saved)
  } finally { await clearGate() }

  await packages.showManagement()
  try {
    await holdUpload(false)
    await page.evaluate(() => window.__skinPackageGate.release())
    await status.filter({ hasText: 'Skin updated to v1.1.0.' }).waitFor()
    assert.equal(await ui.pageTab('Effects & performance').getAttribute('aria-selected'), 'true')
  } finally { await clearGate() }
  assert.deepEqual(await selection(), saved)
  const updated = (await packages.getCatalogue()).skins.find(item => item.manifest.id === skin.id)
  assert.notEqual(updated.revision, old.revision)
  assert.equal(updated.previousVersion, '1.0.0')
  const current = await packages.openActions(skin)
  const rollback = button(current, 'Roll back to v1.0.0…')
  await activate(rollback)
  const keep = button(current, 'Keep current version')
  await page.waitForFunction(() => document.activeElement?.textContent === 'Keep current version')
  await activate(keep)
  await page.waitForFunction(() => document.activeElement?.textContent === 'Roll back to v1.0.0…')
  await activate(rollback)
  await activate(button(current, 'Confirm rollback'))
  await status.filter({ hasText: 'Skin rolled back to v1.0.0.' }).waitFor()
  const restored = (await packages.getCatalogue()).skins.find(item => item.manifest.id === skin.id)
  assert.equal(restored.manifest.version, '1.0.0')
  assert.notEqual(restored.revision, updated.revision)
  assert.deepEqual(await selection(), saved)
  const dimensions = () => panel.evaluate(node => ({ viewport: [innerWidth, innerHeight], content: node.clientWidth, scroll: node.scrollWidth }))
  evidence.wide = await dimensions()
  await page.screenshot({ path: join(directory, 'settings-packages-1280.png'), scale: 'css' })
  await session.resize(760, 820)
  evidence.narrow = await dimensions()
  assert.equal(evidence.narrow.content, evidence.narrow.scroll)
  await page.screenshot({ path: join(directory, 'settings-packages-760.png'), scale: 'css' })
  await packages.remove(skin)
  await waitForSkin(null)
  assert.equal((await selection()).skinId, null)
  evidence.lifecycle = { cancelledWithUncertainCleanup: true, singleRequest: true, continuedAcrossTabs: true,
    versions: ['1.0.0', '1.1.0', '1.0.0'], revisions: [old.revision, updated.revision, restored.revision],
    exportedSha256: createHash('sha256').update(archive).digest('hex'), defaultAfterUninstall: true }
}
