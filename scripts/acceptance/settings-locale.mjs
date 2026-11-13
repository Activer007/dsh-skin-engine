import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { packageVersionPair } from '../../test/fixtures/package-versions.mjs'
import { deepOcean } from './browser.mjs'

const name = 'dsh-skin-locale-fixture'
const event = 'dsh-skin-acceptance-locale'

function fixture(id, event) {
  globalThis.__ModuleLoader__.load({
    id,
    factory: () => ({
      inject: ['locale'],
      apply(ctx) {
        ctx.effect(() => {
          const root = document.documentElement
          function change({ detail }) {
            if (detail === 'en' || detail === 'zh') ctx.locale.setLocale(detail)
          }
          root.addEventListener(event, change)
          root.setAttribute('data-dsh-skin-locale-fixture', '')
          return () => {
            root.removeEventListener(event, change)
            root.removeAttribute('data-dsh-skin-locale-fixture')
          }
        }, 'switch the isolated host locale while a settings section is mounted')
      },
    }),
  })
}

export async function installLocaleFixture(directory, installLocalBundle) {
  const fixtureDir = join(directory, name)
  await mkdir(fixtureDir)
  const manifest = {
    name, version: '0.0.0', private: true, type: 'module',
    exports: { '.': './index.mjs', './client': './client.js' },
    dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web', inject: ['@deepseek-ai/dsh-client-locale'] } },
  }
  await Promise.all([
    writeFile(join(fixtureDir, 'package.json'), JSON.stringify(manifest)),
    writeFile(join(fixtureDir, 'cordis.patch.yml'), `- insert:\n    - id: ${name}\n      name: ${name}\n`),
    writeFile(join(fixtureDir, 'index.mjs'), 'export function apply() {}\n'),
    writeFile(join(fixtureDir, 'client.js'), `(${fixture})(${JSON.stringify(name)}, ${JSON.stringify(event)})\n`),
  ])
  installLocalBundle(fixtureDir)
}

export async function checkSettingsLocale(ui, session, directory, evidence) {
  const { page, panel, activate, button, selection, waitForSkin, choose } = ui
  await ui.open()
  await choose(deepOcean)
  const before = await selection()
  const effects = await ui.editSkinEffects(deepOcean)
  const english = effects.getByRole('combobox', { name: 'Skin effect quality' })
  await english.selectOption('low')
  await activate(button(effects, 'Preview'))
  await waitForSkin(deepOcean.id)
  await page.locator('[data-dsh-skin-locale-fixture]').waitFor()
  async function change(language) {
    await page.evaluate(({ event, language }) => {
      document.documentElement.dispatchEvent(new CustomEvent(event, { detail: language }))
    }, { event, language })
    await page.waitForFunction(expected => document.documentElement.lang.toLowerCase().split('-')[0] === expected, language)
  }
  async function measure() {
    return panel.evaluate(node => ({
      viewport: [innerWidth, innerHeight],
      content: node.clientWidth,
      scroll: node.scrollWidth,
    }))
  }
  await change('zh')
  await panel.getByRole('heading', { name: '皮肤引擎', exact: true }).waitFor()
  const chinese = panel.getByRole('combobox', { name: '皮肤效果质量' })
  assert.equal(await chinese.inputValue(), 'low')
  assert(await effects.getByText('偏好尚未保存。可以在当前窗口预览，或应用并保存。').isVisible())
  assert(await panel.getByRole('slider', { name: '液态玻璃强度' }).getAttribute('aria-valuetext'))
  await waitForSkin(deepOcean.id)
  assert.deepEqual(await selection(), before)
  await session.resize(760, 820)
  evidence.chinese = await measure()
  assert.equal(evidence.chinese.content, evidence.chinese.scroll)
  await page.screenshot({ path: join(directory, 'settings-zh-760.png'), scale: 'css' })

  await session.resize(1280, 820)
  await change('en')
  await panel.getByRole('heading', { name: 'Skin Engine', exact: true }).waitFor()
  assert.equal(await english.inputValue(), 'low')
  await waitForSkin(deepOcean.id)
  assert.deepEqual(await selection(), before)
  await activate(button(panel, 'Cancel preview'))
  await waitForSkin(before.skinId)
  assert.equal(await english.inputValue(), 'low')
  await ui.apply(deepOcean)
  assert.equal((await selection()).preferences[deepOcean.id].quality, 'low')
  await ui.apply(null)
  const [archive] = await packageVersionPair()
  const file = { name: 'locale-fixture.dshskin.zip', mimeType: 'application/zip', buffer: archive }
  const importer = panel.getByRole('region', { name: 'Import skin package' })
  await importer.getByLabel('Import .dshskin.zip').setInputFiles(file)
  await importer.getByRole('status').filter({ hasText: 'Skin installed.' }).waitFor()
  await importer.getByLabel('Import .dshskin.zip').setInputFiles(file)
  await importer.getByRole('status').filter({ hasText: 'This skin is already installed.' }).waitFor()
  await activate(importer.getByText('Technical details', { exact: true }))
  assert(await importer.getByText('duplicate-id', { exact: true }).isVisible())
  await change('zh')
  await panel.getByRole('region', { name: '导入皮肤包' }).getByRole('status').filter({ hasText: '此皮肤已安装。' }).waitFor()
  await change('en')
  await panel.getByRole('heading', { name: 'Skin Engine', exact: true }).waitFor()
  evidence.duplicateImport = { localized: true, code: 'duplicate-id' }
  evidence.english = await measure()
  evidence.defaultRestored = true
  await page.screenshot({ path: join(directory, 'settings-en-1280.png'), scale: 'css' })
}
