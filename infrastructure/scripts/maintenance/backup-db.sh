#!/usr/bin/env sh
set -eu
DEST=${1:-backups}
mkdir -p "$DEST"
STAMP=$(date +%Y%m%d-%H%M%S)
: "${DATABASE_URL:?Set DATABASE_URL before backing up}"
pg_dump "$DATABASE_URL" --format=custom --file="$DEST/quanto-$STAMP.dump"
echo "$DEST/quanto-$STAMP.dump"
