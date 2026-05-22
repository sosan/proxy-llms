#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   scripts/health-check.sh <DEPLOYMENT_URL>
#
# Example:
#   scripts/health-check.sh https://proxy-llms-staging.<account>.workers.dev

if [ $# -lt 1 ]; then
  echo "Usage: $0 <DEPLOYMENT_URL>"
  exit 1
fi

URL="${1%/}/health"

echo "Checking health at ${URL}..."

STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${URL}")

if [ "${STATUS_CODE}" -ne 200 ]; then
  echo "Health check failed! Expected 200, got ${STATUS_CODE}"
  exit 1
fi

echo "Health check passed (200 OK)"
