import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { cpus, platform, release } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { settings, switchSkins } from './browser.mjs'
import { appearanceReport, checkAppearance } from './appearance.mjs'
import { checkArtwork } from './artwork.mjs'
import { identify, prepareHost, redact } from './hosts.mjs'
import { checkPackages, checkSample } from './packages.mjs'
import { performanceComparison, visibilityCycle } from './rendering.mjs'
import { checkSurfaces, seedSurfaceHistory } from './surfaces.mjs'
import { saveOldSelection, verifyUpgrade } from './upgrade.mjs'
import { checkPackageUpdates } from './updates.mjs'

const { values: options } = parseArgs({ options: {
  platform: { type: 'string' },
  archive: { type: 'string' },
  'from-archive': { type: 'string' },
  'sample-dir': { type: 'string' },
  'sample-zip': { type: 'string' },
  'host-version': { type: 'string' },
  'web-cli': { type: 'string' },
  chrome: { type: 'string' },
  'desktop-exe': { type: 'string' },
  'desktop-disable-occlusion': { type: 'boolean', default: false },
  output: { type: 'string', default: '.cache/acceptance' },
  suite: { type: 'string', default: 'all' },
  switches: { type: 'string', default: '20' },
  'hidden-seconds': { type: 'string', default: '100' },
} })

assert(['web', 'desktop'].includes(options.platform), 'Use --platform web or --platform desktop')
assert(options.archive && options['host-version'], 'Pass --archive and --host-version')
const supported = ['switch', 'performance', 'lifecycle']
const suites = options.suite === 'all' ? supported : options.suite.split(',')
const desktop = options.platform === 'desktop'
const upgrade = options.suite === 'upgrade'
const packages = options.suite === 'packages'
const packageUpdate = options.suite === 'package-update'
const appearance = options.suite === 'appearance'
const artwork = options.suite === 'artwork'
const cssSample = options.suite === 'css-sample'
const sample = cssSample || options.suite === 'static-sample'
assert(upgrade || packages || packageUpdate || appearance || artwork || sample || options.suite === 'surfaces'
  || suites.every(suite => supported.includes(suite)), 'Unknown suite')
assert(!upgrade || (desktop && options['from-archive']), 'Upgrade needs Desktop and --from-archive')
assert(!packages || options['sample-dir'], 'Package acceptance needs --sample-dir')
assert(!sample || options['sample-zip'], 'Sample acceptance needs --sample-zip')
assert(!appearance || !desktop, 'Appearance acceptance targets the official Web host')
assert(desktop ? process.platform === 'win32' && options['desktop-exe'] : options['web-cli'] && options.chrome,
  'Desktop needs Windows and --desktop-exe. Web needs --web-cli and --chrome.')
const count = Number(options.switches)
const seconds = Number(options['hidden-seconds'])
assert(Number.isSafeInteger(count) && count > 0 && count <= 1000, 'Expected 1–1000 switches')
assert(Number.isSafeInteger(seconds) && seconds > 0 && seconds <= 3600, 'Expected 1–3600 hidden seconds')
options.archive = resolve(options.archive)
const output = resolve(options.output)
await mkdir(output, { recursive: true })
const directory = await mkdtemp(join(output, `${options.platform}-`))
const run = {
  platform: options.platform, hostVersion: options['host-version'], suite: options.suite,
  switches: count, hiddenSeconds: seconds, startedAt: new Date().toISOString(),
  desktopOcclusionDisabledForPerformance: desktop && options['desktop-disable-occlusion'],
  machine: { platform: platform(), release: release(), cpu: cpus()[0]?.model, node: process.version },
  pageErrors: [],
}
if (!desktop) run.web = { launches: [] }
const interruption = appearance || artwork ? new AbortController() : undefined
if (appearance) run.appearance = appearanceReport()
const save = () => writeFile(join(directory, 'result.json'), JSON.stringify(run, null, 2) + '\n')
const includes = name => suites.includes(name)
let session
let ui

function interrupt(signal) {
  interruption.abort(new Error(`Acceptance interrupted by ${signal}`))
  void session?.close().catch(() => {})
}
if (interruption) {
  process.on('SIGINT', interrupt)
  process.on('SIGTERM', interrupt)
}

async function enter(open, lifecycle, appearance) {
  session = await open(lifecycle)
  session.page.on('pageerror', error => run.pageErrors.push(redact(error.message)))
  return settings(session.page, desktop, appearance)
}

console.log(`Acceptance output: ${directory}`)
try {
  run.artifact = await identify(options.archive, run.hostVersion)
  const firstArchive = upgrade ? resolve(options['from-archive']) : options.archive
  const firstArtifact = upgrade ? await identify(firstArchive, run.hostVersion) : run.artifact
  if (appearance || artwork) run.gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const { open, install, profileDir } = await prepareHost(
    { ...options, archive: firstArchive, signal: interruption?.signal }, directory, firstArtifact, run.web,
  )
  const openInProfile = async appearance => {
    if (session) { await session.close(); session = undefined }
    const ui = await enter(open, cssSample && appearance !== null, appearance)
    return { ui, foreground: session.show, hide: session.hide, browser: session.browser, resize: session.resize }
  }
  if (includes('surfaces') || sample || artwork) await seedSurfaceHistory(directory, profileDir)
  if (artwork) {
    const artworkUi = await enter(open, false)
    run.artwork = {}
    await checkArtwork(session, artworkUi, directory, profileDir, run.artwork, desktop)
    interruption.signal.throwIfAborted()
  }
  if (appearance) {
    await checkAppearance(run.appearance, openInProfile, interruption.signal)
    await session.close()
    session = undefined
    interruption.signal.throwIfAborted()
    assert.equal(run.web.launches.length, 2)
    assert.notEqual(run.web.launches[0].pid, run.web.launches[1].pid)
    for (const { closed } of run.web.launches) {
      assert(closed?.browserDisconnected && (closed.signal || closed.code !== null), 'Web fixture did not exit')
    }
    console.log('Verified native appearance, rollback, and restoration after Web host restart')
  }
  if (sample) {
    run.sample = {}
    await checkSample(resolve(options['sample-zip']), directory, run.sample, openInProfile, cssSample)
  }
  if (packageUpdate) {
    run.packageUpdate = {}
    await checkPackageUpdates(run.packageUpdate, async appearance => (await openInProfile(appearance)).ui)
  }
  if (packages) {
    run.packages = {}
    await checkPackages(resolve(options['sample-dir']), profileDir, run.packages, openInProfile)
  }
  if (upgrade) {
    run.fromArtifact = firstArtifact
    ui = await enter(open, false)
    const before = await saveOldSelection(ui)
    run.beforeUpgrade = before
    await save()
    await session.close()
    session = undefined
    await install(options.archive, run.artifact)
    ui = await enter(open, false)
    run.upgrade = await verifyUpgrade(ui, run.artifact.version, before)
    console.log(`Verified Desktop upgrade from ${firstArtifact.version} to ${run.artifact.version}`)
  }
  if (includes('switch') || includes('performance') || includes('surfaces')) {
    ui = await enter(open, false)
    if (includes('surfaces')) {
      run.surfaces = {}
      await checkSurfaces(session, ui, directory, profileDir, run.surfaces)
      await save()
    }
    if (includes('switch')) {
      run.switching = await switchSkins(ui, count)
      await save()
      console.log(`Verified ${count} saved skin switches and transient preview`)
    }
    if (includes('performance')) {
      run.performance = {}
      await performanceComparison(ui, run.performance, session.show)
      await save()
    }
  }
  if (includes('lifecycle')) {
    if (session) { await session.close(); session = undefined }
    ui = await enter(open, true)
    run.lifecycle = {}
    await visibilityCycle(session, ui, seconds, run.lifecycle)
  }
  assert.deepEqual(run.pageErrors, [])
  run.completed = true
} catch (error) {
  run.completed = false
  const failure = interruption?.signal.reason ?? error
  run.error = redact(failure.stack ?? failure)
  if (session) {
    run.hostLog = session.logs()
    run.windowState = await session.page.evaluate(() => ({
      visibility: document.visibilityState, focused: document.hasFocus(),
      viewport: [innerWidth, innerHeight],
      skin: document.documentElement.getAttribute('data-dsh-skin-id'),
      cachedAurora: document.querySelectorAll('[data-dsh-skin-aurora-image]').length,
      rootInert: document.getElementById('root')?.inert,
      dialogs: [...document.querySelectorAll('[role="dialog"]')].map(dialog => dialog.querySelector('h1,h2,h3')?.textContent),
    })).catch(() => null)
  }
  console.error(run.error)
  process.exitCode = 1
} finally {
  try {
    await session?.close()
    if (artwork && session) run.browserDisconnected = !session.browser.isConnected()
  } finally {
    if (interruption) {
      process.off('SIGINT', interrupt)
      process.off('SIGTERM', interrupt)
    }
    await save()
  }
}
