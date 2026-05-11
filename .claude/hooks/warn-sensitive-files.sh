#!/usr/bin/env bash
set -euo pipefail

payload="$(cat)"
path="$(printf '%s' "$payload" | jq -r '.tool_input.file_path // .tool_input.path // empty' 2>/dev/null || true)"

# Define sensitive files and patterns
sensitive_files=(
  "*.env"
  "*/.env"
  "*.local"
  "*/.local"
  "*/wrangler.toml"
  "*/config/providers.ts"
  "*/.aws/**"
  "*/.ssh/**"
  "*/.git-credentials"
  "*/.config/gh/**"
)

# Check if the path matches any sensitive file pattern
is_sensitive=false
for pattern in "${sensitive_files[@]}"; do
  case "$path" in
    $pattern)
      is_sensitive=true
      break
      ;;
  esac
done

if [ "$is_sensitive" = true ]; then
  echo "⚠️ WARNING: You are editing a sensitive or high-impact file: $path" >&2
  echo "" >&2
  echo "Please ensure:" >&2
  echo " • No secrets, API keys, or tokens are being committed" >&2
  echo " • Configuration changes are intentional and tested" >&2
  echo " • Model alias resolution is verified" >&2
  echo " • Deployment impact is understood" >&2
  echo "" >&2
fi

exit 0