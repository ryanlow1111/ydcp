# Writes YDCP's agent-link file: ydcp-state.ps1 <mood> ["line"]
# Windows PowerShell 5.1 and PowerShell 7. Never fails the calling tool.
# Moods: done, working, idle, failed, sleepy. See docs/agent-link.md.

param(
  [string]$Mood = 'done',
  [string]$Line = ''
)

try {
  if ($Mood -notin @('done', 'working', 'idle', 'failed', 'sleepy')) { exit 0 }

  $dir = Join-Path $env:USERPROFILE '.ydcp'
  New-Item -ItemType Directory -Force -Path $dir | Out-Null

  $state = [ordered]@{ mood = $Mood; at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
  if ($Line) { $state.line = $Line }
  $json = $state | ConvertTo-Json -Compress

  # Write to a temporary file, then replace in one step, so YDCP never reads a half-written file.
  $tmp = Join-Path $dir ("state.json.tmp." + $PID)
  [System.IO.File]::WriteAllText($tmp, $json, (New-Object System.Text.UTF8Encoding $false))
  Move-Item -Force -Path $tmp -Destination (Join-Path $dir 'state.json')
} catch {
  # A missed reaction is fine; never break the agent.
}
exit 0
