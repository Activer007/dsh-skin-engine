import assert from 'node:assert/strict'
import { join } from 'node:path'
import { deepOcean, openSkinTechnical } from './browser.mjs'
import { packagePanel } from './packages.mjs'
import { packageVersionPair, versionedSkin } from '../../test/fixtures/package-versions.mjs'

const qualityControl = async ui => (await ui.editSkinEffects(deepOcean)).getByRole('combobox', { name: /^Skin effect quality/ })

export async function saveOldSelection(ui) {
  await ui.open()
  await ui.choose(deepOcean)
  const quality = await qualityControl(ui)
  await quality.selectOption('low')
  await ui.apply(deepOcean)
  const selection = await ui.selection()
  assert.equal(selection.skinId, deepOcean.id)
  assert.equal(selection.preferences?.[deepOcean.id]?.quality, 'low')
  return selection
}

export async function verifyUpgrade(ui, version, before) {
  const { activate, expand, page, panel } = ui
  assert.deepEqual(await ui.selection(), before)
  await ui.waitForSkin(deepOcean.id)
  await ui.open()
  await panel.getByText(`Client engine v${version}`, { exact: true }).waitFor()
  const detail = ui.detail(deepOcean)
  await openSkinTechnical(detail)
  const skinVersion = detail.getByText(/^Skin package v1\.0\.0/)
  await skinVersion.waitFor()
  const versionText = await skinVersion.innerText()
  await detail.getByText(/^Engine API \^1\.0\.0/).waitFor()
  assert.equal(await (await qualityControl(ui)).inputValue(), 'low')

  const manage = ui.pageTab('Skin management')
  if (await manage.count()) await activate(manage)
  const diagnostics = panel.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^Maintenance and diagnostics/ }) })
  await expand(diagnostics.locator('summary'))
  const check = ui.button(diagnostics, 'Check Host')
  const status = diagnostics.getByRole('status')
  async function read(pattern) {
    await activate(check)
    const message = status.filter({ hasText: pattern })
    await message.waitFor()
    return message.innerText()
  }
  const host = await read(`Host engine v${version}.`)
  const examples = [
    { body: { persisted: false, engineVersion: '1.0.0' }, text: /Client and Host versions differ\. Quit and reopen DSH Desktop/ },
    { body: { persisted: false }, text: /^Host engine version unavailable\./ },
    { body: { error: 'unavailable' }, status: 503, text: /^Host unavailable\. HTTP 503/ },
  ]
  const diagnosticExamples = []
  for (const { body, status: code, text } of examples) {
    // Electron serves dsh-app through its own protocol handler. Replace only the
    // next audit fetch in this isolated renderer after checking the real route.
    await page.evaluate(({ body, code }) => {
      const fetch = window.fetch
      window.fetch = (input, init) => {
        const target = input instanceof Request ? input.url : input
        if (new URL(target, document.baseURI).pathname !== '/api/dsh-skin-engine/audit') return fetch(input, init)
        window.fetch = fetch
        return Promise.resolve(Response.json(body, { status: code ?? 200 }))
      }
    }, { body, code })
    diagnosticExamples.push(await read(text))
  }
  return { before, after: await ui.selection(), host, skin: versionText, diagnosticExamples }
}

export async function checkReleaseUpgrade(openVersion, version, previousVersion, directory, evidence) {
  async function readVersion(ui, expected, stage) {
    const { panel, page, button, activate, expand } = ui
    await ui.open()
    await panel.getByText(`Client engine v${expected}`, { exact: true }).waitFor()
    await packagePanel(ui).showManagement()
    const diagnostics = panel.locator('summary').filter({ hasText: /^Maintenance and diagnostics/ })
    if (await diagnostics.count()) await expand(diagnostics)
    await activate(button(panel, 'Check Host'))
    const host = panel.getByRole('status').filter({ hasText: `Host engine v${expected}.` })
    await host.waitFor()
    evidence[stage] = { client: expected, host: await host.innerText() }
    await page.screenshot({ path: join(directory, `${stage}-diagnostics.png`), scale: 'css' })
    await ui.close()
  }

  async function packageIdentity(ui) {
    const { skins } = await packagePanel(ui).getCatalogue()
    const installed = skins.find(skin => skin.manifest.id === versionedSkin.id)
    assert.equal(installed?.source, 'local')
    assert.equal(installed.manifest.version, '1.0.0')
    return { id: installed.manifest.id, version: installed.manifest.version, revision: installed.revision }
  }

  const previous = await openVersion(false)
  await previous.open()
  const [archive] = await packageVersionPair()
  await packagePanel(previous).install('release-upgrade.dshskin.zip', archive)
  await previous.close()
  const before = await saveOldSelection(previous)
  await previous.close()
  const imported = await packageIdentity(previous)
  await readVersion(previous, previousVersion, 'previous')
  evidence.previous.selection = before
  evidence.previous.imported = imported

  const upgraded = await openVersion(true)
  assert.deepEqual(await upgraded.selection(), before)
  assert.deepEqual(await packageIdentity(upgraded), imported)
  await upgraded.waitForSkin(deepOcean.id)
  await readVersion(upgraded, version, 'upgraded')
  evidence.upgraded.selection = before
  evidence.upgraded.imported = imported
  const main = upgraded.page.locator('[data-dsh-skin-appearance]')
  await upgraded.activate(upgraded.button(upgraded.page, 'Appearance Center'))
  await upgraded.activate(main.locator(`[data-skin-card="${deepOcean.id}"]`))
  await upgraded.activate(upgraded.button(main, 'Adjust effects'))
  const quality = main.getByRole('combobox', { name: 'Skin effect quality' })
  assert.equal(await quality.inputValue(), 'low')
  await quality.selectOption('high')
  await upgraded.activate(upgraded.button(main, 'Apply'))
  await main.getByRole('status').filter({ hasText: /^Skin applied\.$/ }).waitFor()
  const edited = await upgraded.selection()
  assert.equal(edited.revision, before.revision + 1)
  assert.equal(edited.preferences[deepOcean.id].quality, 'high')
  evidence.upgraded.edited = edited
  await upgraded.activate(main.getByRole('tab', { name: 'Skin management' }))
  await main.locator(`[data-package-id="${versionedSkin.id}"]`).waitFor()
  await upgraded.page.screenshot({ path: join(directory, 'upgraded-appearance-center.png'), scale: 'css' })

  const rolledBack = await openVersion(false)
  assert.deepEqual(await rolledBack.selection(), edited)
  assert.deepEqual(await packageIdentity(rolledBack), imported)
  await rolledBack.waitForSkin(deepOcean.id)
  await readVersion(rolledBack, previousVersion, 'rolledBack')
  await rolledBack.open()
  await rolledBack.choose(deepOcean)
  assert.equal(await (await qualityControl(rolledBack)).inputValue(), 'high')
  await rolledBack.close()
  evidence.rolledBack.selection = edited
  evidence.rolledBack.imported = imported
}
