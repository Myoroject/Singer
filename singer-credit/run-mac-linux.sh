#!/usr/bin/env bash
# One-click setup and launch for macOS and Linux. Requires Node.js 22+ (https://nodejs.org).
set -e
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Node.js is not installed. Install it from https://nodejs.org and run this again."; exit 1; }
if [ ! -d node_modules ]; then
  echo "Installing dependencies, this takes a few minutes the first time..."
  npm ci || npm install
fi
[ -d node_modules/electron/dist ] || node node_modules/electron/install.js
npm start
