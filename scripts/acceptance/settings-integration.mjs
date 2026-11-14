import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { deepOcean, resources } from './browser.mjs'
import { zipJson } from './packages.mjs'
import { event, foreign, marker } from './token-probe.mjs'

const incompatible = { id: 'test.skin.incompatible', name: 'Incompatible acceptance skin' }
const unmanaged = { id: 'test.skin.unmanaged', name: 'Unmanaged acceptance skin' }

export async function holdInitialCatalogue(page) {
  await page.addInitScript(() => {
    const fetch = window.fetch
    let release
    const ready = new Promise(resolve => { release = resolve })
    const state = { requests: 0, release, stop() { window.fetch = fetch } }
    window.__skinCatalogueGate = state
    window.fetch = async (input, init) => {
      if (new URL(input instanceof Request ? input.url : input, document.baseURI).pathname !== '/api/dsh-skin-engine/skins') return fetch(input, init)
      state.requests++
      await ready
      return fetch(input, init)
    }
  })
}

export async function checkSettingsLoading({ page, panel, open, close }, directory) {
  await open()
  const gallery = panel.getByRole('region', { name: 'Skin gallery', exact: true })
  const placeholders = gallery.locator('[aria-busy="true"] > li')
  let evidence
  try {
    await gallery.getByText('Loading the skin catalogue…').waitFor()
    assert.equal(await placeholders.count(), 3)
    assert(await placeholders.first().evaluate(node => getComputedStyle(node).animationName === 'none'))
    assert(await gallery.getByRole('searchbox').isDisabled())
    assert(await gallery.getByRole('button', { name: 'Import ZIP' }).isDisabled())
    assert.equal(await panel.getByRole('button', { name: 'Apply', exact: true }).count(), 0)
    assert(await page.evaluate(() => window.__skinCatalogueGate.requests > 0))
    await page.screenshot({ path: join(directory, 'settings-loading.png'), scale: 'css' })
    evidence = { placeholders: 3, disabled: true }
  } finally { await page.evaluate(() => window.__skinCatalogueGate.release()) }
  if (new URL(page.url()).protocol === 'dsh-app:') {
    const management = panel.getByRole('tab', { name: 'Skin management' })
    await management.press('Enter')
    const summary = panel.locator('summary').filter({ hasText: /^Maintenance and diagnostics/ })
    await summary.press('Enter')
    await panel.getByRole('button', { name: 'Reload skins', exact: true }).press('Enter')
    await panel.getByRole('tab', { name: 'Skin gallery' }).press('Enter')
  }
  await gallery.locator('[data-skin-card]').first().waitFor()
  assert(await gallery.getByRole('searchbox').isEnabled())
  const count = () => page.evaluate(() => window.__skinCatalogueGate.requests)
  const before = await count()
  await panel.getByRole('tab', { name: 'Effects & performance' }).press('Enter')
  await panel.getByRole('tab', { name: 'Skin management' }).press('Enter')
  await panel.getByRole('tab', { name: 'Skin gallery' }).press('Enter')
  assert.equal(await count(), before)
  evidence.tabNavigationDoesNotReload = true
  await page.evaluate(() => window.__skinCatalogueGate.stop())
  await close()
  return evidence
}

export async function seedSettingsIntegration(profileDir) {
  for (const skin of [incompatible, unmanaged]) {
    const path = join(profileDir, 'skin-engine', 'packages', skin.id)
    await mkdir(path, { recursive: true })
    await writeFile(join(path, 'skin.json'), JSON.stringify({
      schema: 'dsh.skin/v1', ...skin, version: '1.0.0', engineApi: skin === incompatible ? '^99.0.0' : '^1.0.0',
      capabilities: ['tokens', 'css'], entry: { tokens: 'tokens.json', styles: 'theme.css', effects: 'effects.json' },
    }))
  }
}

export async function checkSettingsIntegration(ui, session, archive, directory, evidence) {
  const { page, panel, card, detail, button, activate, selection, waitForSkin } = ui
  await ui.close()
  await ui.open()
  await ui.mode('dynamic')
  await ui.appearance('dark')
  const sample = await zipJson(await readFile(archive))
  assert.equal(sample.colorScheme, 'both')
  await ui.choose(incompatible)
  const compatible = panel.getByRole('checkbox', { name: 'Compatible only' })
  assert(await button(detail(incompatible), 'Apply').isDisabled())
  await compatible.check()
  assert.equal(await card(incompatible).count(), 0)
  assert(await detail(incompatible).isVisible())
  await compatible.uncheck()
  await ui.choose(unmanaged)
  await activate(button(detail(unmanaged), 'Manage this skin'))
  const actions = panel.locator('[data-managed-package="' + unmanaged.id + '"]')
  assert.equal(await button(actions, 'Export ZIP').count(), 0)
  assert.equal(await button(actions, 'Uninstall…').count(), 0)
  assert(await actions.getByText('Local activation requires a validated installation.').isVisible())

  await ui.choose(sample)
  const image = detail(sample).getByRole('img')
  const thumb = card(sample).locator('img')
  async function breakImage(locator) {
    return locator.evaluate(async node => {
      const original = node.currentSrc || node.src
      node.loading = 'eager'
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('Image fallback did not load')), 5000)
        node.addEventListener('load', () => { clearTimeout(timer); resolve() }, { once: true })
        node.src = 'data:image/png;base64,AA=='
      })
      return { original, fallback: node.currentSrc, width: node.naturalWidth }
    })
  }
  const images = await Promise.all([breakImage(image), breakImage(thumb)])
  assert(images.every(item => item.width > 0 && item.original !== item.fallback))
  assert(await detail(sample).getByText(/^Skin package v/).isVisible())

  const diagnosticsTab = ui.pageTab('Skin management')
  await activate(diagnosticsTab)
  const summary = panel.locator('summary').filter({ hasText: /^Maintenance and diagnostics/ })
  await ui.expand(summary)
  await page.evaluate(() => {
    const original = window.fetch
    window.fetch = (input, init) => {
      const path = new URL(input instanceof Request ? input.url : input, document.baseURI).pathname
      if (path !== '/api/dsh-skin-engine/audit') return original(input, init)
      window.fetch = original
      return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }))
    }
  })
  const check = button(panel, 'Check Host')
  await activate(check)
  await panel.getByRole('status').filter({ hasText: /^Host unavailable\.$/ }).waitFor()
  await activate(check)
  await panel.getByRole('status').filter({ hasText: /^Host engine v/ }).waitFor()
  evidence.errorStates = { incompatibleFiltered: true, unmanagedReadOnly: true, imageFallback: images.map(({ width }) => width), hostTimeoutRetry: true }

  await ui.apply(deepOcean)
  const saved = await selection()
  await ui.choose(sample)
  await button(detail(sample), 'Preview').press('Enter')
  await waitForSkin(sample.id)
  const began = performance.now()
  await ui.pageTab('Effects & performance').press('Enter')
  await button(panel, 'Cancel preview').waitFor()
  assert.deepEqual(await selection(), saved)
  await page.waitForFunction(id => document.documentElement.getAttribute('data-dsh-skin-id') === id, deepOcean.id, { timeout: 36_000 })
  const expiryMs = Math.round(performance.now() - began)
  assert(expiryMs >= 28_500 && expiryMs <= 36_000)
  await button(panel, 'Cancel preview').waitFor({ state: 'hidden' })
  assert.deepEqual(await selection(), saved)
  evidence.preview = { expiryMs, retainedSavedRevision: saved.revision }

  await ui.showGallery()
  await card(sample).press('Enter')
  await button(detail(sample), 'Apply').press('Enter')
  await panel.locator('[data-saved-skin="' + sample.id + '"]').waitFor()
  await waitForSkin(sample.id)
  const applied = await selection()
  const art = page.locator('[data-dsh-skin-effect-layer="artwork"] > img')
  const readArt = () => art.evaluate(async node => { await node.decode(); return node.currentSrc })
  const dark = await readArt()
  await ui.appearance('light')
  await page.waitForFunction(dark => {
    const image = document.querySelector('[data-dsh-skin-effect-layer="artwork"] > img')
    return image && image.src !== dark
  }, dark)
  const light = await readArt()
  assert.notEqual(dark, light)
  assert.deepEqual(await selection(), applied)

  async function probe(action) {
    await page.evaluate(({ event, action }) => document.documentElement.dispatchEvent(new CustomEvent(event, { detail: action })), { event, action })
    await page.locator('html[' + marker + '="' + action + '"]').waitFor()
  }
  try {
    await probe('foreign')
    await probe('conflict')
    await waitForSkin(null)
    await panel.getByText('Wallpaper Engine owns the backdrop.', { exact: true }).first().waitFor()
    assert.deepEqual(await selection(), applied)
    const foreignColors = await page.evaluate(keys => keys.map(key => getComputedStyle(document.body).getPropertyValue(key).trim()), Object.keys(foreign))
    assert.deepEqual(foreignColors, Object.values(foreign).map(schemes => schemes.light))
    await probe('clear-conflict')
    await waitForSkin(sample.id)
    assert.deepEqual(await selection(), applied)
  } finally {
    await probe('clear-conflict')
    await probe('release')
  }
  await button(panel, 'Restore Default').press('Enter')
  await panel.locator('[data-saved-skin=""]').waitFor()
  await waitForSkin(null)
  assert.equal(await page.locator(resources).count(), 0)
  await ui.appearance('light', { select: false })
  evidence.appearance = { sameSkinAndPreferences: true, decodedBothImages: true, yieldedToForeignOwner: true, nativeRestored: true }
  evidence.wide = await panel.evaluate(node => ({ viewport: [innerWidth, innerHeight], width: node.clientWidth }))
  await page.screenshot({ path: join(directory, 'settings-integration-default.png'), scale: 'css' })
  await ui.appearance('dark')
  await session.resize(1280, 820)
}
