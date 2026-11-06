// npm run check:version — fails if the version differs between package.json, Cargo.toml,
// tauri.conf.json and (in CI on a tag) the tag name.

import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readVersionFiles, versionProblems } from './lib/versions.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const tag = process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : undefined
const files = readVersionFiles(root)
const problems = versionProblems({ ...files, tag })

if (problems.length > 0) {
  console.error('Version check failed:')
  for (const problem of problems) {
    console.error(`  - ${problem}`)
  }
  process.exit(1)
}
console.log(`Version check passed: ${files.packageJson.version}${tag ? ` (tag ${tag})` : ''}`)
