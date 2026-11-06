// node scripts/checksums.mjs <out-file>   (reads ARTIFACT_PATHS, a JSON array of paths)
// Writes "sha256  file-name" lines for the installers among the build's artifacts.
// Used by the release workflow on macOS and Windows alike.

import { createHash } from 'node:crypto'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'

const INSTALLERS = ['.dmg', '.exe', '.msi']

const out = process.argv[2]
const paths = JSON.parse(process.env.ARTIFACT_PATHS ?? '[]')
const lines = paths
  .filter(path => INSTALLERS.some(ext => path.endsWith(ext)) && statSync(path).isFile())
  .map(path => `${createHash('sha256').update(readFileSync(path)).digest('hex')}  ${basename(path)}`)

if (!out || lines.length === 0) {
  console.error(`No installers found to checksum in: ${paths.join(', ') || '(none)'}`)
  process.exit(1)
}
writeFileSync(out, `${lines.join('\n')}\n`)
console.log(lines.join('\n'))
