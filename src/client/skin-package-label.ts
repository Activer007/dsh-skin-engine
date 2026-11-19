import type { SkinChoice } from './skin-api.js'
import type { TranslateSettings } from './settings-copy.js'

export function packageLabel(choice: SkinChoice, t: TranslateSettings) {
  const source = t(choice.source === 'built-in' ? 'builtin' : choice.managed ? 'imported' : 'local')
  const classic = choice.manifest.id === 'com.dsh.skin.deep-ocean' || choice.manifest.id === 'com.dsh.skin.aurora'
  return classic ? `${t('classicEdition')} · ${source}` : source
}
