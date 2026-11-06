// npm run check:privacy — fails if app code or dependencies break the privacy promise.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { configProblems, sourceProblems } from './lib/privacy.mjs'
import { readVersionFiles } from './lib/versions.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Every file under `dir` with one of `extensions`. */
function filesIn(dir, extensions) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      return filesIn(path, extensions)
    }
    return extensions.some(ext => name.endsWith(ext)) ? [path] : []
  })
}

const sources = [join(root, 'index.html'), ...filesIn(join(root, 'src'), ['.js', '.mjs', '.css', '.html'])]
const problems = [
  ...sources.flatMap(path => sourceProblems(relative(root, path), readFileSync(path, 'utf8'))),
  ...configProblems(readVersionFiles(root)),
]

if (problems.length > 0) {
  console.error('Privacy check failed:')
  for (const problem of problems) {
    console.error(`  - ${problem}`)
  }
  process.exit(1)
}
console.log(`Privacy check passed (${sources.length} source files, dependencies and config).`)
