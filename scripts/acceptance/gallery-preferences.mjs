import assert from 'node:assert/strict'
import { join } from 'node:path'
import { deepOcean } from './browser.mjs'
import { seedCatalogue } from './catalogue.mjs'

/** Run against an isolated real host; not a substitute for NAV06's full matrix. */
export async function checkGalleryPreferences(ui, session, directory, evidence, profileDir) {
  const { page, activate, selection } = ui
  const key = 'dsh-skin-engine.gallery.v1'
  const main = page.locator('[data-dsh-skin-appearance]')
  const launcher = () => page.getByRole('navigation', { name: /^(Global panels|全局面板)$/ })
    .getByRole('button', { name: /^(Appearance Center|外观中心)$/ })
  const read = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), key)
  await session.resize(1280, 820)
  await activate(launcher())
  const before = await selection()
  const star = main.locator(`[data-skin-favorite="${deepOcean.id}"]`)
  assert.equal(await star.getAttribute('aria-pressed'), 'false')
  await star.press('Enter')
  assert.equal(await star.getAttribute('aria-pressed'), 'true')
  await main.getByRole('checkbox', { name: 'Favorites only', exact: true }).check()
  assert.equal(await main.locator('[data-skin-card]').count(), 1)
  await main.getByRole('combobox', { name: 'Sort', exact: true }).selectOption('name')
  assert.deepEqual(await selection(), before)
  await main.getByRole('button', { name: 'Back to chat', exact: true }).press('Enter')
  await activate(launcher())
  assert.equal(await main.getByRole('combobox', { name: 'Sort', exact: true }).inputValue(), 'name')
  assert.equal(await main.getByRole('checkbox', { name: 'Favorites only' }).isChecked(), true)
  // Removing the focused result from a filtered list must leave keyboard focus usable.
  await star.press('Space')
  assert.equal(await main.locator('[data-skin-card]').count(), 0)
  assert(await main.getByRole('searchbox').evaluate(node => document.activeElement === node))
  await main.getByRole('button', { name: 'Clear filters', exact: true }).click()
  await star.click()
  await main.locator(`[data-skin-card="${deepOcean.id}"]`).click()
  await main.getByRole('button', { name: 'Preview in chat', exact: true }).click()
  const bar = page.locator('[data-dsh-skin-chat-preview]')
  await bar.waitFor()
  await ui.waitForSkin(deepOcean.id)
  assert.equal((await read()).recent.length, 0)
  await bar.getByRole('button', { name: 'Cancel preview', exact: true }).click()
  await activate(launcher())
  await main.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.waitForFunction(({ key, id }) => JSON.parse(localStorage.getItem(key) ?? 'null')?.recent[0] === id,
    { key, id: deepOcean.id })
  const saved = await selection()
  await main.getByRole('combobox', { name: 'Sort', exact: true }).selectOption('recent')
  assert.equal(await main.locator('[data-skin-card]').first().getAttribute('data-skin-card'), deepOcean.id)
  await page.screenshot({ path: join(directory, 'gallery-preferences-en.png'), scale: 'css' })
  await page.reload()
  await ui.dismissOnboarding()
  await activate(launcher())
  await main.waitFor()
  assert.equal(await star.getAttribute('aria-pressed'), 'true')
  assert.equal(await main.getByRole('combobox', { name: 'Sort', exact: true }).inputValue(), 'recent')
  assert.deepEqual(await selection(), saved)
  await main.getByRole('button', { name: 'Clear recent history', exact: true }).click()
  assert.deepEqual((await read()).recent, [])
  assert.equal(await star.getAttribute('aria-pressed'), 'true')
  const scale = []
  for (const count of [10, 100]) {
    await seedCatalogue(profileDir, count === 10 ? 0 : 10, count)
    await activate(main.getByRole('tab', { name: 'Skin management' }))
    await ui.expand(main.getByText('Catalogue maintenance', { exact: true }))
    await activate(main.getByRole('button', { name: 'Reload skins' }))
    await activate(main.getByRole('tab', { name: 'Skin gallery' }))
    await main.getByRole('combobox', { name: 'Source', exact: true }).selectOption('local')
    const sort = main.getByRole('combobox', { name: 'Sort', exact: true })
    await sort.selectOption('name')
    const cards = main.locator('[data-skin-card^="fixture.scale-"]')
    await cards.nth(count - 1).waitFor()
    const orderedIds = await cards.evaluateAll(nodes => nodes.map(node => node.dataset.skinCard))
    assert.deepEqual(orderedIds, Array.from({ length: count }, (_, i) => 'fixture.scale-' + String(i).padStart(3, '0')))
    const lastImage = cards.last().locator('img')
    const loadedBeforeScroll = await lastImage.evaluate(img => img.complete && img.naturalWidth > 0)
    if (count === 100) assert(!loadedBeforeScroll, 'The last thumbnail should still be deferred')
    await cards.last().scrollIntoViewIfNeeded()
    await page.waitForFunction(id => {
      const image = document.querySelector(`[data-skin-card="${id}"] img`)
      return image?.complete && image.naturalWidth > 0
    }, orderedIds.at(-1))
    scale.push({ count, loadedBeforeScroll, loadedAfterScroll: true })
  }
  assert.deepEqual(await selection(), saved)
  await ui.open()
  await ui.switchLanguage('zh')
  await ui.close()
  if (!await main.isVisible()) await activate(launcher())
  await session.resize(762, 820)
  await page.waitForFunction(() => innerWidth >= 760 && innerWidth <= 764)
  await main.getByRole('combobox', { name: '排序', exact: true }).waitFor()
  const geometry = await main.evaluate(node => ({ width: node.clientWidth, scroll: node.scrollWidth }))
  assert.equal(geometry.width, geometry.scroll)
  await page.screenshot({ path: join(directory, 'gallery-preferences-zh-760.png'), scale: 'css' })
  evidence.galleryPreferences = { favoriteKeyboard: true, filterFocus: true, hostUnchangedByUI: true,
    previewExcluded: true, successfulApplyRecorded: true, reloadPersistence: true, clearHistoryPreservesFavorite: true, geometry, scale }
}
