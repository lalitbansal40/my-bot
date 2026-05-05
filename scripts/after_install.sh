#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/autochatix-backend"
SHARED_ENV="/var/www/autochatix-shared/backend.env"

cd "$APP_DIR"

if [ -f "$SHARED_ENV" ]; then
  cp "$SHARED_ENV" "$APP_DIR/.env"
fi

npm ci --omit=dev
