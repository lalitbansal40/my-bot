#!/usr/bin/env bash
set -euo pipefail

HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:5005/health}"

for attempt in $(seq 1 30); do
  if curl -fsS "$HEALTH_URL" >/tmp/autochatix-health.json; then
    cat /tmp/autochatix-health.json
    exit 0
  fi
  sleep 2
done

echo "Health check failed: $HEALTH_URL" >&2
pm2 logs autochatix-backend --lines 80 --nostream || true
exit 1
