// Reads the app version from every place it lives and reports any mismatch.
// package.json is the source of truth; tauri.conf.json points at it; Cargo.toml must match;
// a release tag (vX.Y.Z) must match too.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** The `version` in the [package] table of a Cargo.toml text. */
export function cargoVersion(toml) {
  const pkg = toml.split(/^\[/m).find(section => section.startsWith('package]'))
  return pkg?.match(/^version\s*=\s*"([^"]+)"/m)?.[1]
}

/**
 * Problems found, as plain sentences; empty when everything agrees.
 * `tag` is a git ref name such as "v0.1.0", or undefined when not building a tag.
 */
export function versionProblems({ packageJson, cargoToml, tauriConf, tag }) {
  const problems = []
  const want = packageJson.version
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(want ?? '')) {
    problems.push(`package.json version "${want}" is not a SemVer version (X.Y.Z).`)
  }
  const cargo = cargoVersion(cargoToml)
  if (cargo !== want) {
    problems.push(`src-tauri/Cargo.toml version "${cargo}" differs from package.json "${want}".`)
  }
  if (tauriConf.version !== '../package.json' && tauriConf.version !== want) {
    problems.push(`src-tauri/tauri.conf.json version "${tauriConf.version}" should be "../package.json".`)
  }
  if (tag !== undefined && tag.startsWith('v') && tag !== `v${want}`) {
    problems.push(`Tag "${tag}" differs from package.json version "v${want}".`)
  }
  return problems
}

/** Reads the three files from a repo root. */
export function readVersionFiles(root) {
  return {
    packageJson: JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')),
    cargoToml: readFileSync(join(root, 'src-tauri', 'Cargo.toml'), 'utf8'),
    tauriConf: JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8')),
  }
}
