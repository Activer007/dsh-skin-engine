import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { deepOcean, resources } from './browser.mjs'
import { savePeerSelection } from './navigation-release.mjs'

const selectionPath = '/api/dsh-skin-engine/selection'
const applyPath = selectionPath + '/apply'
const aurora = 'com.dsh.skin.aurora'
const navigator = 'com.dsh.skin.night-navigator'
const mainPanel = page => page.locator('[data-dsh-skin-appearance]')
const launcher = page => page.getByRole('navigation', { name: 'Global panels' })
  .getByRole('button', { name: 'Appearance Center', exact: true })
const toolbar = page => page.locator('[data-dsh-skin-chat-preview]')
const reply = page => page.getByText('Fixture response.', { exact: true })
const pressEnabled = (page, control) => control.and(page.locator(':enabled')).press('Enter')

// Delay delivery of one real Host JSON body or decoded asset. Never replace its contents.
async function holdDelivery(page, target) {
  await page.evaluate(target => {
    const fetch = window.fetch
    const decode = HTMLImageElement.prototype.decode
    let release
    const barrier = new Promise(resolve => { release = resolve })
    const hold = {
      value: null, delivered: false,
      release,
      restore() { window.fetch = fetch; HTMLImageElement.prototype.decode = decode; release() },
    }
    async function delay(value, evidence) {
      hold.value = evidence
      await barrier
      hold.delivered = true
      return value
    }
    window.__navReliabilityHold = hold
    if (target.asset) {
      HTMLImageElement.prototype.decode = async function () {
        const url = this.src ? new URL(this.src) : null
        const value = await decode.call(this)
        if (url?.searchParams.get('id') === target.asset && !hold.value) {
          return delay(value, { asset: target.asset, width: this.naturalWidth })
        }
        return value
      }
      return
    }
    let matched = false
    window.fetch = async function (input, options) {
      const url = new URL(input instanceof Request ? input.url : input, document.baseURI)
      const shouldHold = url.pathname === target.path && !matched
      if (shouldHold) matched = true
      const response = await fetch.call(this, input, options)
      if (shouldHold && response.ok) {
        const json = response.json.bind(response)
        response.json = async () => {
          const body = await json()
          return delay(body, { status: response.status, skinId: body.skinId, revision: body.revision })
        }
      }
      return response
    }
  }, target)
  return {
    async observation() {
      await page.waitForFunction(() => window.__navReliabilityHold.value, null, { polling: 100 })
      return page.evaluate(() => window.__navReliabilityHold.value)
    },
    async deliver() {
      await page.evaluate(() => window.__navReliabilityHold.release())
      await page.waitForFunction(() => window.__navReliabilityHold.delivered, null, { polling: 100 })
    },
    restore: () => page.evaluate(() => {
      window.__navReliabilityHold?.restore()
      delete window.__navReliabilityHold
    }),
  }
}

async function openFromChat(ui) {
  await ui.activate(launcher(ui.page))
  const main = mainPanel(ui.page)
  await main.locator('[data-saved-skin]').waitFor()
  await main.getByRole('status').filter({ hasText: /^Loading…$/ }).waitFor({ state: 'hidden' })
}

async function reloadButton(ui) {
  const main = mainPanel(ui.page)
  await ui.activate(main.getByRole('tab', { name: 'Skin management' }))
  await ui.expand(main.getByText('Catalogue maintenance', { exact: true }))
  return ui.button(main, 'Reload skins')
}

async function checkRefreshOrdering(ui, reload, evidence) {
  const { page, selection } = ui
  const before = await selection()
  const main = mainPanel(page)
  const hold = await holdDelivery(page, { path: selectionPath })
  let writes = 0
  const record = request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === applyPath) writes++
  }
  page.on('request', record)
  try {
    await reload.press('Enter')
    const old = await hold.observation()
    assert.deepEqual(old, { status: 200, skinId: before.skinId, revision: before.revision })
    assert.equal(writes, 0)
    const newer = await savePeerSelection(page, deepOcean, before.revision)
    assert.equal(newer.revision, before.revision + 1)
    const updated = main.locator(`[data-saved-skin="${deepOcean.id}"]`)
    for (let count = 0; count < 3; count++) await reload.press('Enter')
    await updated.waitFor()
    await ui.activate(ui.button(main, 'Back to chat'))
    await reply(page).waitFor()
    await openFromChat(ui)
    await hold.deliver()
    assert.deepEqual(await selection(), newer)
    assert.equal(writes, 1, 'Only the fixture peer write is expected')
    assert(await updated.isVisible(), 'The delayed result must not replace the newer selection')
    assert.equal(await page.locator('html').getAttribute('data-dsh-skin-id'), deepOcean.id)
    evidence.refresh = { repeatedClicks: 3, held: old, retainedRevision: newer.revision, fixtureWrites: 1, refreshWrites: writes - 1 }
  } finally {
    page.off('request', record)
    await hold.restore()
  }
}

async function checkPreviewReplacement(ui, directory, evidence) {
  const { page, selection, waitForSkin } = ui
  const main = mainPanel(page)
  const before = await selection()
  const tab = main.getByRole('tab', { name: 'Skin gallery' })
  await tab.press('Enter')
  const gallery = main.getByRole('tabpanel', { name: 'Skin gallery' })
  const choose = id => gallery.locator(`[data-skin-card="${id}"]`).press('Enter')
  const preview = () => pressEnabled(page, ui.button(gallery, 'Preview in chat'))
  const hold = await holdDelivery(page, { asset: navigator })
  try {
    await choose(navigator)
    await preview()
    const asset = await hold.observation()
    assert(asset.width > 0)
    assert.equal(await ui.button(toolbar(page), 'Apply').count(), 0)
    await reply(page).waitFor()
    await ui.activate(page.getByRole('navigation', { name: 'Global panels' }).getByRole('button', { name: 'Plugins', exact: true }))
    await toolbar(page).waitFor({ state: 'detached' })
    await openFromChat(ui)
    await choose(aurora)
    await preview()
    await ui.button(toolbar(page), 'Apply').waitFor()
    await waitForSkin(aurora)
    await hold.deliver()
    assert.equal(await toolbar(page).count(), 1)
    assert.equal(await page.locator('html').getAttribute('data-dsh-skin-id'), aurora)
    await page.screenshot({ path: join(directory, 'preview-replacement.png'), scale: 'css' })
    const cancel = ui.button(toolbar(page), 'Cancel preview')
    await cancel.focus()
    assert(await cancel.evaluate(node => node === document.activeElement))
    await cancel.press('Enter')
    await toolbar(page).waitFor({ state: 'detached' })
    await waitForSkin(before.skinId)
    assert.deepEqual(await selection(), before)
    evidence.preview = { asset, replacement: aurora, toolbarCount: 1, keyboardCancel: true, selectionUnchanged: true }
  } finally {
    await hold.restore()
  }
}

async function disableDuringDelivery(ui, patch, original, hold, evidence, name, directory) {
  const { page } = ui
  evidence[name] = { held: await hold.observation() }
  await writeFile(patch, original + '\n- id: dsh-skin-engine\n  disabled: true\n')
  await launcher(page).waitFor({ state: 'detached' })
  await hold.deliver()
  await reply(page).waitFor()
  await page.locator('[data-composer-input]:visible').first().waitFor()
  for (const selector of ['[data-dsh-skin-appearance]', '[data-dsh-skin-chat-preview]', resources]) {
    assert.equal(await page.locator(selector).count(), 0)
  }
  assert.equal(await launcher(page).count(), 0)
  await page.screenshot({ path: join(directory, name + '-disabled.png'), scale: 'css' })
  evidence[name].cleanAfterDelivery = true
}

async function openFixtureChat(page) {
  await page.getByRole('treeitem', { name: /Skin Engine acceptance history|Untitled/ }).first().press('Enter')
  await reply(page).waitFor()
}

export async function checkLateNavigationRead(ui, profileDir, directory, evidence) {
  const { page } = ui
  const patch = join(profileDir, 'cordis.patch.yml')
  const original = await readFile(patch, 'utf8')
  await openFixtureChat(page)
  await openFromChat(ui)
  const reload = await reloadButton(ui)
  const readHold = await holdDelivery(page, { path: selectionPath })
  try {
    await reload.press('Enter')
    await disableDuringDelivery(ui, patch, original, readHold, evidence, 'read', directory)
  } finally {
    await writeFile(patch, original)
    await readHold.restore()
  }
}

export async function checkLateNavigationSave(ui, profileDir, directory, evidence) {
  const { page } = ui
  const main = mainPanel(page)
  const patch = join(profileDir, 'cordis.patch.yml')
  const original = await readFile(patch, 'utf8')
  await openFixtureChat(page)
  await openFromChat(ui)
  const before = await ui.selection()
  await main.getByRole('tab', { name: 'Skin gallery' }).press('Enter')
  const gallery = main.getByRole('tabpanel', { name: 'Skin gallery' })
  await gallery.locator(`[data-skin-card="${aurora}"]`).press('Enter')
  const saveHold = await holdDelivery(page, { path: applyPath })
  try {
    await pressEnabled(page, ui.button(gallery, 'Apply'))
    await disableDuringDelivery(ui, patch, original, saveHold, evidence, 'save', directory)
    assert.deepEqual(evidence.save.held, { status: 200, skinId: aurora, revision: before.revision + 1 })
    return evidence.save.held
  } finally {
    await writeFile(patch, original)
    await saveHold.restore()
  }
}

export async function checkLateNavigationRestart(ui, saved, evidence) {
  const actual = await ui.selection()
  assert.deepEqual([actual.skinId, actual.revision], [saved.skinId, saved.revision])
  evidence.restart = { skinId: actual.skinId, revision: actual.revision }
  await ui.waitForSkin(saved.skinId)
  await launcher(ui.page).waitFor()
  assert.equal(await launcher(ui.page).count(), 1)
  assert.equal(await toolbar(ui.page).count(), 0)
  Object.assign(evidence.restart, { rendered: true, singleEntry: true, noPreview: true })
}

export async function checkNavigationRaces(ui, directory, evidence) {
  await openFixtureChat(ui.page)
  await openFromChat(ui)
  await checkRefreshOrdering(ui, await reloadButton(ui), evidence)
  await checkPreviewReplacement(ui, directory, evidence)
}
