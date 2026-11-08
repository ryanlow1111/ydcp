// Her words and the app's text in English, Japanese, Simplified and Traditional Chinese. The
// same files (src/locales/*.json) give the Rust menu its words, so the two always agree. The
// language follows the system unless Menu → Language picks one; the app tells us which.

import en from './locales/en.json' with { type: 'json' }
import ja from './locales/ja.json' with { type: 'json' }
import zhHans from './locales/zh-Hans.json' with { type: 'json' }
import zhHant from './locales/zh-Hant.json' with { type: 'json' }
import { LINE_CATEGORIES, layeredLines } from './library.js'

export const TABLES = { en, ja, 'zh-Hans': zhHans, 'zh-Hant': zhHant }

let current = 'en'
/** The user's own lines: [shared ~/.ydcp/lines.json, the model's profile], each checked by customLines. */
let customLayers = []
const categoryOf = Object.fromEntries(Object.entries(LINE_CATEGORIES).map(([category, key]) => [key, category]))

/** Sets the user's own lines, applied in order over hers (see customLines in library.js). */
export function setCustomLines(layers) {
  customLayers = layers.filter(Boolean)
}

/** Switches language (unknown codes mean English). Returns the language now in use. */
export function setLanguage(code) {
  current = TABLES[code] ? code : 'en'
  return current
}

export const language = () => current

/** The text for `key`, with `{name}` placeholders filled from `values`. English if missing. */
export function t(key, values = {}) {
  const text = TABLES[current][key] ?? en[key]
  if (typeof text !== 'string') {
    return key
  }
  return text.replace(/\{(\w+)\}/g, (whole, name) => (name in values ? String(values[name]) : whole))
}

/**
 * A list of lines for `key` (her greetings, musings, a moment's line…): hers in the current
 * language (English if missing), with the user's own lines added or swapped in.
 */
export function lines(key) {
  const value = TABLES[current][key] ?? en[key]
  const builtIn = Array.isArray(value) ? value : typeof value === 'string' ? [value] : []
  const category = categoryOf[key]
  return category ? layeredLines(builtIn, customLayers, category) : builtIn
}

/** Names joined in this language ("a, b and 3 more"), at most `most` shown. */
export function listOf(names, most = 10) {
  const join = items => items.join(t('list.separator'))
  return names.length > most ? t('list.more', { list: join(names.slice(0, most)), n: names.length - most }) : join(names)
}

/** Fills every element with a `data-i18n` attribute (its text) or `data-i18n-title` (its tooltip). */
export function translatePage(root = document) {
  document.documentElement.lang = current
  for (const element of root.querySelectorAll('[data-i18n]')) {
    element.textContent = t(element.dataset.i18n)
  }
  for (const element of root.querySelectorAll('[data-i18n-title]')) {
    element.title = t(element.dataset.i18nTitle)
  }
}
