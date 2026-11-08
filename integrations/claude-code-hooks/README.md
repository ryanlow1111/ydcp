# YDCP + Claude Code hooks

Make your YDCP companion react to [Claude Code](https://docs.claude.com/en/docs/claude-code/hooks) using its standard **hooks**: she wakes up when you send Claude a message, and cheers when Claude finishes its reply. Takes about five minutes.

> YDCP is an independent project. It is not affiliated with, endorsed by, or sponsored by Anthropic. Claude and Claude Code are trademarks of Anthropic, PBC.

## 1. Turn on the agent link in YDCP

**Menu → React to agent → On.** It's off by default.

## 2. Get the script

The script is a few lines long and only writes one small file (see [What the scripts do](#what-the-scripts-do)). It's attached to every [YDCP release](https://github.com/ryanlow1111/ydcp/releases/latest), next to the installers.

**macOS / Linux** (Terminal):

```bash
mkdir -p ~/.ydcp/hooks
```

```bash
curl -fsSL -o ~/.ydcp/hooks/ydcp-state.sh https://github.com/ryanlow1111/ydcp/releases/latest/download/ydcp-state.sh
```

```bash
chmod +x ~/.ydcp/hooks/ydcp-state.sh
```

**Windows** (PowerShell):

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.ydcp\hooks" | Out-Null
```

```powershell
Invoke-WebRequest https://github.com/ryanlow1111/ydcp/releases/latest/download/ydcp-state.ps1 -OutFile "$env:USERPROFILE\.ydcp\hooks\ydcp-state.ps1"
```

Prefer not to use commands? Download `ydcp-state.sh` (macOS / Linux) or `ydcp-state.ps1` (Windows) from the release page and put it in the `.ydcp/hooks` folder in your home folder (create `hooks` if it isn't there). On macOS, still run the `chmod` line above. If you cloned this repository, the scripts are also in this folder.

**Check the script works on its own** before going further. Your companion should cheer and say "It works!":

```bash
~/.ydcp/hooks/ydcp-state.sh done "It works!"
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\.ydcp\hooks\ydcp-state.ps1" done "It works!"
```

## 3. Add the hooks to Claude Code's settings

Open your Claude Code user settings: `~/.claude/settings.json` (Windows: `%USERPROFILE%\.claude\settings.json`). Every Claude Code session reads this file, in the terminal and in the Claude desktop app's Code tab.

**If the file doesn't exist, or contains only `{}`**, replace everything in it with the version for your system:

macOS / Linux:
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

Windows:
```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "powershell -NoProfile -ExecutionPolicy Bypass -Command '& (Join-Path $HOME .ydcp\\hooks\\ydcp-state.ps1) working'" }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "powershell -NoProfile -ExecutionPolicy Bypass -Command '& (Join-Path $HOME .ydcp\\hooks\\ydcp-state.ps1) done'" }] }
    ]
  }
}
```

The Windows command works whether Claude Code runs hooks through Git Bash or PowerShell: PowerShell finds the script in your home folder itself.

**If the file already has settings in it**, don't replace them. Add `"hooks"` as one more entry, and put a comma after the entry before it. For example, if your file is:

```json
{
  "theme": "dark"
}
```

it becomes (macOS / Linux shown):

```json
{
  "theme": "dark",
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

**If you already have a `"hooks"` entry**, don't add a second one. Inside it, add YDCP's `{ "hooks": [ ... ] }` line to your existing `"UserPromptSubmit"` and `"Stop"` lists (with a comma between items), or add those two lists if they aren't there yet.

A missing or extra comma breaks the whole file, and Claude Code then ignores all of it. To check the file, paste it into any JSON checker, or on a Mac run:

```bash
python3 -m json.tool ~/.claude/settings.json > /dev/null && echo "settings.json is fine"
```

## 4. Start a new session, then try it

Claude Code reads hooks when a session starts, so **start a new session**: in the terminal, quit Claude Code and run `claude` again; in the Claude desktop app, start a new session. The session where you edited the settings won't trigger them.

Ask Claude anything. When it finishes replying, your companion cheers.

## If she doesn't react

1. **Is the agent link on?** Menu → React to agent → On.
2. **Does the script work?** Run the check at the end of step 2. If she doesn't cheer, the problem is between the script and YDCP: check that YDCP is running and the file `~/.ydcp/state.json` appears.
3. **Did the hook run?** After Claude replies, look at `~/.ydcp/state.json`. If its `"at"` number didn't change, Claude Code didn't run the hook: check that `settings.json` is valid (step 3) and that you started a new session (step 4).

## What the scripts do

They write one small file, `~/.ydcp/state.json`, for example `{"mood":"done","at":1793958130000}`. They never send anything anywhere, and they always exit successfully, so they can't break Claude Code. See [docs/agent-link.md](../../docs/agent-link.md).

**To turn it off:** set Menu → React to agent → Off (YDCP then ignores the file), or remove the two hook entries from `settings.json`.
