#!/usr/bin/env bash
# Pull the latest code, rebuild, and restart. Run on the VPS from /opt/mafia as the mafia user
# (the restart step uses sudo). Restarting ends any game in progress, since rooms live in memory.
set -euo pipefail
cd "$(dirname "$0")/.."

git pull --ff-only
npm ci
npm run build
sudo systemctl restart mafia
echo "Deployed $(git rev-parse --short HEAD)"
