#!/usr/bin/env sh
set -eu
for command in docker; do
  command -v "$command" >/dev/null 2>&1 || { echo "Missing required command: $command" >&2; exit 1; }
done
[ -f .env ] || cp .env.example .env
echo "Environment file and Docker command are ready."
