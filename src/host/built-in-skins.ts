import { readFile } from 'node:fs/promises'
import { parseSkinPackage } from '../core/skin-package.js'

export const builtInSkinDirectories = [
  'deep-ocean', 'aurora', 'obsidian-neon', 'paper-light', 'mist-pine', 'night-navigator',
  'morning-observatory', 'jade-archive', 'rainline',
  'blue-arc', 'dawn-station', 'moonlit-horizon', 'crimson-rain',
] as const

async function readJson(url: URL): Promise<unknown> {
  return JSON.parse(await readFile(url, 'utf8'))
}

export async function readBuiltInSkins() {
  return Promise.all(builtInSkinDirectories.map(async directory => {
    const root = new URL(`./skins/${directory}/`, import.meta.url)
    const [manifest, tokens, effects] = await Promise.all([
      readJson(new URL('skin.json', root)),
      readJson(new URL('tokens.json', root)),
      readJson(new URL('effects.json', root)),
    ])
    return parseSkinPackage({ manifest, tokens, effects })
  }))
}
