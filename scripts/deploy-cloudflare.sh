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

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "❌ Error: CLOUDFLARE_API_TOKEN is not set."
  echo "   Local deploys require exporting CLOUDFLARE_API_TOKEN or running this script through a secrets manager."
  exit 1
fi

if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "❌ Error: CLOUDFLARE_ACCOUNT_ID is not set."
  echo "   Local deploys require exporting CLOUDFLARE_ACCOUNT_ID or running this script through a secrets manager."
  exit 1
fi

echo "📦 Running validations..."
pnpm run validate

echo "☁️  Deploying to Cloudflare..."
pnpm exec wrangler deploy --env "$ENVIRONMENT"

echo "✅ Deployment to ${ENVIRONMENT} complete!"
