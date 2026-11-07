// npm run check:models -- <folder or .vrm files…>
// Reports what each VRM model has and lacks, without opening the app. For testing many models
// before a release; the files stay where they are, and models are never added to the repo.
// Exits with 1 if any model has a "bad" note (she can't be shown properly).

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { inspectModel } from '../src/modelinfo.js'

const SYMBOL = { good: '✓', info: 'i', warn: '!', bad: '✗' }

/** Every .vrm among the given paths (folders are searched, not recursively). */
function modelFiles(paths) {
  return paths.flatMap(path =>
    statSync(path).isDirectory()
      ? readdirSync(path)
          .filter(name => name.toLowerCase().endsWith('.vrm'))
          .sort()
          .map(name => join(path, name))
      : [path],
  )
}

const paths = process.argv.slice(2)
if (paths.length === 0) {
  console.error('usage: npm run check:models -- <folder or .vrm files…>')
  process.exit(2)
}

const files = modelFiles(paths)
const tally = { good: 0, info: 0, warn: 0, bad: 0 }
let modelsWithProblems = 0
for (const file of files) {
  console.log(`\n${basename(file)}`)
  try {
    const bytes = readFileSync(file)
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    const { summary, notes } = inspectModel(buffer)
    const size = (summary.bytes / 1024 / 1024).toFixed(1)
    console.log(`  VRM ${summary.version ?? '?'} · ${size} MB · ${Math.round(summary.triangles / 1000)}k triangles · ${summary.expressions.length} expressions · ${summary.springs} physics bones`)
    console.log(`  Licence in file: use ${summary.licence.allowedUser ?? '?'}, redistribution ${summary.licence.redistribution ?? '?'}`)
    for (const { level, text } of notes) {
      tally[level] += 1
      console.log(`  ${SYMBOL[level]} ${text}`)
    }
    if (notes.some(note => note.level === 'bad')) {
      modelsWithProblems += 1
    }
  } catch (error) {
    tally.bad += 1
    modelsWithProblems += 1
    console.log(`  ${SYMBOL.bad} ${error.message}`)
  }
}

console.log(`\n${files.length} model${files.length === 1 ? '' : 's'}: ${tally.warn} warnings, ${tally.bad} serious problems.`)
process.exit(modelsWithProblems > 0 ? 1 : 0)
