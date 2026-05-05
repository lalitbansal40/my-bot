#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/ubuntu/AutoChatix-backend"
SHARED_ENV="/home/ubuntu/autochatix-shared/backend.env"

cd "$APP_DIR"

if [ -f "$SHARED_ENV" ]; then
  cp "$SHARED_ENV" "$APP_DIR/.env"
fi

npm ci --omit=dev
