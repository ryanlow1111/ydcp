# YDCP + Claude Code hooks

Make your YDCP companion react to [Claude Code](https://docs.claude.com/en/docs/claude-code/hooks) using its standard **hooks**. She cheers when Claude finishes a reply.

> YDCP is an independent project. It is not affiliated with, endorsed by, or sponsored by Anthropic. Claude and Claude Code are trademarks of Anthropic, PBC.

## 1. Turn on the agent link in YDCP

**Menu → React to agent → On.** It's off by default.

## 2. Copy the script

| OS | Copy | To |
|---|---|---|
| macOS / Linux | `ydcp-state.sh` | `~/.ydcp/hooks/ydcp-state.sh`, then run `chmod +x ~/.ydcp/hooks/ydcp-state.sh` |
| Windows | `ydcp-state.ps1` | `%USERPROFILE%\.ydcp\hooks\ydcp-state.ps1` |

## 3. Add the hooks to Claude Code's settings

Open your user settings file, `~/.claude/settings.json` (Windows: `%USERPROFILE%\.claude\settings.json`), and merge in the `hooks` section for your OS. If you already have hooks, add these entries next to yours.

**macOS / Linux:**
```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "~/.ydcp/hooks/ydcp-state.sh working" }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "~/.ydcp/hooks/ydcp-state.sh done" }] }
    ]
  }
}
```

**Windows:**
```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "powershell -NoProfile -ExecutionPolicy Bypass -File \"%USERPROFILE%\\.ydcp\\hooks\\ydcp-state.ps1\" working" }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "powershell -NoProfile -ExecutionPolicy Bypass -File \"%USERPROFILE%\\.ydcp\\hooks\\ydcp-state.ps1\" done" }] }
    ]
  }
}
```

If Claude Code on your Windows PC runs hooks through Git Bash, you can use the macOS / Linux version instead.

## 4. Try it

Ask Claude Code anything. When it finishes, your companion cheers. To check the script on its own:

```bash
~/.ydcp/hooks/ydcp-state.sh done "It works!"
```

## What the scripts do

They write one small file, `~/.ydcp/state.json`, for example `{"mood":"done","at":1793958130000}`. They never send anything anywhere, and they always exit successfully, so they can't break Claude Code. See [docs/agent-link.md](../../docs/agent-link.md).
