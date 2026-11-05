#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT/frontend"
npm ci
npm run build
cd "$ROOT/backend"
python -m pip install -r requirements.txt
python vercel_build.py
