# YDCP + any script

Anything that can write a file can make your companion react: other AI agents' hooks, build scripts, test runners, timers. Turn the link on first: **Menu → React to agent → On**.

The file and its fields are described in [docs/agent-link.md](../../docs/agent-link.md). Use the helper scripts from [`claude-code-hooks/`](../claude-code-hooks/), which work for any tool, or write the file directly.

## Cheer when a long build finishes

**macOS / Linux:**
```bash
make build; ~/.ydcp/hooks/ydcp-state.sh done "Build finished!"
```

**Windows (PowerShell):**
```powershell
npm run build; & "$env:USERPROFILE\.ydcp\hooks\ydcp-state.ps1" done "Build finished!"
```

## Without the helper scripts

**macOS / Linux:**
```bash
mkdir -p ~/.ydcp && printf '{"mood":"done"}' > ~/.ydcp/state.json
```

**Windows (PowerShell):**
```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.ydcp" | Out-Null; Set-Content "$env:USERPROFILE\.ydcp\state.json" '{"mood":"done"}'
```

## Other AI agents

If your agent has hooks for "task finished" or "prompt sent", point them at the helper script with `done` or `working`, the same way as the [Claude Code example](../claude-code-hooks/).
