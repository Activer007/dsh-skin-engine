import assert from 'node:assert/strict'
import { join } from 'node:path'
import { packageVersionPair, versionedSkin } from '../../test/fixtures/package-versions.mjs'
import { deepOcean } from './browser.mjs'
import { packagePanel } from './packages.mjs'

export async function checkSettingsState(ui, directory, evidence, foreground) {
  const { page, panel, detail, activate, button, choose, selection, waitForSkin } = ui
  const aurora = { id: 'com.dsh.skin.aurora', name: 'Aurora' }
  const quality = skin => detail(skin).getByRole('combobox', { name: 'Skin effect quality' })
  await ui.open()
  const before = await selection()
  await choose(deepOcean)
  await quality(deepOcean).selectOption('low')
  await choose(aurora)
  await quality(aurora).selectOption('high')
  await choose(deepOcean)
  const search = panel.getByRole('searchbox', { name: 'Search skins' })
  await search.fill('no-such-skin')
  await panel.getByText('No matching skins.', { exact: true }).waitFor()
  assert.equal(await quality(deepOcean).inputValue(), 'low')
  await activate(button(panel, 'Clear filters'))
  assert.equal(await search.inputValue(), '')
  assert.deepEqual(await selection(), before)
  await activate(button(detail(deepOcean), 'Preview'))
  await waitForSkin(deepOcean.id)
  await ui.switchLanguage('zh')
  await ui.openSkinSection()
  await panel.getByRole('heading', { name: '皮肤引擎', exact: true }).waitFor()
  assert.equal(await panel.getByRole('combobox', { name: '皮肤效果质量' }).inputValue(), 'low')
  await waitForSkin(deepOcean.id)
  await panel.getByRole('button', { name: '取消预览' }).waitFor()
  await ui.switchLanguage('en')
  await ui.openSkinSection()
  await panel.getByText('Previewing · Deep Ocean', { exact: true }).waitFor()
  await activate(button(panel, 'Cancel preview'))
  await waitForSkin(before.skinId)
  await choose(aurora)
  assert.equal(await quality(aurora).inputValue(), 'high')
  await choose(deepOcean)
  assert.equal(await quality(deepOcean).inputValue(), 'low')
  evidence.selectionAndDrafts = { filters: true, twoSkinDrafts: true, nativeLanguageChange: true, previewRestored: true }

  const packages = packagePanel(ui)
  const [first, update] = await packageVersionPair()
  await packages.install('settings-state.dshskin.zip', first)
  await choose(versionedSkin)
  await quality(versionedSkin).selectOption('high')
  const dust = detail(versionedSkin).getByRole('slider', { name: 'Floating Dust strength' })
  await dust.fill('50')
  const actions = detail(versionedSkin).locator('details').filter({ has: page.locator('summary').filter({ hasText: /^Package actions$/ }) })
  await ui.expand(actions.locator('summary'))
  await actions.getByLabel('Update from .dshskin.zip').setInputFiles({
    name: 'settings-state-update.dshskin.zip', mimeType: 'application/zip', buffer: update,
  })
  await panel.getByText('Skin updated to v1.1.0.', { exact: true }).waitFor()
  assert(await button(detail(versionedSkin), 'Apply').isDisabled())
  assert.equal(await quality(versionedSkin).inputValue(), 'high')
  await activate(button(detail(versionedSkin), 'Keep compatible draft settings for the new package'))
  await ui.apply(versionedSkin)
  const updated = await selection()
  assert.equal(updated.preferences[versionedSkin.id].quality, 'high')
  assert.equal(updated.preferences[versionedSkin.id].effects?.['particles.dust'], undefined)
  evidence.packageRevision = { staleBlocked: true, compatibleDraftSaved: true }

  await choose(deepOcean)
  await button(detail(deepOcean), 'Keep draft and use current profile revision').waitFor()
  assert(await button(detail(deepOcean), 'Apply').isDisabled())
  await activate(button(detail(deepOcean), 'Keep draft and use current profile revision'))
  const target = (await packages.getCatalogue()).skins.find(skin => skin.manifest.id === aurora.id)
  const concurrent = await page.evaluate(async payload => {
    const response = await fetch(new URL('api/dsh-skin-engine/selection/apply', document.baseURI), {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
    })
    if (!response.ok) throw Error(`Concurrent save returned ${response.status}`)
    return response.json()
  }, { skinId: aurora.id, packageRevision: target.revision, expectedRevision: updated.revision })
  await activate(button(detail(deepOcean), 'Apply'))
  await panel.getByRole('status').filter({ hasText: /^Another window saved a different selection or preferences\.$/ }).waitFor()
  assert.deepEqual(await selection(), concurrent)
  assert.equal(await quality(deepOcean).inputValue(), 'low')
  assert(await button(detail(deepOcean), 'Apply').isDisabled())
  await foreground?.()
  evidence.widths = await panel.evaluate(node => ({ viewport: [innerWidth, innerHeight], content: node.clientWidth }))
  await page.screenshot({ path: join(directory, 'settings-conflict.png'), scale: 'css' })
  await activate(button(detail(deepOcean), 'Keep draft and use current profile revision'))
  await ui.apply(deepOcean)
  assert.equal((await selection()).preferences[deepOcean.id].quality, 'low')
  evidence.profileRevision = { conflictReadBack: true, preservedDraft: true, recovered: true }

  await quality(deepOcean).selectOption('high')
  await activate(button(detail(deepOcean), 'Preview'))
  await button(panel, 'Cancel preview').waitFor()
  await ui.close()
  await ui.open()
  await choose(deepOcean)
  assert.equal(await quality(deepOcean).inputValue(), 'low')
  assert.equal(await button(panel, 'Cancel preview').count(), 0)
  await ui.apply(null)
  evidence.settingsClosed = { discardedDraft: true, previewCancelled: true, defaultRestored: true }
}
