#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

backup_dir="${BACKUP_DIR:-./backups}"
upload_dir="${UPLOAD_DIR:-./uploads}"
retention_days="${BACKUP_RETENTION_DAYS:-30}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="${backup_dir%/}/${timestamp}"

mkdir -p "$target"
chmod 700 "$target"
if [[ -n "${POSTGRES_CONTAINER:-}" ]]; then
  docker exec "$POSTGRES_CONTAINER" pg_dump --format=custom --no-owner --no-acl -U "${POSTGRES_USER:-stroycontrol}" -d "${POSTGRES_DB:-stroycontrol}" > "$target/database.dump"
elif command -v pg_dump >/dev/null 2>&1; then
  pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" --file "$target/database.dump"
else
  echo "pg_dump is required, or set POSTGRES_CONTAINER for a Docker PostgreSQL instance" >&2
  rm -rf -- "$target"
  exit 1
fi
if [[ -d "$upload_dir" ]]; then
  tar -C "$upload_dir" -czf "$target/uploads.tar.gz" .
else
  tar -czf "$target/uploads.tar.gz" --files-from /dev/null
fi
sha256sum "$target/database.dump" "$target/uploads.tar.gz" > "$target/SHA256SUMS"
find "$backup_dir" -mindepth 1 -maxdepth 1 -type d -mtime "+$retention_days" -print -exec rm -rf -- {} +
echo "$target"
