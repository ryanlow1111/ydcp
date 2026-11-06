import { describe, expect, test } from 'vitest'
import { cargoVersion, versionProblems } from '../scripts/lib/versions.mjs'
import { configProblems, sourceProblems } from '../scripts/lib/privacy.mjs'

const cargo = version => `[package]\nname = "ydcp"\nversion = "${version}"\n\n[dependencies]\ntauri = { version = "2.12.5" }\n`
const files = (version = '0.1.0') => ({
  packageJson: { version, dependencies: {}, devDependencies: {} },
  cargoToml: cargo(version),
  tauriConf: { version: '../package.json', app: { security: { csp: "default-src 'self'" } } },
})

describe('version check', () => {
  test('reads the [package] version, not a dependency version', () => {
    expect(cargoVersion(cargo('1.2.3'))).toBe('1.2.3')
  })

  test('passes when everything agrees, with or without a matching tag', () => {
    expect(versionProblems(files())).toEqual([])
    expect(versionProblems({ ...files(), tag: 'v0.1.0' })).toEqual([])
  })

  test('catches Cargo.toml drifting from package.json', () => {
    expect(versionProblems({ ...files(), cargoToml: cargo('0.0.9') })).toHaveLength(1)
  })

  test('catches a tag that does not match', () => {
    expect(versionProblems({ ...files(), tag: 'v0.2.0' })[0]).toMatch(/Tag "v0.2.0"/)
  })

  test('catches a non-SemVer version', () => {
    const bad = files('one')
    expect(versionProblems(bad).some(problem => problem.includes('SemVer'))).toBe(true)
  })
})

describe('privacy check', () => {
  test('allows comments and allow-listed links', () => {
    const text = [
      '// see https://example.com/docs',
      ' * https://example.com/also-a-comment',
      "const link = 'https://github.com/ryanlow1111/ydcp/releases'",
    ].join('\n')
    expect(sourceProblems('a.js', text)).toEqual([])
  })

  test('flags web addresses and network APIs in code', () => {
    const text = ["fetch('https://tracker.example.com/hit')", 'const socket = new WebSocket(url)'].join('\n')
    const problems = sourceProblems('a.js', text)
    expect(problems.some(problem => problem.includes('tracker.example.com'))).toBe(true)
    expect(problems.some(problem => problem.includes('network API'))).toBe(true)
  })

  test('flags forbidden plugins, crates, a missing CSP and the updater', () => {
    const base = files()
    expect(configProblems(base)).toEqual([])
    expect(configProblems({ ...base, packageJson: { dependencies: { '@tauri-apps/plugin-http': '2' } } })).toHaveLength(1)
    expect(configProblems({ ...base, cargoToml: `${base.cargoToml}reqwest = "0.12"\n` })).toHaveLength(1)
    expect(configProblems({ ...base, cargoToml: `${base.cargoToml}tauri_plugin_updater = "2"\n` })).toHaveLength(1)
    expect(configProblems({ ...base, tauriConf: { app: { security: { csp: null } } } })).toHaveLength(1)
    expect(configProblems({ ...base, tauriConf: { ...base.tauriConf, plugins: { updater: {} } } })).toHaveLength(1)
  })
})
