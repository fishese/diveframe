#!/bin/sh
# Compile only verified source, in a new temporary directory on every build.
set -eu
root=$(CDPATH= cd -- "$1" && pwd)
mode=${2:-system}
output=${DIVEFRAME_SQLJS_OUTPUT:-"$root/.sqljs-cache/compiled"}
if [ "$mode" = emsdk ]; then
  sh "$root/scripts/install-sqljs-emsdk.sh" "$root"
  export EM_CONFIG="$root/.sqljs-cache/emsdk/.emscripten"
  emcc="$root/.sqljs-cache/emsdk/upstream/emscripten/emcc"
else
  emcc=${EMCC:-emcc}
fi
case "$("$emcc" --version | head -n 1)" in
  *' 3.1.69 '*) ;;
  *) printf '%s\n' 'sql.js requires Emscripten 3.1.69; see docs/SQLJS-BUILD.md' >&2; exit 1 ;;
esac
build=$(mktemp -d)
trap 'rm -rf "$build"' EXIT HUP INT TERM
cp -R "$root/.sqljs-cache/source/." "$build/"
cd "$build"
mkdir -p out dist
export DIVEFRAME_SQLJS_EMCC="$emcc"
cat > "$build/emcc-wrapper" <<'WRAPPER'
#!/bin/sh
exec "$DIVEFRAME_SQLJS_EMCC" "$@"
WRAPPER
chmod +x "$build/emcc-wrapper"
make -o sqlite-src/sqlite-amalgamation-3490100 dist/sql-wasm.js dist/sql-wasm-browser.js \
  EMCC="$build/emcc-wrapper" EMFLAGS_OPTIMIZED="-Oz -flto"
for file in sql-wasm.js sql-wasm-browser.js sql-wasm.wasm sql-wasm-browser.wasm; do
  cp "dist/$file" "$output/$file"
done
