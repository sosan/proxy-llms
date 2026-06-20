#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${1:-staging}"

case "$ENVIRONMENT" in
  staging|production)
    ;;
  *)
    echo "❌ Error: unsupported environment '$ENVIRONMENT'."
    echo "   Usage: $0 [staging|production]"
    exit 1
    ;;
esac

echo "🚀 Starting Cloudflare Worker deployment to ${ENVIRONMENT}..."

# Load secrets from .env if present (centralizes CLOUDFLARE_API_TOKEN,
# CLOUDFLARE_ACCOUNT_ID, NVIDIA_API_KEY, OPENROUTER_API_KEY locally).
# Already-exported environment variables take precedence over .env values.
if [ -f .env ]; then
  echo "📄 Loading secrets from .env..."
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "❌ Error: CLOUDFLARE_API_TOKEN is not set."
  echo "   Set it in .env, export it manually, or run this script through a secrets manager."
  exit 1
fi

if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "❌ Error: CLOUDFLARE_ACCOUNT_ID is not set."
  echo "   Set it in .env, export it manually, or run this script through a secrets manager."
  exit 1
fi

echo "📦 Running validations..."
pnpm run validate

# Upload provider secrets to Cloudflare if present in the environment
# (e.g. loaded from .env). Skipped silently if not set — assumes they
# were already uploaded via `wrangler secret put` previously.
if [ -n "${NVIDIA_API_KEY:-}" ]; then
  echo "🔐 Uploading NVIDIA_API_KEY to ${ENVIRONMENT}..."
  echo "$NVIDIA_API_KEY" | pnpm exec wrangler secret put NVIDIA_API_KEY --env "$ENVIRONMENT"
fi

if [ -n "${OPENROUTER_API_KEY:-}" ]; then
  echo "🔐 Uploading OPENROUTER_API_KEY to ${ENVIRONMENT}..."
  echo "$OPENROUTER_API_KEY" | pnpm exec wrangler secret put OPENROUTER_API_KEY --env "$ENVIRONMENT"
fi

echo "☁️  Deploying to Cloudflare..."
pnpm exec wrangler deploy --env "$ENVIRONMENT"

echo "✅ Deployment to ${ENVIRONMENT} complete!"
