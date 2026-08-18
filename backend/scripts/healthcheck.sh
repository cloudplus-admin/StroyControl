#!/usr/bin/env bash
set -euo pipefail

health_url="${HEALTH_URL:-https://stroycontrol-api.cloudplus.uz/health}"
response="$(curl --fail --silent --show-error --max-time 15 "$health_url")"

node -e '
const payload = JSON.parse(process.argv[1]);
if (payload.status !== "ok") process.exit(1);
for (const check of Object.values(payload.checks ?? {})) {
  if (!check || check.status !== "ok") process.exit(1);
}
' "$response"

echo "StroyControl health is ok"
