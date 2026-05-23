#!/usr/bin/env bash
set -euo pipefail

echo "🚀 Starting Cloudflare Worker deployment..."

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "❌ Error: CLOUDFLARE_API_TOKEN is not set."
  echo "   Please set it as an environment variable or use a secrets manager."
  exit 1
fi

if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "❌ Error: CLOUDFLARE_ACCOUNT_ID is not set."
  echo "   Please set it as an environment variable or use a secrets manager."
  exit 1
fi

echo "📦 Running validations..."
pnpm run validate

echo "☁️  Deploying to Cloudflare..."
pnpm exec wrangler deploy

echo "✅ Deployment complete!"
