#!/usr/bin/env bash
set -euo pipefail

backup_path="${1:-}"
restore_database="${RESTORE_DATABASE:-stroycontrol_restore_test}"

if [[ -z "$backup_path" || ! -d "$backup_path" ]]; then
  echo "Usage: restore-backup-test.sh BACKUP_DIRECTORY" >&2
  exit 1
fi
if [[ "$restore_database" != stroycontrol_restore_* ]]; then
  echo "RESTORE_DATABASE must start with stroycontrol_restore_" >&2
  exit 1
fi
if [[ -z "${POSTGRES_CONTAINER:-}" ]]; then
  echo "POSTGRES_CONTAINER is required for an isolated restore drill" >&2
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$script_dir/verify-backup.sh" "$backup_path"

postgres_user="${POSTGRES_USER:-stroycontrol}"
uploads_target="$(mktemp -d)"
cleanup() {
  rm -rf -- "$uploads_target"
}
trap cleanup EXIT

docker exec "$POSTGRES_CONTAINER" dropdb --if-exists --force -U "$postgres_user" "$restore_database"
docker exec "$POSTGRES_CONTAINER" createdb -U "$postgres_user" "$restore_database"
docker exec -i "$POSTGRES_CONTAINER" pg_restore \
  --exit-on-error --no-owner --no-acl \
  -U "$postgres_user" -d "$restore_database" < "$backup_path/database.dump"

table_count="$(docker exec "$POSTGRES_CONTAINER" psql -U "$postgres_user" -d "$restore_database" -Atqc \
  "select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'")"
if [[ ! "$table_count" =~ ^[0-9]+$ || "$table_count" -lt 1 ]]; then
  echo "Restored database contains no public tables" >&2
  exit 1
fi

tar -xzf "$backup_path/uploads.tar.gz" -C "$uploads_target"
upload_count="$(find "$uploads_target" -type f | wc -l | tr -d ' ')"

echo "Restore drill passed: database=$restore_database tables=$table_count uploads=$upload_count"
echo "The isolated restore database was kept for inspection"
