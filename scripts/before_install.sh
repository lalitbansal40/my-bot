#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/autochatix-backend"
SHARED_DIR="/var/www/autochatix-shared"

mkdir -p "$APP_DIR" "$SHARED_DIR"

if [ -f "$APP_DIR/.env" ] && [ ! -f "$SHARED_DIR/backend.env" ]; then
  cp "$APP_DIR/.env" "$SHARED_DIR/backend.env"
fi
