import test from 'node:test'
import assert from 'node:assert/strict'
import { categories, checkNavigationRelease } from '../scripts/acceptance/navigation-release-gate.mjs'
function fixture() {
  const candidate = 'a'.repeat(40), archiveSha256 = 'b'.repeat(64)
  return { schema: 1, candidate, archive: 'candidate.tgz', archiveSha256, exceptions: [],
    dependencies: Object.fromEntries(['NAV05', 'SYS01'].map(key => [key, { status: 'merged', commit: 'c'.repeat(40) }])),
    review: { status: 'passed', candidate, evidence: ['review.txt'] },
    runs: Object.fromEntries(['web', 'windows'].map(key => [key, { candidate, archiveSha256, hostVersion: '0.2.2-rc.1',
      checks: Object.fromEntries(categories.map(category => [category, { status: 'passed', notes: 'Observed result', evidence: ['result.json', 'screenshot.png'] }])) }])) }
}
const check = report => checkNavigationRelease(report, '.', async () => true)
test('complete matching metadata is eligible, not a substitute for real observations', async () => assert.equal((await check(fixture())).complete, true))
test('missing prerequisites cannot be passed by old PR46 evidence', async () => {
  const report = fixture(); report.dependencies.NAV05.status = 'pending'; delete report.dependencies.SYS01
  assert.equal((await check(report)).complete, false)
})
test('different candidates or archives block same-candidate acceptance', async () => {
  const report = fixture(); report.runs.windows.candidate = 'd'.repeat(40); report.runs.web.archiveSha256 = 'e'.repeat(64)
  const result = await check(report); assert(result.errors.some(x => x.includes('candidate mismatch'))); assert(result.errors.some(x => x.includes('archive mismatch')))
})
test('pending, waived, missing and empty evidence cannot silently pass', async () => {
  for (const status of ['pending', 'waived', 'blocked', undefined]) {
    const report = fixture(); report.runs.web.checks.preview.status = status
    assert.equal((await check(report)).complete, false)
  }
  const report = fixture(); report.runs.windows.checks.packages.evidence = []
  assert.equal((await check(report)).complete, false)
  assert.equal((await checkNavigationRelease(fixture(), '.', async () => false)).complete, false)
})
test('review on a prior revision, unresolved issues, and unsupported host block completion', async () => {
  const report = fixture(); report.review.candidate = 'd'.repeat(40); report.exceptions = ['native save not run']; report.runs.windows.hostVersion = '0.2.2-rc.3'
  assert.equal((await check(report)).complete, false)
})
test('malformed or absent reports fail closed without throwing', async () => {
  for (const report of [null, {}, { runs: {}, review: { evidence: [null] } }]) assert.equal((await check(report)).complete, false)
})

test('archive path and observations cannot be blank', async () => {
  const report = fixture()
  report.archive = ' '
  report.runs.web.checks.cleanup.notes = ' '
  const { complete, errors } = await check(report)
  assert.equal(complete, false)
  assert(errors.includes('archive path required'))
  assert(errors.includes('web/cleanup: observations required'))
})

test('CLI hashes the actual common archive and rejects a changed artifact', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join, resolve } = await import('node:path')
  const { createHash } = await import('node:crypto')
  const { spawnSync } = await import('node:child_process')
  const directory = await mkdtemp(join(tmpdir(), 'nav06-gate-'))
  try {
    const report = fixture(), bytes = Buffer.from('test-only archive bytes')
    report.archive = 'candidate.tgz'; report.archiveSha256 = createHash('sha256').update(bytes).digest('hex')
    for (const run of Object.values(report.runs)) run.archiveSha256 = report.archiveSha256
    for (const file of ['review.txt', 'result.json', 'screenshot.png']) await writeFile(join(directory, file), 'test-only evidence')
    await writeFile(join(directory, report.archive), bytes)
    await writeFile(join(directory, 'report.json'), JSON.stringify(report))
    const run = () => spawnSync(process.execPath, [resolve('scripts/acceptance/navigation-release-gate.mjs'), join(directory, 'report.json')], { encoding: 'utf8' })
    assert.equal(run().status, 0)
    await writeFile(join(directory, report.archive), 'different artifact')
    const changed = run(); assert.equal(changed.status, 1)
    assert(JSON.parse(changed.stdout).errors.includes('actual archive SHA-256 mismatch'))
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('current template records both merged dependencies and awaits final acceptance', async () => {
  const { readFile } = await import('node:fs/promises')
  const report = JSON.parse(await readFile(new URL('../docs/navigation-release-evidence.json', import.meta.url), 'utf8'))
  assert.equal(report.dependencies.NAV05.status, 'merged')
  assert.equal(report.dependencies.SYS01.status, 'merged')
  const result = await check(report)
  assert.equal(result.complete, false)
  assert(!result.errors.some(error => error.startsWith('NAV05:')))
  assert(!result.errors.some(error => error.startsWith('SYS01:')))
  assert(result.errors.includes('candidate must be an exact Git SHA'))
  assert(result.errors.includes('windows/cleanup: not passed'))
})
