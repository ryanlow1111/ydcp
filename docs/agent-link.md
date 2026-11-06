# AI agent link (optional)

> 🚧 The agent link arrives in v0.1. This page describes how it will work.

You don't need this to use YDCP. It lets an AI coding agent, or any script, make your companion react, for example cheering when a task finishes. It works through one small local file, with no network.

**It's off when you install YDCP.** Turn it on with **Menu → React to agent**:

| Setting | Behaviour |
|---|---|
| **Off** (default) | YDCP never reads the file |
| **On** | YDCP watches the file and reacts |
| **Auto** | Like On, but only while the file exists |

## The file

| OS | Path |
|---|---|
| macOS | `~/.ydcp/state.json` |
| Windows | `%USERPROFILE%\.ydcp\state.json` |

The smallest valid file:
```json
{ "mood": "done" }
```

| Field | Values | Effect |
|---|---|---|
| `mood` (required) | `done` | She cheers (the built-in Cheer, or the motion marked `onDone`) |
| | `working`, `idle`, `failed` | She keeps vibing (reserved for future reactions) |
| | `sleepy` | She gets sleepy |
| `line` | Any short text | She says it in her bubble |
| `at` | Milliseconds since 1970 | When it was written. Optional; YDCP also uses the file's change time |

- Unknown fields are ignored, so tools can add their own.
- A file that hasn't changed for 30 minutes is ignored, so a crashed tool can't leave her stuck.
- YDCP only reads this file; it never writes it.

## Examples

- **Claude Code hooks:** [`integrations/claude-code-hooks/`](../integrations/claude-code-hooks/)
- **Claude desktop mod:** [`integrations/claude-desktop-mod/`](../integrations/claude-desktop-mod/)
- **Any script:** [`integrations/generic/`](../integrations/generic/)

> YDCP is an independent project. It is not affiliated with, endorsed by, or sponsored by Anthropic or any AI company. Claude and Claude Code are trademarks of Anthropic, PBC.
