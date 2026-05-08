#!/usr/bin/env bash
set -euo pipefail

payload="$(cat)"
path="$(printf '%s' "$payload" | jq -r '.tool_input.file_path // .tool_input.path // empty' 2>/dev/null || true)"

case "$path" in
  *.env|*/.env|*.local|*/.local|*/wrangler.toml|*/config/providers.ts)
    echo "NOTE: You are editing a sensitive or high-impact file: $path" >&2
    echo "Check for secrets, deployment impact, and model alias resolution before finishing." >&2
    ;;
esac

exit 0

