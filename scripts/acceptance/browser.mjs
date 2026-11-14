import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'

export const deepOcean = { name: 'Deep Ocean', id: 'com.dsh.skin.deep-ocean' }
const aurora = { name: 'Aurora', id: 'com.dsh.skin.aurora' }
const canvas = 'canvas[data-dsh-skin-effect-layer="canvas"]'
export const resources = '[data-dsh-skin-id],[data-dsh-skin-effect-scene],[data-dsh-skin-effect-layer],[data-dsh-skin-effect-surface],style[data-dsh-skin-effects-style]'
const appearanceNames = { light: /^(浅色|Light)$/, dark: /^(深色|Dark)$/, system: /^(跟随系统|System)$/ }

export async function settings(page, desktop, initialAppearance = 'dark', beforeOpen) {
  page.setDefaultTimeout(24_000)
  const cdp = await page.context().newCDPSession(page)
  await page.bringToFront()
  const account = page.getByRole('button', { name: /账号菜单|Account menu/i })
  await account.waitFor()
  async function dismissOnboarding() {
    const onboarding = [
      [/预览版说明|Preview/i, /^(继续|Continue)$/i],
      [/添加一个 API Key|Add an API key/i, /稍后配置|Set up later|Later/i],
      [/^(开始使用|Get started)$/i, /^(关闭|Close)$/i],
    ]
    for (const [title, label] of onboarding) {
      const modal = page.getByRole('dialog', { name: title })
      const shown = await modal.waitFor({ timeout: 4000 }).then(() => true, () => false)
      if (shown) await activate(modal.getByRole('button', { name: label }))
    }
  }
  await dismissOnboarding()
  const dialog = page.getByRole('dialog', { name: /^(设置|Settings)$/ })
  const panel = dialog.locator('[data-dsh-skin-engine]')
  const tab = dialog.getByRole('button', { name: /^(Skin Engine|皮肤引擎)$/ })
  const gallery = panel.getByRole('region', { name: 'Skin gallery', exact: true })
  const detail = skin => panel.locator(`[data-skin-detail="${skin.id}"]:visible`).or(panel.getByRole('region', { name: `${skin.name} details`, exact: true }))
  const card = skin => gallery.locator(`[data-skin-card="${skin.id}"]`).or(
    gallery.getByRole('button', { name: new RegExp(`^${RegExp.escape(skin.name)} `) }))
  const pageTab = name => panel.getByRole('tab', { name, exact: true })
  const skinEffects = skin => panel.locator(`[data-skin-effects="${skin.id}"]:visible`)

  function button(parent, name) { return parent.getByRole('button', { name, exact: true }) }
  async function activate(control) {
    if (!desktop) return control.click()
    const handle = await control.elementHandle()
    try {
      await page.waitForFunction(el => !el.matches(':disabled') && !el.closest('[inert]'), handle, { polling: 100 })
      await control.press('Enter')
    } finally { await handle.dispose() }
  }
  async function expand(summary) {
    if (!await summary.evaluate(node => node.parentElement.open)) await activate(summary)
  }
  async function open() {
    await activate(account)
    await activate(page.getByRole('menuitem', { name: /^(设置|Settings)$/ }))
    await openSkinSection()
    const heading = panel.getByRole('heading', { name: /^(Skin Engine|皮肤引擎)$/ })
    // Legacy suites assert English copy. The Locale suite switches languages explicitly.
    if (await heading.textContent() === '皮肤引擎') {
      await switchLanguage('en')
      await openSkinSection()
      await button(panel, 'Restore Default').waitFor()
    }
  }
  async function openSkinSection() {
    await tab.press('Enter')
    const heading = panel.getByRole('heading', { name: /^(Skin Engine|皮肤引擎)$/ })
    await heading.waitFor()
  }
  async function switchLanguage(language) {
    await activate(dialog.getByRole('button', { name: /^(通用设置|General)$/ }))
    const row = dialog.getByText(/^(语言|Language)$/).locator('../..')
    await activate(row.getByRole('button', { name: /^(中文|English)$/ }))
    await activate(page.getByRole('menuitem', { name: language === 'en' ? 'English' : '中文', exact: true }))
    await page.waitForFunction(expected => document.documentElement.lang.toLowerCase().split('-')[0] === expected, language)
  }
  async function close() {
    await activate(dialog.getByRole('button', { name: /^(关闭|Close)(设置| settings)?$/i }))
    await dialog.waitFor({ state: 'hidden' })
  }
  async function appearance(scheme, { select = true } = {}) {
    await activate(dialog.getByRole('button', { name: /^(通用设置|General)$/ }))
    const name = appearanceNames[scheme]
    if (select) await activate(dialog.getByRole('button', { name }))
    await dialog.getByRole('button', { name, pressed: true }).waitFor()
    await tab.press('Enter')
    await panel.getByRole('heading', { name: 'Skin Engine', exact: true }).waitFor()
  }
  async function showGallery({ resetDetails = true } = {}) {
    const galleryTab = pageTab('Skin gallery')
    if (await galleryTab.count() && await galleryTab.getAttribute('aria-selected') !== 'true') await activate(galleryTab)
    const back = button(panel, 'Back to gallery')
    if (resetDetails && await back.isVisible()) await activate(back)
  }
  async function choose(skin) {
    await showGallery()
    await activate(card(skin))
  }
  const waitForSkin = id => page.waitForFunction(id => document.documentElement.getAttribute('data-dsh-skin-id') === id, id, { polling: 100 })
  const selection = () => page.evaluate(async () => {
    const response = await fetch(new URL('api/dsh-skin-engine/selection', document.baseURI), { cache: 'no-store' })
    if (!response.ok) throw Error(`Selection returned ${response.status}`)
    return response.json()
  })
  async function apply(skin) {
    if (skin) {
      await choose(skin)
      await activate(button(detail(skin), 'Apply'))
    } else {
      await activate(button(panel, 'Restore Default'))
    }
    const saved = panel.locator('[data-saved-skin]')
    if (await saved.count()) await panel.locator(`[data-saved-skin="${skin?.id ?? ''}"]`).waitFor()
    else await panel.locator('p').first().filter({ hasText: `Saved ${skin?.name ?? 'Default'}` }).waitFor()
    await waitForSkin(skin?.id ?? null)
  }
  async function mode(value) {
    const previous = panel.getByRole('tab', { selected: true })
    const previousName = await previous.count() ? await previous.innerText() : undefined
    await showEffects()
    const control = panel.getByRole('combobox', { name: /^Effects in this window/ })
    const summary = panel.locator('summary').filter({ hasText: /^Window effects$/ })
    if (await summary.count()) await expand(summary)
    await control.selectOption(value)
    if (previousName && previousName !== 'Effects & performance') await activate(pageTab(previousName))
  }
  async function showEffects() {
    const tab = pageTab('Effects & performance')
    if (await tab.count() && await tab.getAttribute('aria-selected') !== 'true') await activate(tab)
  }
  async function editSkinEffects(skin) {
    await showGallery({ resetDetails: false })
    const region = detail(skin)
    await region.waitFor()
    const edit = button(region, 'Adjust effects')
    const controls = panel.locator('[data-skin-effects]')
    if (await controls.count()) {
      await activate(edit)
      const target = skinEffects(skin)
      await target.waitFor()
      return target
    }
    const customize = region.locator('summary').filter({ hasText: /^Customize skin$/ })
    const quality = region.getByRole('combobox', { name: /^Skin effect quality/ })
    await customize.or(quality).first().waitFor()
    if (await customize.count()) await expand(customize)
    return region
  }

  await beforeOpen?.({ page, panel, open, close })
  await open()
  assert.equal(new URL(page.url()).protocol, desktop ? 'dsh-app:' : 'http:')
  assert.equal(await panel.count(), 1)
  if (initialAppearance) await appearance(initialAppearance)
  await choose(deepOcean)
  await button(detail(deepOcean), 'Apply').waitFor()
  await close()
  return { cdp, page, panel, detail, card, button, activate, expand, open, openSkinSection, close, choose, selection, waitForSkin, apply, mode, appearance, dismissOnboarding, switchLanguage, pageTab, showEffects, showGallery, editSkinEffects }
}

export async function switchSkins(ui, count) {
  const { page, panel, detail, button, activate, open, close, choose, selection, waitForSkin, apply } = ui
  await open()
  if ((await selection()).skinId !== null) await apply(null)
  const initial = await selection()
  await choose(deepOcean)
  await activate(button(detail(deepOcean), 'Preview'))
  await waitForSkin(deepOcean.id)
  assert.equal(await page.locator(canvas).count(), 1)
  assert.deepEqual(await selection(), initial)
  await activate(button(panel, 'Cancel preview'))
  await waitForSkin(null)
  assert.deepEqual(await selection(), initial)
  assert.equal(await page.locator(resources).count(), 0)

  const samples = []
  const started = performance.now()
  for (let index = 0; index < count; index++) {
    const skin = index % 2 === 0 ? deepOcean : aurora
    await apply(skin)
    const current = await selection()
    assert.equal(current.skinId, skin.id)
    assert.equal(current.revision, initial.revision + index + 1)
    assert.equal(await page.locator('[data-dsh-skin-effect-scene]').count(), 1)
    assert.equal(await page.locator(canvas).count(), 1)
    samples.push({ skinId: current.skinId, revision: current.revision })
  }
  await apply(null)
  assert.equal(await page.locator(resources).count(), 0)
  const final = await selection()
  assert.equal(final.skinId, null)
  assert.equal(final.revision, initial.revision + count + 1)
  await close()
  return { count, elapsedMs: Math.round(performance.now() - started), previewWasTransient: true, samples, final }
}

export async function showMode(ui, state, foreground) {
  const { page, selection, open, close, apply, mode } = ui
  await open()
  const target = state === 'default' ? null : deepOcean
  if ((await selection()).skinId !== (target?.id ?? null)) await apply(target)
  await mode(state === 'static' ? 'off' : 'dynamic')
  await close()
  await foreground?.()
  await page.waitForFunction(state => {
    const canvas = document.querySelector('canvas[data-dsh-skin-effect-layer="canvas"]')
    const cache = document.querySelectorAll('[data-dsh-skin-aurora-image]').length
    if (state === 'p0') return cache === 2 && canvas?.width > 0
    return cache === 0 && (!canvas || canvas.width === 0)
  }, state, { polling: 100 })
}
