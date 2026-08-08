#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
root_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
cd "$root_dir"

npm ci
sh scripts/fetch-libdivecomputer.sh
npm run prepare:sql-wasm
npm run native:sync
