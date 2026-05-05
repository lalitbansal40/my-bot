#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/autochatix-backend"
APP_NAME="autochatix-backend"

cd "$APP_DIR"

if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

export DEPLOY_VERSION="$(node -e "try{console.log(require('./deploy-info.json').commit || '')}catch(e){console.log('')}")"
export DEPLOY_TIME="$(node -e "try{console.log(require('./deploy-info.json').builtAt || '')}catch(e){console.log('')}")"

pm2 startOrReload ecosystem.config.js --update-env
pm2 save
pm2 describe "$APP_NAME" >/dev/null
