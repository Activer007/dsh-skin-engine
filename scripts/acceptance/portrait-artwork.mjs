import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { settings } from './browser.mjs'
import { identify, prepareHost, redact } from './hosts.mjs'
import { seedSurfaceHistory } from './surfaces.mjs'

const { values: args } = parseArgs({ options: {
  archive: { type: 'string' }, previous: { type: 'string' }, 'desktop-exe': { type: 'string' },
  'host-version': { type: 'string' }, output: { type: 'string' },
} })
assert(args.archive && args.previous && args['desktop-exe'] && args['host-version'] && args.output)
const output = resolve(args.output)
await mkdir(output, { recursive: true })
const directory = await mkdtemp(join(output, 'desktop-'))
console.log('Portrait artwork evidence: ' + directory)
const run = { version: args['host-version'], stages: [], pageErrors: [], logs: [] }
const dark = 'com.dsh.skin.night-navigator'
const light = 'com.dsh.skin.morning-observatory'
const portraits = [dark, light, ...['jade-archive', 'rainline', 'blue-arc', 'dawn-station', 'moonlit-horizon', 'crimson-rain']
  .map(id => 'com.dsh.skin.' + id)]
let session
async function close() {
  if (!session) return
  run.logs.push(session.logs())
  await session.close()
  assert(!session.browser.isConnected())
  session = undefined
}

try {
  const previous = resolve(args.previous)
  const archive = resolve(args.archive)
  run.previous = await identify(previous, run.version)
  run.candidate = await identify(archive, run.version)
  const host = await prepareHost({ ...args, platform: 'desktop', suite: 'gallery-preferences', archive: previous }, directory, run.previous)
  await seedSurfaceHistory(directory, host.profileDir)
  const reopen = async scheme => {
    await close()
    session = await host.open()
    session.page.on('pageerror', error => run.pageErrors.push(redact(error.message)))
    await session.show()
    return settings(session.page, true, scheme, undefined, true)
  }
  let ui = await reopen('dark')
  const main = () => ui.page.locator('[data-dsh-skin-appearance]')
  const preview = () => ui.page.locator('[data-dsh-skin-chat-preview]')
  const image = () => ui.page.locator('[data-dsh-skin-effect-layer="artwork"]:visible > img')
  const custom = () => ui.page.getByRole('img', { name: 'Custom image preview', exact: true })
  const input = () => main().getByLabel('Replace image', { exact: true })
  const open = async () => {
    await ui.activate(ui.page.getByRole('navigation', { name: 'Global panels' }).getByRole('button', { name: 'Appearance Center', exact: true }))
    await main().locator('[data-saved-skin]').waitFor()
    await ui.activate(main().getByRole('tab', { name: 'Skin gallery', exact: true }))
  }
  const openCustomization = id => ui.expand(main().locator(`[data-skin-detail="${id}"] [data-skin-customization] > summary`))
  const select = id => ui.activate(main().locator(`[data-skin-card="${id}"]`))
  const choose = async id => {
    await select(id)
    await openCustomization(id)
  }
  const click = (label, root = main()) => ui.activate(ui.button(root, label))
  const snap = name => ui.page.screenshot({ path: join(directory, name + '.png'), scale: 'css', timeout: 7000 })
  const saved = id => main().locator(`[data-saved-skin="${id}"]`).waitFor()
  const imageSource = pattern => image().and(ui.page.locator(`img[src*="${pattern}"]`)).waitFor()
  const sprite = async (name, width, height, source) => {
    const encoded = (await readFile(source)).toString('base64')
    const result = await ui.page.evaluate(async ({ encoded, width, height }) => {
      const image = new Image()
      image.src = 'data:image/webp;base64,' + encoded
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ratio = Math.max(width / image.naturalWidth, height / image.naturalHeight)
      const sourceWidth = width / ratio
      const sourceHeight = height / ratio
      canvas.getContext('2d').drawImage(image, (image.naturalWidth - sourceWidth) * 0.9,
        (image.naturalHeight - sourceHeight) * 0.5, sourceWidth, sourceHeight, 0, 0, width, height)
      return canvas.toDataURL('image/png').split(',')[1]
    }, { encoded, width, height })
    return { name, mimeType: 'image/png', buffer: Buffer.from(result, 'base64') }
  }
  await ui.page.getByRole('treeitem', { name: /Skin Engine acceptance history|Untitled/ }).first().press('Enter')
  await ui.page.getByText('Fixture response.', { exact: true }).waitFor()
  await open()
  await select(dark)
  await click('Apply')
  await saved(dark)
  const baseline = await ui.selection()
  await close()
  await host.install(archive, run.candidate)
  ui = await reopen('dark')
  assert.deepEqual(await ui.selection(), baseline)
  await ui.waitForSkin(dark)
  await imageSource('navigator.webp')
  await open()
  for (const id of portraits) {
    await choose(id)
    await input().waitFor()
  }
  run.stages.push({ upgrade: true, editingControls: portraits })
  const base = resolve('lib/skins')
  const horizontal = await sprite('landscape.png', 1200, 675, join(base, 'blue-arc/assets/portrait.webp'))
  const vertical = await sprite('portrait.png', 675, 1000, join(base, 'morning-observatory/assets/portrait.webp'))
  await choose(dark)
  await input().setInputFiles({ name: 'invalid.png', mimeType: 'image/png', buffer: Buffer.from('invalid') })
  await main().getByRole('alert').filter({ hasText: /valid PNG/ }).waitFor()
  assert.deepEqual(await ui.selection(), baseline)
  // Hold delivery of one successful, real upload. The editor must ignore it after cancellation.
  await ui.page.evaluate(() => {
    const fetch = window.fetch
    const gate = Promise.withResolvers()
    window.__portraitProbe = { received: false, released: false, release: gate.resolve, restore() { window.fetch = fetch } }
    window.fetch = async function (input, options) {
      const response = await fetch.call(this, input, options)
      if (options?.method !== 'POST'
        || new URL(input instanceof Request ? input.url : input, document.baseURI).pathname !== '/api/dsh-skin-engine/user-artwork') return response
      window.__portraitProbe.received = response.ok
      await gate.promise
      window.__portraitProbe.released = true
      return response
    }
  })
  try {
    await input().setInputFiles(horizontal)
    await ui.page.waitForFunction(() => window.__portraitProbe.received)
    await click('Cancel upload')
    await ui.page.evaluate(() => window.__portraitProbe.release())
    await ui.page.waitForFunction(() => window.__portraitProbe.released)
    await main().getByText('Using the built-in image.', { exact: true }).waitFor()
    assert.deepEqual(await ui.selection(), baseline)
  } finally {
    await ui.page.evaluate(() => {
      window.__portraitProbe.release()
      window.__portraitProbe.restore()
      delete window.__portraitProbe
    })
  }
  await input().setInputFiles(horizontal)
  await custom().waitFor()
  await custom().evaluate(element => element.decode())
  await main().getByRole('combobox', { name: 'Image fit' }).selectOption('cover')
  await main().getByRole('slider', { name: /^Horizontal position/ }).press('End')
  await main().getByRole('slider', { name: /^Vertical position/ }).press('Home')
  await main().getByRole('slider', { name: /^Scale/ }).press('ArrowRight')
  await main().getByRole('slider', { name: /^Opacity/ }).press('ArrowRight')
  await snap('dark-editor-landscape')
  await click('Preview in chat')
  await preview().getByRole('timer').waitFor()
  await imageSource('user-artwork')
  assert.deepEqual(await ui.selection(), baseline)
  await snap('dark-chat-preview-wide')
  await click('Cancel preview', preview())
  await openCustomization(dark)
  await custom().waitFor()
  await click('Apply')
  await main().getByRole('status').filter({ hasText: /^Skin applied\.$/ }).waitFor()
  let darkSaved = await ui.selection()
  const darkArt = darkSaved.preferences[dark].artwork
  assert.deepEqual({ ...darkArt, asset: 'image' }, { asset: 'image', fit: 'cover', x: 100, y: 0, scale: 1.01, opacity: 0.36 })
  await click('Back to chat')
  await imageSource(darkArt.asset)
  await session.resize(980, 820)
  await ui.page.locator('[data-composer-input]:visible').first().waitFor()
  await snap('dark-chat-narrow')
  run.stages.push({ dark: darkArt, cancelledPreview: true, invalidFileRejected: true, cancelledUploadAndReselected: true, widths: [1280, 980] })
  ui = await reopen('dark')
  assert.deepEqual(await ui.selection(), darkSaved)
  await imageSource(darkArt.asset)
  await close()
  const path = join(host.profileDir, 'skin-engine-user-artwork', darkArt.asset)
  const moved = join(directory, 'missing-artwork.png')
  await rename(path, moved)
  try {
    ui = await reopen('dark')
    await imageSource('navigator.webp')
    assert.deepEqual(await ui.selection(), darkSaved)
    await snap('missing-image-built-in-fallback')
    await open()
    await choose(dark)
    await main().getByRole('status').filter({ hasText: /custom image is unavailable/i }).waitFor()
    await main().getByLabel('Background', { exact: true }).fill('#1e273d')
    await click('Apply')
    await main().getByRole('status').filter({ hasText: /^Skin applied\.$/ }).waitFor()
    const updated = await ui.selection()
    assert.equal(updated.revision, darkSaved.revision + 1)
    assert.deepEqual(updated.preferences[dark], { ...darkSaved.preferences[dark], colors: { canvas: '#1e273d' } })
    darkSaved = updated
    await click('Back to chat')
    await imageSource('navigator.webp')
    run.stages.push({ savedColorWithMissingImage: true, retainedArtwork: darkArt.asset })
  } finally {
    await close()
    await rename(moved, path)
  }
  ui = await reopen('dark')
  await imageSource(darkArt.asset)
  await open()
  await choose(light)
  await input().setInputFiles(vertical)
  await custom().waitFor()
  await click('Apply')
  await saved(light)
  const lightSaved = await ui.selection()
  const lightArt = lightSaved.preferences[light].artwork
  assert.equal(lightArt.fit, 'contain')
  await click('Back to chat')
  await imageSource(lightArt.asset)
  await snap('light-chat-applied-portrait')
  await close()
  const patch = join(host.profileDir, 'cordis.patch.yml')
  const original = await readFile(patch, 'utf8')
  await writeFile(patch, original + '\n- id: dsh-skin-engine\n  disabled: true\n')
  try {
    session = await host.open()
    await session.page.locator('[data-composer-input]:visible').first().waitFor()
    assert.equal(await session.page.locator('html').getAttribute('data-dsh-skin-id'), null)
  } finally {
    await close()
    await writeFile(patch, original)
  }
  ui = await reopen('light')
  assert.deepEqual(await ui.selection(), lightSaved)
  await imageSource(lightArt.asset)
  await open()
  await choose(light)
  await click('Restore built-in image')
  await click('Apply')
  await main().getByRole('status').filter({ hasText: /^Skin applied\.$/ }).waitFor()
  assert.equal((await ui.selection()).preferences?.[light]?.artwork, undefined)
  await click('Back to chat')
  await imageSource('portrait.webp')
  await snap('light-restored-built-in')
  await open()
  await click('Restore Default')
  await click('Confirm restore')
  await main().getByRole('status').filter({ hasText: /^Default appearance restored\.$/ }).waitFor()
  assert.equal((await ui.selection()).skinId, null)
  const assets = await readdir(join(host.profileDir, 'skin-engine-user-artwork'))
  assert.deepEqual(assets.sort(), [darkArt.asset, lightArt.asset].sort())
  run.stages.push({ light: lightArt, restart: true, missingFallback: true, disableAndEnable: true,
    restoredBuiltIn: true, restoredNativeAppearance: true, retainedImageFiles: assets.length })
  assert.deepEqual(run.pageErrors, [])
  run.completed = true
} catch (error) {
  run.error = redact(error.stack ?? error)
  console.error(run.error)
  if (session) await session.page.screenshot({ path: join(directory, 'failure.png'), timeout: 4000 }).catch(() => {})
  process.exitCode = 1
} finally {
  try { await close() } finally { await writeFile(join(directory, 'result.json'), JSON.stringify(run, null, 2) + '\n') }
}
