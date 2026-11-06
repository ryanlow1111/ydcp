// node scripts/release-notes.mjs <version> > notes.md
// Release notes for GitHub: this version's CHANGELOG section plus install steps for both OS.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const version = process.argv[2]
if (!version) {
  console.error('usage: node scripts/release-notes.mjs <version>')
  process.exit(1)
}

/** The body of `## [version]` in CHANGELOG.md, up to the next `## ` heading. */
export function changelogSection(changelog, wanted) {
  const lines = changelog.split('\n')
  const start = lines.findIndex(line => line.startsWith(`## [${wanted}]`))
  if (start < 0) {
    return undefined
  }
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## '))
  return lines
    .slice(start + 1, end < 0 ? undefined : end)
    .join('\n')
    .trim()
}

const changes = changelogSection(readFileSync(join(root, 'CHANGELOG.md'), 'utf8'), version) ?? '_See CHANGELOG.md._'

console.log(`${changes}

---

### Install

| Your computer | Download |
|---|---|
| Mac (Apple Silicon or Intel) | \`YDCP_${version}_universal.dmg\` |
| Windows 10/11 (most PCs) | \`YDCP_${version}_x64-setup.exe\` (or \`.msi\`) |
| Windows on ARM | \`YDCP_${version}_arm64-setup.exe\` |

- **macOS:** this build isn't notarized by Apple yet. If macOS won't open it: **System Settings → Privacy & Security → Open Anyway**. [Full steps](docs/install-macos.md)
- **Windows:** this build isn't code-signed yet. If you see "Windows protected your PC": **More info → Run anyway**. [Full steps](docs/install-windows.md)
- **You need your own VRM model.** See [Add your model](README.md#add-your-model).
- Check your download against the \`SHA256SUMS-*.txt\` files below.

🔒 YDCP uses no internet, no account and no tracking. Nothing you add leaves your computer.`)
