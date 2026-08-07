#!/usr/bin/env bash
set -euo pipefail

backup_path="${1:-}"
if [[ -z "$backup_path" || ! -d "$backup_path" ]]; then
  echo "Usage: verify-backup.sh BACKUP_DIRECTORY" >&2
  exit 1
fi

cd "$backup_path"
sha256sum --check SHA256SUMS
if [[ -n "${POSTGRES_CONTAINER:-}" ]]; then
  docker exec -i "$POSTGRES_CONTAINER" pg_restore --list < database.dump >/dev/null
elif command -v pg_restore >/dev/null 2>&1; then
  pg_restore --list database.dump >/dev/null
else
  echo "pg_restore is required, or set POSTGRES_CONTAINER for a Docker PostgreSQL instance" >&2
  exit 1
fi
tar -tzf uploads.tar.gz >/dev/null
echo "Backup is readable and checksums are valid"
