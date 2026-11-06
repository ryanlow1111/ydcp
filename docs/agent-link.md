# AI agent link (optional)

You don't need this to use YDCP. It lets an AI coding agent, or any script, make your companion react, for example cheering when a task finishes. It works through one small local file, with no network.

**It's off when you install YDCP.** Turn it on with **Menu → React to agent**:

| Setting | Behaviour |
|---|---|
| **Off** (default) | YDCP never reads the file |
| **On** | YDCP watches the file and reacts |
| **Auto** | Like On, but only while the file exists |

While it's on, the menu also says whether an agent was found (whether the file exists). YDCP checks the file about twice a second. A state that was already there when YDCP started, or when you turned the link on, isn't replayed.

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
| `mood` (required) | `done` | She cheers (the motion marked `onDone` in `motions.json`, else the built-in Cheer), waking up first if she was asleep |
| | `working`, `failed` | She wakes up if she was asleep, then keeps vibing |
| | `idle` | Nothing (just its `line`, if any) |
| | `sleepy` | She dozes off |
| `line` | Any short text (up to 140 characters) | She says it in her bubble |
| `at` | Milliseconds since 1970 | When it was written. Optional; YDCP also uses the file's change time |

- Unknown fields are ignored, so tools can add their own.
- A state older than 30 minutes is ignored, so a crashed tool can't leave her stuck. YDCP uses `at` if it's there, else the file's change time.
- Files over 64 KB, broken JSON and unknown moods are ignored.
- YDCP only reads this file; it never writes it.

## Examples

- **Claude Code hooks:** [`integrations/claude-code-hooks/`](../integrations/claude-code-hooks/)
- **Claude desktop mod:** [`integrations/claude-desktop-mod/`](../integrations/claude-desktop-mod/)
- **Any script:** [`integrations/generic/`](../integrations/generic/)

> YDCP is an independent project. It is not affiliated with, endorsed by, or sponsored by Anthropic or any AI company. Claude and Claude Code are trademarks of Anthropic, PBC.
