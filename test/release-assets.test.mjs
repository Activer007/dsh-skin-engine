import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buffer } from 'node:stream/consumers'
import test from 'node:test'
import { fromBufferPromise } from 'yauzl'
import { packDualAppearanceFixture } from '../scripts/acceptance/dual-appearance.mjs'
import { checkExactPaths, checkReleaseAsset, examples, loadReleaseAssets } from '../scripts/release-assets.mjs'

test('release paths require the exact case and a file on disk', async t => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-release-assets-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'assets'))
  await writeFile(join(root, 'assets/day.webp'), 'fixture')
  await checkExactPaths(root, ['assets/day.webp'])
  await assert.rejects(checkExactPaths(root, ['assets/missing.webp']), /Missing file/)
  await assert.rejects(checkExactPaths(root, ['assets/day.webp', 'Assets/day.webp']), /Path spelling differs/)
  await assert.rejects(checkExactPaths(root, ['assets/Day.webp']), /Path spelling differs/)
})

test('inventory checks reject unlisted or replaced assets', async () => {
  const inventory = await loadReleaseAssets()
  const key = 'src/client/probe.svg'
  const bytes = Buffer.from((await readFile(new URL(`../${key}`, import.meta.url), 'utf8')).replaceAll('\r\n', '\n'))
  checkReleaseAsset(inventory, key, bytes)
  assert.throws(() => checkReleaseAsset(inventory, 'src/client/unknown.svg', bytes), /Unlisted release asset/)
  const changed = Buffer.from(bytes.toString().replace('#3365a8', '#3365a9'))
  assert.throws(() => checkReleaseAsset(inventory, key, changed), /Asset hash differs/)
})

test('dual appearance fixture aliases the inventoried scene artwork bytes', async () => {
  const inventory = await loadReleaseAssets()
  const expected = new Map([
    ['assets/day.webp', `${examples}/scenes/morning-observatory/assets/portrait.webp`],
    ['assets/night.webp', `${examples}/scenes/night-navigator/assets/navigator.webp`],
  ])
  const zip = await fromBufferPromise(await packDualAppearanceFixture())
  try {
    const actual = []
    for await (const entry of zip.eachEntry()) {
      if (!entry.fileName.startsWith('assets/')) continue
      actual.push(entry.fileName)
      const record = inventory.get(expected.get(entry.fileName))
      assert(record, entry.fileName)
      const bytes = await buffer(await zip.openReadStreamPromise(entry))
      assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256)
    }
    assert.deepEqual(actual.sort(), [...expected.keys()].sort())
  } finally { zip.close() }
})
