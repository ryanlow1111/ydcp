#!/bin/sh
# Writes YDCP's agent-link file: ydcp-state.sh <mood> ["line"]
# Works on macOS, Linux and Git Bash on Windows. Never fails the calling tool.
# Moods: done, working, idle, failed, sleepy. See docs/agent-link.md.

mood="${1:-done}"
line="${2:-}"
dir="$HOME/.ydcp"

case "$mood" in
  done | working | idle | failed | sleepy) ;;
  *) exit 0 ;;
esac

mkdir -p "$dir" 2>/dev/null || exit 0
# Escape backslashes and quotes so the line stays valid JSON.
escaped=$(printf '%s' "$line" | sed 's/\\/\\\\/g; s/"/\\"/g')
at="$(date +%s)000"
tmp="$dir/state.json.tmp.$$"

if [ -n "$line" ]; then
  printf '{"mood":"%s","line":"%s","at":%s}\n' "$mood" "$escaped" "$at" > "$tmp"
else
  printf '{"mood":"%s","at":%s}\n' "$mood" "$at" > "$tmp"
fi
# Replace in one step, so YDCP never reads a half-written file.
mv -f "$tmp" "$dir/state.json" 2>/dev/null || rm -f "$tmp"
exit 0
