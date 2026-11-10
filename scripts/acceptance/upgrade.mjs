import assert from 'node:assert/strict'
import { deepOcean } from './browser.mjs'

const qualityControl = ui => ui.detail(deepOcean).getByRole('combobox', { name: /^Skin effect quality/ })

export async function saveOldSelection(ui) {
  await ui.open()
  await ui.choose(deepOcean)
  const quality = qualityControl(ui)
  const customize = ui.detail(deepOcean).locator('summary').filter({ hasText: /^Customize skin$/ })
  await customize.or(quality).first().waitFor()
  if (await customize.isVisible()) await ui.expand(customize)
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
  const skinVersion = detail.getByText(/^Skin package v1\.0\.0/)
  await skinVersion.waitFor()
  await detail.getByText(/^Engine API \^1\.0\.0/).waitFor()
  await expand(detail.locator('summary').filter({ hasText: /^Customize skin$/ }))
  assert.equal(await qualityControl(ui).inputValue(), 'low')

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
  return { before, after: await ui.selection(), host, skin: await skinVersion.innerText(), diagnosticExamples }
}
