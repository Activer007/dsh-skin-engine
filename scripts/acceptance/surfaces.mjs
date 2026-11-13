import assert from 'node:assert/strict'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { zstdCompressSync } from 'node:zlib'
import { deepOcean } from './browser.mjs'

const card = '[data-composer-card]:visible'
const scene = '[data-dsh-skin-effect-scene]'
const historyTitle = 'Skin Engine acceptance history'

/** Seed an offline conversation in the official host's v4 log format. */
export async function seedSurfaceHistory(directory, profileDir, { bilingual = false, secondTurn = false } = {}) {
  const documents = join(directory, 'documents')
  const cwd = join(documents, 'deepseek-harness', 'default-workspace')
  const id = 'skin-acceptance-history'
  const slug = cwd.replace(/[/\\:]+/g, '-').replace(/^-+/, '').replace(/[^A-Za-z0-9._-]/g,
    char => `~${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`)
  const path = join(directory, 'home', 'sessions', `--${slug.slice(0, 251)}--`, id)
  await mkdir(cwd, { recursive: true })
  await mkdir(path, { recursive: true })
  const patch = join(profileDir, 'cordis.patch.yml')
  const initial = await readFile(patch, 'utf8')
  const config = initial.replace(/^\s*\[\]\s*$/m, '')
  await writeFile(patch, `${config.trimEnd()}\n- id: workspace-controller\n  config:\n    documentsDirectory: ${JSON.stringify(documents)}\n`)
  const createdAt = Date.now() - 60_000
  const timestamp = new Date(createdAt).toISOString()
  const workspace = '00000000-0000-4000-8000-000000000001'
  const storage = join(directory, 'home', 'storages')
  await mkdir(storage, { recursive: true })
  // Desktop may initialize an empty workspace registry during its first launch.
  await writeFile(join(storage, 'workspace.json'), JSON.stringify({
    unit: { name: 'workspace', version: 2 },
    global: { initialized: true, workspaceIds: [workspace], archivedSessionIds: [], pinnedSessionIds: [] },
    tables: { workspaces: {
      [workspace]: { path: cwd, title: 'default-workspace', sessionIds: [id], createdAt: timestamp, updatedAt: timestamp },
    } },
  }))
  const events = [
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'step/start', data: { turn: 1, step: 1 } },
    { type: 'user/message', surfaceOp: 'append', data: { role: 'user', id: 'fixture-user',
      source: { kind: 'user', rpcId: 'fixture-rpc' }, content: [{ type: 'text', text: 'Local test conversation.' }] } },
    { type: 'session/title', data: { title: historyTitle, messageSeqs: [2], source: { kind: 'fallback' } } },
    { type: 'assistant/message', surfaceOp: 'append', data: { turn: 1, step: 1, stream: [], message: {
      role: 'assistant', id: 'fixture-assistant', source: { kind: 'model', provider: 'deepseek-official', model: 'deepseek-v4-flash' },
      content: [{ type: 'text', text: (bilingual ? '中文场景验收。\n\n' : '') + 'Fixture response.\n\n```js\nconst fixture = true\n```' }],
    } } },
    { type: 'step/end', data: { turn: 1, step: 1 } },
    { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
  ]
  if (secondTurn) events.push(
    { type: 'turn/start', data: { turn: 2 } },
    { type: 'step/start', data: { turn: 2, step: 1 } },
    { type: 'user/message', surfaceOp: 'append', data: { role: 'user', id: 'fixture-user-two',
      source: { kind: 'user', rpcId: 'fixture-rpc-two' }, content: [{ type: 'text', text: 'Token audit second turn.' }] } },
    { type: 'assistant/message', surfaceOp: 'append', data: { turn: 2, step: 1, stream: [], message: {
      role: 'assistant', id: 'fixture-assistant-two', source: { kind: 'model', provider: 'deepseek-official', model: 'deepseek-v4-flash' },
      content: [{ type: 'text', text: 'Second turn response.\n\n```js\nconst audit = true\n```' }],
    } } },
    { type: 'step/end', data: { turn: 2, step: 1 } },
    { type: 'turn/end', data: { turn: 2, reason: { kind: 'completed' } } },
  )
  const header = { type: 'session', version: 4, id, createdAt, cwd, isSeeded: false, delegationDepth: 0, agentPreset: 'standard' }
  const lines = events.map((event, seq) => JSON.stringify({ ...event, seq, time: createdAt + seq + 1 }))
  await writeFile(join(path, 'session.v4.jsonl.zstd'), Buffer.concat([
    zstdCompressSync(JSON.stringify(header) + '\n'),
    zstdCompressSync(lines.join('\n') + '\n'),
  ]))
}

export async function checkSurfaces(session, ui, directory, profileDir, evidence) {
  const { page, cdp, open, close, activate, apply, waitForSkin, selection } = ui
  const dialog = page.getByRole('dialog', { name: /^(设置|Settings)$/ })
  const general = dialog.getByRole('button', { name: /^(通用设置|General)$/ })
  const engine = ui.button(dialog, 'Skin Engine')
  const width = () => dialog.evaluate(node => ({ viewport: innerWidth, width: node.getBoundingClientRect().width }))
  const screenshot = name => page.screenshot({ path: join(directory, `${name}.png`), timeout: 10_000 })

  evidence.settings = []
  await open()
  for (const size of [1280, 760]) {
    await session.resize(size, 820)
    await page.waitForFunction(wide => (innerWidth >= 900) === wide, size >= 900, { polling: 100 })
    const skin = await width()
    await ui.showGallery()
    await ui.panel.locator('.dsh-skin-gallery img').first().evaluate(img => img.decode())
    await ui.choose(deepOcean)
    await ui.detail(deepOcean).locator('summary').filter({ hasText: /^Customize skin$/ }).waitFor()
    await screenshot(`settings-${size}`)
    await activate(general)
    await ui.panel.waitFor({ state: 'detached' })
    const native = await width()
    await engine.press('Enter')
    await ui.panel.waitFor()
    assert.equal((await width()).width, skin.width)
    assert(skin.width <= skin.viewport)
    if (size >= 900) assert(skin.width > native.width)
    else assert.equal(skin.width, native.width)
    evidence.settings.push({ size, skin, native })
  }
  await session.resize(1280, 820)
  await close()

  const composer = page.locator(card)
  await composer.waitFor()
  const background = () => composer.evaluate(node => getComputedStyle(node).backgroundColor)
  const media = (...features) => cdp.send('Emulation.setEmulatedMedia', { features })
  const expectedBlend = () => composer.evaluate(node => {
    const sample = document.createElement('span')
    sample.style.backgroundColor = 'color-mix(in srgb, var(--dsw-specific-input-major) 82%, transparent)'
    node.append(sample)
    try { return getComputedStyle(sample).backgroundColor } finally { sample.remove() }
  })
  const conditions = [
    { name: 'normal' },
    { name: 'reduced-transparency', feature: { name: 'prefers-reduced-transparency', value: 'reduce' } },
    { name: 'forced-colors', feature: { name: 'forced-colors', value: 'active' } },
  ]
  async function colors() {
    const result = {}
    try {
      for (const { name, feature } of conditions) {
        await media(...(feature ? [feature] : []))
        if (feature) assert(await page.evaluate(({ name, value }) => matchMedia(`(${name}: ${value})`).matches, feature))
        result[name] = await background()
      }
    } finally { await media() }
    return result
  }

  if ((await selection()).skinId !== null) {
    await open()
    await apply(null)
    await close()
  }
  const phase = name => page.locator(`[data-slot="main.conversation"] > [data-phase="${name}"]`)
  const history = page.getByRole('treeitem', { name: new RegExp(`${historyTitle}|未命名|Untitled`) })
  evidence.composer = {}
  for (const name of ['hero', 'active']) {
    if (name === 'active') await activate(history)
    else if (!await phase(name).isVisible()) {
      await activate(page.getByRole('button', { name: /^(新建会话|New Session)$/i }).filter({ visible: true }).first())
    }
    await phase(name).waitFor()
    if (name === 'active') await phase(name).getByText('Fixture response.', { exact: true }).waitFor()
    const native = await colors()
    await open()
    await apply(deepOcean)
    await close()
    const skin = await colors()
    assert.equal(skin.normal, await expectedBlend())
    assert.notEqual(skin.normal, native.normal)
    for (const { name } of conditions.slice(1)) assert.equal(skin[name], native[name])
    evidence.composer[name] = { native, skin }
    await screenshot(`composer-${name}`)
    if (name === 'hero') {
      await open()
      await apply(null)
      await close()
    }
  }

  const { native, skin } = evidence.composer.active
  const editor = composer.locator('[data-composer-input]')
  await editor.press('x')
  assert(await editor.evaluate(node => node === document.activeElement && node.textContent === 'x'))
  await editor.press('Backspace')
  assert.equal((await editor.innerText()).trim(), '')
  const commands = composer.getByRole('button', { name: /添加文件或调用指令|Add files|Invoke commands/i })
  await commands.press('Enter')
  await page.getByRole('listbox').waitFor()
  await page.keyboard.press('Escape')
  await page.getByRole('listbox').waitFor({ state: 'hidden' })
  evidence.editorAndMenu = true

  const seat = phase('active').locator('[data-composer-seat]').filter({ has: composer })
  await seat.evaluate(node => node.removeAttribute('data-composer-seat'))
  try { assert.equal(await background(), native.normal) }
  finally { await composer.evaluate(node => node.closest('[data-conversation-region="composer"]').setAttribute('data-composer-seat', '')) }
  assert.equal(await background(), skin.normal)
  evidence.unknownLayoutFallback = true

  const marker = 'data-we-wallpaper'
  await page.evaluate(marker => document.body.setAttribute(marker, ''), marker)
  try {
    await waitForSkin(null)
    assert.equal(await background(), native.normal)
    assert.equal((await selection()).skinId, deepOcean.id)
  } finally { await page.evaluate(marker => document.body.removeAttribute(marker), marker) }
  await waitForSkin(deepOcean.id)
  assert.equal(await background(), skin.normal)
  evidence.foreignMarkerFallback = true
  await open()
  await apply(null)
  await close()
  assert.equal(await background(), native.normal)
  assert.equal(await page.locator(scene).count(), 0)
  evidence.defaultRestored = true

  await open()
  await apply(deepOcean)
  await close()
  await appendFile(join(profileDir, 'cordis.patch.yml'), '\n- id: dsh-skin-engine\n  disabled: true\n')
  await waitForSkin(null)
  await page.locator(`${scene},style[data-dsh-skin-effects-style]`).waitFor({ state: 'detached' })
  assert.equal(await background(), native.normal)
  evidence.pluginDisabled = true
  await screenshot('composer-disabled')
}
