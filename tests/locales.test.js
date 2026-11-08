import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { TABLES, lines, listOf, setCustomLines, setLanguage, t } from '../src/i18n.js'
import { customLines } from '../src/library.js'

const root = join(import.meta.dirname, '..')
const en = TABLES.en
const placeholders = text => [...String(text).matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort()
const read = path => readFileSync(join(root, path), 'utf8')
const filesIn = (dir, extension) => readdirSync(join(root, dir)).filter(name => name.endsWith(extension)).map(name => read(join(dir, name)))

describe('every language says everything', () => {
  for (const [code, table] of Object.entries(TABLES)) {
    test(`${code}: the same keys as English, with the same placeholders`, () => {
      expect(Object.keys(table).sort()).toEqual(Object.keys(en).sort())
      for (const [key, value] of Object.entries(en)) {
        const theirs = table[key]
        if (Array.isArray(value)) {
          expect(Array.isArray(theirs), key).toBe(true)
          expect(theirs.length, key).toBeGreaterThan(0)
          expect(theirs.every(line => typeof line === 'string' && line.trim() !== ''), key).toBe(true)
        } else {
          expect(typeof theirs, key).toBe('string')
          expect(theirs.trim(), key).not.toBe('')
          expect(placeholders(theirs), key).toEqual(placeholders(value))
        }
      }
    })
  }
})

describe('every key the app uses exists', () => {
  test('the Rust menu, dialogs and problems', () => {
    const rust = filesIn('src-tauri/src', '.rs').join('\n')
    const keys = [...rust.matchAll(/"((?:menu|dialog|problem)\.[\w.]+)"/g)].map(match => match[1])
    expect(keys.length).toBeGreaterThan(30)
    // Built from ids: menu.size.<size>, menu.agent.<mode>.
    keys.push(...['small', 'medium', 'large'].map(id => `menu.size.${id}`), ...['off', 'on', 'auto'].map(id => `menu.agent.${id}`))
    for (const key of keys) {
      expect(en[key], key).toBeTypeOf('string')
    }
  })

  test('the front end and its page', () => {
    const js = filesIn('src', '.js').join('\n')
    const keys = [...js.matchAll(/\b(?:t|text|lines)\(\s*'([a-z][\w.]+)'/g)].map(match => match[1])
    keys.push(...[...read('index.html').matchAll(/data-i18n="([\w.]+)"/g)].map(match => match[1]))
    expect(keys.length).toBeGreaterThan(40)
    for (const key of keys) {
      expect(en[key], key).toBeDefined()
    }
    // Built from ids.
    for (const id of ['idle', 'sway', 'bop', 'sleepy']) {
      expect(en[`vibe.${id}`]).toBeTypeOf('string')
    }
    for (const minutes of [30, 60, 90, 120]) {
      expect(en[`reminder.span.${minutes}`]).toBeTypeOf('string')
    }
  })
})

describe('the user’s own lines', () => {
  test('mix with hers in whatever language she speaks, moments included', () => {
    try {
      setCustomLines([customLines({ wave: ['Yo!'], cheer: ['Yatta!'] })])
      setLanguage('ja')
      expect(lines('moment.wave.line')).toEqual(['やっほー 👋', 'Yo!'])
      expect(lines('lines.cheer')).toContain('Yatta!')
      expect(lines('lines.cheer')).toContain('完了！おつかれさま〜')
      setCustomLines([customLines({ mode: 'replace', wave: ['Yo!'] })])
      expect(lines('moment.wave.line')).toEqual(['Yo!'])
    } finally {
      setCustomLines([])
      setLanguage('en')
    }
  })
})

describe('switching language', () => {
  test('fills placeholders, falls back to English, and lists the local way', () => {
    try {
      setLanguage('ja')
      expect(t('menu.everyMinutes', { n: 30 })).toBe('30分ごと')
      expect(listOf(['a', 'b', 'c'], 2)).toBe('a、b ほか 1 個')
      setLanguage('zh-Hant')
      expect(t('menu.quit')).toBe('結束 YDCP')
      expect(t('no.such.key')).toBe('no.such.key')
      expect(setLanguage('fr')).toBe('en')
      expect(t('menu.quit')).toBe('Quit YDCP')
    } finally {
      setLanguage('en')
    }
  })
})
