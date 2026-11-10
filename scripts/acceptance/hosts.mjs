import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { access, readFile, realpath } from 'node:fs/promises'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright-core'

const packageName = 'dsh-plugin-skin-engine'
const hostProfile = 'skin-engine-acceptance'
const loopback = '127.0.0.1'
const archived = (archive, path) => execFileSync('tar', ['-xOzf', archive, `package/${path}`], { maxBuffer: 16 * 1024 * 1024 })
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

export async function identify(archive, hostVersion) {
  const manifest = JSON.parse(archived(archive, 'package.json'))
  assert.equal(manifest.name, packageName)
  assert.equal(manifest.engines.dsh, hostVersion)
  return {
    version: manifest.version,
    sha256: hash(await readFile(archive)),
    hostSha256: hash(archived(archive, 'lib/host.js')),
    clientSha256: hash(archived(archive, 'lib/client.js')),
  }
}

export function redact(message) {
  return String(message)
    .replace(/([?&#](?:token|access_token|api_key|password)=)[^&#\s"'<>]+/gi, '$1[redacted]')
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[redacted]@')
    .replace(/(\bBearer\s+)[^\s"',;]+/gi, '$1[redacted]')
}

async function until(check, label) {
  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    const value = await check()
    if (value) return value
    await delay(200)
  }
  throw Error(`Timed out waiting for ${label}`)
}

function launch(file, args, env, visible = false) {
  const child = spawn(file, args, { env, windowsHide: !visible, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  const append = chunk => { output = (output + chunk).slice(-32_768) }
  child.stdout.on('data', append)
  child.stderr.on('data', append)
  const done = once(child, 'close')
  // Startup failures also need a handler before the caller awaits the exit.
  void done.catch(() => {})
  return {
    child, done,
    logs: () => redact(output),
    output() {
      if (child.exitCode !== null) throw Error(redact(`Fixture exited early (${child.exitCode})\n${output}`))
      return output
    },
    async stop() {
      if (child.exitCode === null && child.signalCode === null) child.kill()
      await done.catch(() => {})
    },
  }
}

function command(file, args, env) {
  try {
    return execFileSync(file, args, { env, windowsHide: true, encoding: 'utf8', timeout: 120_000 })
  } catch (error) {
    throw Error(redact(error.stderr || error.stdout || error.message))
  }
}

async function port() {
  const server = createServer()
  server.listen(0, loopback)
  await once(server, 'listening')
  const assigned = server.address().port
  await new Promise((done, reject) => server.close(error => error ? reject(error) : done()))
  return assigned
}

async function inspector(portNumber, expression) {
  const targets = await (await fetch(`http://${loopback}:${portNumber}/json/list`, { signal: AbortSignal.timeout(2000) })).json()
  const target = targets.find(entry => entry.type === 'node')
  assert(target)
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  try {
    await once(socket, 'open', { signal: AbortSignal.timeout(5000) })
    const message = once(socket, 'message', { signal: AbortSignal.timeout(5000) })
    socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }))
    const [{ data }] = await message
    const reply = JSON.parse(data)
    assert(!reply.error && !reply.result.exceptionDetails, 'Desktop inspector evaluation failed')
    return reply.result.result.value
  } finally {
    socket.close()
  }
}

export async function prepareHost(options, directory, artifact, diagnostics) {
  const home = join(directory, 'home')
  const env = { ...process.env, DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1' }
  const desktop = options.platform === 'desktop'
  const executable = desktop ? await realpath(options['desktop-exe']) : process.execPath
  const cli = desktop
    ? ['--expose-internals', join(dirname(executable), 'resources', 'app.asar', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'cli.js')]
    : [await realpath(options['web-cli'])]
  const cliEnv = desktop ? { ...env, ELECTRON_RUN_AS_NODE: '1' } : env
  const version = command(executable, [...cli, '--version'], cliEnv).trim()
  if (diagnostics) diagnostics.cliVersion = version
  assert.equal(version, options['host-version'])
  const profile = desktop ? 'desktop' : hostProfile
  const profileDir = join(home, 'profiles', profile)
  const userData = join(directory, 'electron-user-data')

  async function startDesktop(lifecycle) {
    const cdp = await port()
    const main = await port()
    const flags = [`--user-data-dir=${userData}`, `--remote-debugging-port=${cdp}`, `--inspect=${loopback}:${main}`]
    if (options.suite === 'artwork') flags.push('--force-device-scale-factor=1')
    if (lifecycle || options['desktop-disable-occlusion']) flags.push('--disable-features=CalculateNativeWinOcclusion')
    const app = launch(executable, flags, env, true)
    const invoke = (action, size = { width: 1280, height: 860 }) => inspector(main, `(${function ({ action, pid, expectedHome, size }) {
      if (process.pid !== pid || process.env.DSH_HOME !== expectedHome) throw Error('Unexpected Desktop process')
      const load = process.mainModule?.require?.bind(process.mainModule)
        ?? process.getBuiltinModule('module').createRequire(process.execPath)
      const { app, BrowserWindow, screen } = load('electron')
      if (!app.isPackaged) throw Error('Expected packaged Desktop')
      if (action === 'exit') { setTimeout(() => app.quit(), 0); return true }
      const window = BrowserWindow.getAllWindows().find(item => item.webContents.getURL().startsWith('dsh-app://app/'))
      if (!window) return false
      if (action === 'hide') { window.minimize(); window.hide() }
      else {
        window.restore()
        const area = screen.getPrimaryDisplay().workArea
        const x = Math.min(74, Math.max(0, area.width - size.width))
        const y = Math.min(12, Math.max(0, area.height - size.height))
        window.setBounds({ x: area.x + x, y: area.y + y,
          width: Math.min(size.width, area.width - x), height: Math.min(size.height, area.height - y) })
        window.setAlwaysOnTop(true)
        window.show()
        window.moveTop()
        window.focus()
      }
      return true
    }})(${JSON.stringify({ action, pid: app.child.pid, expectedHome: home, size })})`)
    return {
      url: `http://${loopback}:${cdp}`, invoke, logs: app.logs,
      async ready() {
        await until(async () => {
          app.output()
          try { return await invoke('show') } catch { return false }
        }, 'the isolated Desktop window')
      },
      async close() {
        await invoke('exit').catch(() => {})
        await Promise.race([app.done.catch(() => {}), delay(3000)])
        await app.stop()
      },
    }
  }

  if (desktop) {
    const initial = await startDesktop(false)
    try {
      await initial.ready()
      await until(() => access(join(profileDir, 'package.json')).then(() => true, () => false), 'Desktop profile initialization')
    } finally { await initial.close() }
  } else {
    command(executable, [...cli, '--profile', profile, '--from-default-profile', 'web', '--dump-config'], cliEnv)
    if (diagnostics) diagnostics.profileInitialized = true
  }
  async function install(archive, expected) {
    const spec = `file:${archive.replaceAll('\\', '/')}`
    command(executable, [...cli, 'plugin', '--profile', profile, 'add', ...(desktop ? [] : ['-w']), spec], cliEnv)
    const installed = join(profileDir, 'node_modules', packageName)
    const profileManifest = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'))
    assert(profileManifest.dsh.profile.bundles.includes(packageName), 'Bundle is not enabled')
    assert.equal(JSON.parse(await readFile(join(installed, 'package.json'), 'utf8')).version, expected.version)
    for (const side of ['host', 'client']) {
      assert.equal(hash(await readFile(join(installed, 'lib', `${side}.js`))), expected[`${side}Sha256`], `Installed ${side} differs from the archive`)
    }
  }
  await install(options.archive, artifact)
  if (diagnostics) diagnostics.installedArtifactVerified = true

  async function open(lifecycle = false) {
    if (desktop) {
      const app = await startDesktop(lifecycle)
      try {
        await app.ready()
        const browser = await chromium.connectOverCDP(app.url, { timeout: 20_000, noDefaults: true })
        const page = browser.contexts().flatMap(context => context.pages()).find(tab => tab.url().startsWith('dsh-app://app/'))
        assert(page, 'Missing Desktop renderer')
        return { browser, page, logs: app.logs, hide: () => app.invoke('hide'), show: () => app.invoke('show'),
          resize: (width, height) => app.invoke('show', { width, height }),
          async close() { try { await browser.close() } finally { await app.close() } } }
      } catch (error) { await app.close(); throw error }
    }
    const signal = options.signal
    signal?.throwIfAborted()
    const app = launch(executable, [...cli, '--profile', profile, '--host', loopback, '--port', '0', '--no-open'], env)
    const started = Date.now()
    const attempt = { pid: app.child.pid, stage: 'startup-url' }
    diagnostics?.launches.push(attempt)
    let browser
    let nativeChrome
    let closing
    try {
      const launchUrl = await until(() => {
        signal?.throwIfAborted()
        return app.output().match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9._~%+-]+/)?.[0]
      }, 'the Web launch URL')
      attempt.announcedInMs = Date.now() - started
      attempt.origin = new URL(launchUrl).origin
      attempt.stage = 'browser'
      let page
      if (lifecycle) {
        const cdp = await port()
        nativeChrome = launch(resolve(options.chrome), [
          `--user-data-dir=${join(directory, 'chrome-user-data')}`, `--remote-debugging-port=${cdp}`,
          '--no-first-run', '--no-default-browser-check', '--disable-features=CalculateNativeWinOcclusion', 'about:blank',
        ], env, true)
        const origin = `http://${loopback}:${cdp}`
        await until(async () => {
          nativeChrome.output()
          try { return (await fetch(`${origin}/json/version`, { signal: AbortSignal.timeout(1000) })).ok } catch { return false }
        }, 'native Chrome CDP')
        browser = await chromium.connectOverCDP(origin, { noDefaults: true })
        page = browser.contexts()[0].pages().find(tab => tab.url() === 'about:blank')
        assert(page, 'Missing Chrome startup tab')
      } else {
        browser = await chromium.launch({
          executablePath: resolve(options.chrome), headless: ['packages', 'package-update', 'static-sample', 'css-sample', 'appearance', 'artwork'].includes(options.suite),
          ...(signal ? { handleSIGINT: false, handleSIGTERM: false } : {}),
          ignoreDefaultArgs: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
        })
        const context = await browser.newContext({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2, locale: 'zh-CN' })
        page = await context.newPage()
      }
      signal?.throwIfAborted()
      attempt.browserVersion = browser.version()
      attempt.stage = 'navigation'
      let response
      try { response = await page.goto(launchUrl) } catch { throw Error('Isolated Web navigation failed') }
      attempt.httpStatus = response?.status()
      assert(response?.ok(), `Isolated Web navigation returned HTTP ${attempt.httpStatus ?? 'unknown'}`)
      signal?.throwIfAborted()
      attempt.stage = 'ready'
      return { browser, page, logs: app.logs, close, resize: (width, height) => page.setViewportSize({ width, height }) }
    } catch (error) {
      attempt.failed = true
      attempt.exitBeforeCleanup = { code: app.child.exitCode, signal: app.child.signalCode }
      await close()
      throw error
    }
    function close() {
      return closing ??= (async () => {
        try { await browser?.close() } finally {
          await Promise.all([nativeChrome?.stop(), app.stop()])
          attempt.closed = {
            code: app.child.exitCode, signal: app.child.signalCode, browserDisconnected: browser ? !browser.isConnected() : null,
          }
          attempt.log = app.logs()
        }
      })()
    }
  }
  return { open, install, profileDir }
}
