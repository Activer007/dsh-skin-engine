import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { cpus, platform, release } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { settings, switchSkins } from './browser.mjs'
import { checkAppearanceNavigation } from './appearance-navigation.mjs'
import { appearanceReport, checkAppearance } from './appearance.mjs'
import { checkArtwork } from './artwork.mjs'
import { checkCatalogueCache, seedCatalogue } from './catalogue.mjs'
import { checkCharacterSamples } from './character-samples.mjs'
import { checkDualAppearance } from './dual-appearance.mjs'
import { checkAmbientPreferences, checkAmbientProvider, checkEffectsRuntime, checkSettingsEffects } from './effects-runtime.mjs'
import { identify, prepareHost, redact } from './hosts.mjs'
import { checkPackages, checkSample } from './packages.mjs'
import { performanceComparison, visibilityCycle } from './rendering.mjs'
import { checkSceneMotion } from './scene-motion.mjs'
import { checkSceneSamples } from './scenes.mjs'
import { checkSettingsLocale, installLocaleFixture } from './settings-locale.mjs'
import { checkSettingsGallery } from './settings-gallery.mjs'
import { checkSettingsIntegration, checkSettingsLoading, holdInitialCatalogue, seedSettingsIntegration } from './settings-integration.mjs'
import { checkSettingsPackages } from './settings-packages.mjs'
import { checkSettingsState } from './settings-state.mjs'
import { checkSettingsControls, checkSettingsTabs } from './settings-tabs.mjs'
import { checkSurfaces, seedSurfaceHistory } from './surfaces.mjs'
import { installTokenProbe } from './token-probe.mjs'
import { checkTokens } from './tokens.mjs'
import { saveOldSelection, verifyUpgrade } from './upgrade.mjs'
import { checkPackageUpdates } from './updates.mjs'

const { values: options } = parseArgs({ options: {
  platform: { type: 'string' },
  archive: { type: 'string' },
  'from-archive': { type: 'string' },
  'sample-dir': { type: 'string' },
  'sample-zip': { type: 'string' },
  'catalogue-baseline': { type: 'boolean', default: false },
  'provider-demo': { type: 'boolean', default: false },
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
const catalogueCache = options.suite === 'catalogue-cache'
const characters = options.suite === 'character-samples'
const packageUpdate = options.suite === 'package-update'
const appearance = options.suite === 'appearance'
const dual = options.suite === 'dual-appearance'
const effects = options.suite === 'effects-runtime'
const ambientPreferences = options.suite === 'ambient-preferences'
const settingsIntegration = options.suite === 'settings-integration'
const settingsLocale = settingsIntegration || options.suite === 'settings-locale'
const navigation = options.suite === 'settings-navigation'
const settingsState = navigation || settingsIntegration || options.suite === 'settings-state'
const settingsTabs = settingsIntegration || options.suite === 'settings-tabs'
const settingsGallery = settingsIntegration || options.suite === 'settings-gallery'
const settingsEffects = settingsIntegration || options.suite === 'settings-effects'
const settingsPackages = settingsIntegration || options.suite === 'settings-packages'
const settingsControls = settingsIntegration || options.suite === 'settings-controls'
const sceneMotion = options.suite === 'scene-motion'
const artwork = options.suite === 'artwork'
const tokens = options.suite === 'tokens'
const previewsOnly = options.suite === 'scene-previews'
const scenes = previewsOnly || options.suite === 'scenes'
const cssSample = options.suite === 'css-sample'
const sample = cssSample || options.suite === 'static-sample'
assert(upgrade || packages || catalogueCache || packageUpdate || appearance || dual || artwork || scenes || characters || sample || tokens || effects || ambientPreferences || settingsLocale || settingsState || settingsTabs || settingsGallery || settingsEffects || settingsPackages || settingsControls || sceneMotion || options.suite === 'surfaces'
  || suites.every(suite => supported.includes(suite)), 'Unknown suite')
assert(!upgrade || (desktop && options['from-archive']), 'Upgrade needs Desktop and --from-archive')
assert(!(packages || scenes || characters || tokens) || options['sample-dir'], 'Package, scene, and token acceptance need --sample-dir')
assert(!(sample || sceneMotion || settingsGallery) || options['sample-zip'], 'Sample acceptance needs --sample-zip')
assert(!appearance || !desktop, 'Appearance acceptance targets the official Web host')
assert(!options['provider-demo'] || effects, 'Provider demonstration needs --suite effects-runtime')
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
const settingsChecks = settingsLocale || settingsState || settingsTabs || settingsGallery || settingsEffects || settingsPackages || settingsControls
const interruption = appearance || dual || artwork || scenes || characters || tokens || effects || ambientPreferences || settingsChecks || sceneMotion || catalogueCache ? new AbortController() : undefined
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

async function enter(open, lifecycle, appearance, loading) {
  session = await open(lifecycle, loading && holdInitialCatalogue)
  session.page.on('pageerror', error => run.pageErrors.push(redact(error.message)))
  if (navigation) {
    run.consoleErrors = []
    session.page.on('console', message => {
      if (message.type() === 'error') run.consoleErrors.push(redact(message.text()))
    })
  }
  if ((tokens || dual || effects || ambientPreferences || settingsChecks || sceneMotion || catalogueCache || characters) && desktop) await session.show()
  return settings(session.page, desktop, appearance, loading)
}

console.log(`Acceptance output: ${directory}`)
try {
  run.artifact = await identify(options.archive, run.hostVersion)
  const firstArchive = upgrade ? resolve(options['from-archive']) : options.archive
  const firstArtifact = upgrade ? await identify(firstArchive, run.hostVersion) : run.artifact
  if (interruption) run.gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const { open, install, installLocalBundle, profileDir } = await prepareHost(
    { ...options, archive: firstArchive, signal: interruption?.signal }, directory, firstArtifact, run.web,
  )
  const openInProfile = async appearance => {
    if (session) { await session.close(); session = undefined }
    const ui = await enter(open, cssSample && appearance !== null, appearance)
    return { ui, foreground: session.show, hide: session.hide, browser: session.browser, resize: session.resize }
  }
  async function enterSettings() {
    if (!settingsIntegration || !ui) {
      const loading = settingsIntegration ? async context => {
        run.settingsLoading = await checkSettingsLoading(context, directory)
      } : undefined
      ui = await enter(open, false, undefined, loading)
      return ui
    }
    if (await ui.panel.isVisible()) await ui.close()
    return ui
  }
  if (navigation || includes('surfaces') || sample || artwork || scenes || characters || tokens || dual || sceneMotion) {
    await seedSurfaceHistory(directory, profileDir, { bilingual: scenes || characters || sceneMotion, secondTurn: tokens })
  }
  if (tokens) {
    await installTokenProbe(directory, installLocalBundle)
    const tokensUi = await enter(open, false)
    run.tokens = {}
    await checkTokens(session, tokensUi, resolve(options['sample-dir']), profileDir, run.tokens)
    interruption.signal.throwIfAborted()
  }
  if (settingsIntegration) {
    await seedSettingsIntegration(profileDir)
    await installTokenProbe(directory, installLocalBundle)
  }
  if (dual) {
    run.dualAppearance = {}
    await checkDualAppearance(openInProfile, directory, run.dualAppearance, desktop)
    interruption.signal.throwIfAborted()
    console.log('Verified dual appearance, decoded artwork, saved preferences, restart, and Default')
  }
  if (effects) {
    const effectsUi = await enter(open, true)
    run.effects = {}
    await checkEffectsRuntime(session, effectsUi, seconds, run.effects, options['provider-demo'])
    interruption.signal.throwIfAborted()
    console.log('Verified the eight-effect scene, native visibility, GPU fallback, and Default')
    if (options['provider-demo']) {
      run.providerDemo = {}
      await checkAmbientProvider(effectsUi, directory, run.providerDemo)
      interruption.signal.throwIfAborted()
      console.log('Verified the ambient Provider, one owned layer, Static pause, and Default')
    }
  }
  if (ambientPreferences) {
    const ambientUi = await enter(open, false)
    run.ambientPreferences = {}
    const previous = options['from-archive'] && resolve(options['from-archive'])
    const stop = async () => {
      await session.close()
      assert(!session.browser.isConnected())
      session = undefined
    }
    const rollback = previous ? {
      async installOld() {
        await stop()
        run.fromArtifact = await identify(previous, run.hostVersion)
        await install(previous, run.fromArtifact)
        return enter(open, false, null)
      },
      async restore(restoreSelection) {
        await stop()
        await restoreSelection()
        return enter(open, false, null)
      },
    } : undefined
    await checkAmbientPreferences(ambientUi, directory, profileDir, run.ambientPreferences, rollback, session.show)
    interruption.signal.throwIfAborted()
    console.log('Verified environment light preferences, legacy ZIP and native restoration')
  }
  if (settingsLocale) {
    await installLocaleFixture(directory, installLocalBundle)
    const localeUi = await enterSettings()
    run.settingsLocale = {}
    await checkSettingsLocale(localeUi, session, directory, run.settingsLocale)
    interruption.signal.throwIfAborted()
    console.log('Verified host language switching without losing a draft or preview')
  }
  if (settingsState) {
    const stateUi = await enterSettings()
    run.settingsState = {}
    await checkSettingsState(stateUi, directory, run.settingsState, session.show)
    interruption.signal.throwIfAborted()
    console.log('Verified draft lifetime, native language change, and revision conflict recovery')
  }
  if (navigation) {
    run.navigation = {}
    await checkAppearanceNavigation(ui, session, profileDir, directory, run.navigation)
    run.hostLog = session.logs()
    interruption.signal.throwIfAborted()
    console.log('Verified native appearance entry, locale and active panel disposal')
  }
  if (settingsTabs) {
    const tabsUi = await enterSettings()
    run.settingsTabs = {}
    await checkSettingsTabs(tabsUi, session, directory, run.settingsTabs)
    interruption.signal.throwIfAborted()
    console.log('Verified keyboard tabs, responsive details, and cross-page preview')
  }
  if (settingsGallery) {
    const galleryUi = await enterSettings()
    run.settingsGallery = {}
    await checkSettingsGallery(galleryUi, session, resolve(options['sample-zip']), directory, run.settingsGallery)
    if (settingsIntegration) {
      run.settingsIntegration = {}
      await checkSettingsIntegration(galleryUi, session, resolve(options['sample-zip']), directory, run.settingsIntegration)
    }
    interruption.signal.throwIfAborted()
    console.log('Verified the skin gallery, dual previews, and responsive details')
  }
  if (settingsEffects) {
    const effectsUi = await enterSettings()
    run.settingsEffects = {}
    await checkSettingsEffects(effectsUi, session, directory, run.settingsEffects)
    interruption.signal.throwIfAborted()
    console.log('Verified all nine controls, preference scope, renderer fallback, and window modes')
  }
  if (settingsPackages) {
    const packagesUi = await enterSettings()
    run.settingsPackages = {}
    await checkSettingsPackages(packagesUi, session, directory, run.settingsPackages)
    interruption.signal.throwIfAborted()
    console.log('Verified package actions, cross-page upload, cancellation, and Host readback')
  }
  if (settingsControls) {
    const controlsUi = await enterSettings()
    run.settingsControls = {}
    await checkSettingsControls(controlsUi, session, directory, run.settingsControls)
    interruption.signal.throwIfAborted()
    console.log('Verified DSH primitives, keyboard focus, and light, dark and forced colors')
  }
  if (sceneMotion) {
    const motionUi = await enter(open, false)
    run.sceneMotion = {}
    await checkSceneMotion(session, motionUi, resolve(options['sample-zip']), directory, run.sceneMotion)
    interruption.signal.throwIfAborted()
    console.log('Verified artwork motion, cabin light, static fallbacks, and Default')
  }
  if (scenes) {
    const scenesUi = await enter(open, false)
    run.scenes = {}
    await checkSceneSamples(session, scenesUi, resolve(options['sample-dir']), directory, run.scenes, previewsOnly)
    interruption.signal.throwIfAborted()
  }
  if (characters) {
    const charactersUi = await enter(open, false)
    run.characters = {}
    await checkCharacterSamples(session, charactersUi, resolve(options['sample-dir']), directory, run.characters)
    interruption.signal.throwIfAborted()
  }
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
  if (catalogueCache) {
    if (!desktop) await seedCatalogue(profileDir, 0, 10)
    run.catalogueCache = { baseline: options['catalogue-baseline'] }
    await checkCatalogueCache(await openInProfile('dark'), profileDir, run.catalogueCache, options['catalogue-baseline'])
    interruption.signal.throwIfAborted()
    console.log('Verified 10/100-package catalogue reads and lazy previews')
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
    try {
      if (effects || ambientPreferences || settingsChecks || sceneMotion || catalogueCache || characters) await save()
    } finally { await session?.close() }
    if ((artwork || scenes || tokens || dual || effects || ambientPreferences || settingsChecks || sceneMotion || catalogueCache || characters) && session) run.browserDisconnected = !session.browser.isConnected()
  } finally {
    if (interruption) {
      process.off('SIGINT', interrupt)
      process.off('SIGTERM', interrupt)
    }
    await save()
  }
}
