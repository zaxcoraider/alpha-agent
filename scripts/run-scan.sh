#!/bin/bash
# Shell wrapper — loads env vars then runs the prediction scan
# PM2 cron calls this file directly

set -e
cd /root/alpha-agent

# Load all env vars from .env.local into the process environment
set -a
source .env.local
set +a

exec npx tsx --tsconfig tsconfig.json scripts/prediction-scan.ts
