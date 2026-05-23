#!/bin/bash
set -e
cd /root/alpha-agent
set -a
source .env.local
set +a
exec npx tsx --tsconfig tsconfig.json scripts/predict-server.ts
