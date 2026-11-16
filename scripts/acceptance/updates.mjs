import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { packageVersionPair, versionedSkin as skin } from '../../test/fixtures/package-versions.mjs'
import { deepOcean, openSkinTechnical } from './browser.mjs'
import { packagePanel, palette } from './packages.mjs'

const canvas = 'canvas[data-dsh-skin-effect-layer="canvas"]'
const zipFile = (version, bytes) => ({ name: `${skin.id}-${version}.dshskin.zip`, mimeType: 'application/zip', buffer: bytes })

export async function checkPackageUpdates(evidence, openWindow) {
  const [first, next] = await packageVersionPair()
  evidence.fixtures = [first, next].map(bytes => ({ bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }))
  let ui = await openWindow('dark')
  const actions = () => packagePanel(ui).openActions(skin)
  const showVersion = async version => {
    await openSkinTechnical(ui.detail(skin))
    await ui.detail(skin).getByText(new RegExp(`^Skin package v${RegExp.escape(version)} ·`)).waitFor()
  }
  const update = async () => {
    await (await actions()).getByLabel('Update from .dshskin.zip').setInputFiles(zipFile('1.1.0', next))
    await ui.panel.getByRole('status').filter({ hasText: 'Skin updated to v1.1.0.' }).waitFor()
    await ui.showGallery({ resetDetails: false })
    await showVersion('1.1.0')
  }
  const rollback = async () => {
    const region = await actions()
    await ui.activate(ui.button(region, 'Roll back to v1.0.0…'))
    await ui.activate(ui.button(region, 'Confirm rollback'))
    await ui.panel.getByRole('status').filter({ hasText: 'Skin rolled back to v1.0.0.' }).waitFor()
    await ui.showGallery({ resetDetails: false })
    await showVersion('1.0.0')
  }
  const compare = async (saved, color, hasCanvas) => {
    assert.deepEqual(await ui.selection(), saved)
    assert.equal((await palette(ui.page)).canvas, color)
    if (hasCanvas) await ui.page.locator(canvas).waitFor({ state: 'attached' })
    else assert.equal(await ui.page.locator(canvas).count(), 0)
  }

  await ui.open()
  await packagePanel(ui).install(`${skin.id}-1.0.0.dshskin.zip`, first)
  await ui.choose(skin)
  await showVersion('1.0.0')
  const detail = await ui.editSkinEffects(skin)
  await detail.getByRole('combobox', { name: 'Skin effect quality' }).selectOption('low')
  const strength = detail.getByRole('slider', { name: 'Floating Dust strength' })
  await strength.press('ArrowLeft')
  const density = await strength.evaluate(node => node.valueAsNumber / 100)
  await ui.apply(skin)
  const saved = await ui.selection()
  assert.deepEqual(saved.preferences[skin.id], { quality: 'low', effects: { 'particles.dust': { strength: density } } })
  await compare(saved, '#182431', true)
  await update()
  await compare(saved, '#312418', false)
  await ui.close()

  ui = await openWindow(null)
  await ui.waitForSkin(skin.id)
  await compare(saved, '#312418', false)
  await ui.open()
  await showVersion('1.1.0')
  await rollback()
  await compare(saved, '#182431', true)
  const reverted = await ui.editSkinEffects(skin)
  assert.equal(await reverted.getByRole('combobox', { name: 'Skin effect quality' }).inputValue(), 'low')
  assert.equal(await reverted.getByRole('slider', { name: 'Floating Dust strength' }).evaluate(node => node.valueAsNumber / 100), density)
  evidence.activeUpdate = { versions: ['1.0.0', '1.1.0', '1.0.0'], preferences: saved.preferences[skin.id], restarted: true }

  await ui.apply(deepOcean)
  const other = await ui.selection()
  const color = (await palette(ui.page)).canvas
  await ui.choose(skin)
  await update()
  await compare(other, color, true)
  await packagePanel(ui).remove(skin)
  await compare(other, color, true)
  evidence.inactiveUpdate = { selected: other.skinId, version: '1.1.0', removed: true }
  await ui.apply(null)
  await ui.close()
}
