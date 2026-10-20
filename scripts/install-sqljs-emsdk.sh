#!/bin/sh
# Non-root bootstrap for Cloudflare's build image. Never used by F-Droid.
set -eu
root=$1
sdk="$root/.sqljs-cache/emsdk"
commit=a36df02dc438e8b02f91122a4c62eeecb6784272
if [ "${DIVEFRAME_SQLJS_OFFLINE:-0}" = 1 ]; then
  printf '%s\n' 'SDK installation is disabled for offline builds; use packaged Emscripten.' >&2
  exit 1
fi
if [ ! -d "$sdk/.git" ]; then
  git clone --depth 1 --branch 3.1.69 https://github.com/emscripten-core/emsdk.git "$sdk"
fi
test "$(git -C "$sdk" rev-parse HEAD)" = "$commit"
test -z "$(git -C "$sdk" status --porcelain --untracked-files=no)"
python3 "$sdk/emsdk.py" install 3.1.69
python3 "$sdk/emsdk.py" activate 3.1.69
