import { readFile, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

export const categories = ['navigation', 'state', 'preview', 'packages', 'usability', 'coexistence', 'performance', 'cleanup']
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value)
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const nonempty = value => typeof value === 'string' && value.trim().length > 0

/** Evidence completeness only; never infers a real UI pass from unit tests or metadata. */
export async function checkNavigationRelease(report, directory, inspect = async file => (await stat(file)).isFile()) {
  const errors = []
  const require = (condition, message) => { if (!condition) errors.push(message) }
  require(report?.schema === 1, 'schema must be 1')
  require(sha(report?.candidate), 'candidate must be an exact Git SHA')
  require(nonempty(report?.archive), 'archive path required')
  require(digest(report?.archiveSha256), 'archive SHA-256 required')
  for (const dependency of ['NAV05', 'SYS01']) {
    const entry = report?.dependencies?.[dependency]
    require(entry?.status === 'merged' && sha(entry?.commit), `${dependency}: merged commit required`)
  }
  require(report?.review?.status === 'passed' && report.review.candidate === report?.candidate,
    'review must pass against the exact candidate')
  require(Array.isArray(report?.exceptions) && report.exceptions.length === 0, 'unresolved exceptions block final completion')
  async function files(paths, label) {
    require(Array.isArray(paths) && paths.length > 0, `${label}: evidence files required`)
    for (const path of Array.isArray(paths) ? paths : []) {
      if (!nonempty(path)) { errors.push(`${label}: invalid evidence path`); continue }
      try { require(await inspect(resolve(directory, path)), `${label}: not a file: ${path}`) }
      catch { errors.push(`${label}: missing file: ${path}`) }
    }
  }
  await files(report?.review?.evidence, 'review')
  for (const platform of ['web', 'windows']) {
    const run = report?.runs?.[platform]
    require(run?.candidate === report?.candidate && sha(run?.candidate), `${platform}: candidate mismatch`)
    require(run?.archiveSha256 === report?.archiveSha256 && digest(run?.archiveSha256), `${platform}: archive mismatch`)
    require(run?.hostVersion === '0.2.2-rc.1', `${platform}: exact target host version required`)
    for (const category of categories) {
      const entry = run?.checks?.[category]
      require(entry?.status === 'passed', `${platform}/${category}: not passed`)
      require(nonempty(entry?.notes), `${platform}/${category}: observations required`)
      await files(entry?.evidence, `${platform}/${category}`)
    }
  }
  return { complete: errors.length === 0, errors }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const path = resolve(process.argv[2] || 'docs/navigation-release-evidence.json')
    const report = JSON.parse(await readFile(path, 'utf8'))
    const result = await checkNavigationRelease(report, dirname(path))
    // Hash the actual common tarball, not a filename or caller's claim.
    if (nonempty(report?.archive)) {
      try {
        const archive = resolve(dirname(path), report.archive)
        if (!(await stat(archive)).isFile()) throw new Error('archive path must point to a file')
        const hash = createHash('sha256')
        for await (const chunk of createReadStream(archive)) hash.update(chunk)
        if (hash.digest('hex') !== report.archiveSha256) throw new Error('actual archive SHA-256 mismatch')
      } catch (error) { result.errors.push(error.message); result.complete = false }
    }
    console.log(JSON.stringify(result, null, 2))
    process.exitCode = result.complete ? 0 : 1
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
