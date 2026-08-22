#!/usr/bin/env sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)
: "${DATABASE_URL:?Set DATABASE_URL before applying migrations}"
for migration in "$ROOT"/database/migrations/*.sql; do
  echo "Applying $(basename "$migration")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration"
done
