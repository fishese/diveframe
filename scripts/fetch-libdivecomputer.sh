#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
root_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
destination=${1:-"$root_dir/android/app/src/main/cpp/vendor/libdivecomputer"}
repository=https://github.com/libdivecomputer/libdivecomputer.git
commit=8e564eb5cf9fb4318af3d540895abb916e1809b0
version=0.10.0-devel

case "$destination" in
  "$root_dir"/*) ;;
  *)
    echo "Destination must remain inside the DiveFrame workspace." >&2
    exit 1
    ;;
esac

if [ -e "$destination" ]; then
  if [ ! -d "$destination/.git" ]; then
    echo "Existing libdivecomputer destination is not a Git checkout." >&2
    exit 1
  fi
  existing_commit=$(git -C "$destination" rev-parse HEAD)
  if [ "$existing_commit" != "$commit" ]; then
    echo "Existing libdivecomputer checkout does not match the pinned commit." >&2
    exit 1
  fi
else
  mkdir -p "$(dirname -- "$destination")"
  git init "$destination" >/dev/null
  git -C "$destination" remote add origin "$repository"
  git -C "$destination" fetch --depth 1 origin "$commit"
  git -C "$destination" checkout --detach FETCH_HEAD >/dev/null
fi

version_template="$destination/include/libdivecomputer/version.h.in"
version_header="$destination/include/libdivecomputer/version.h"
sed \
  -e "s/@DC_VERSION@/$version/g" \
  -e 's/@DC_VERSION_MAJOR@/0/g' \
  -e 's/@DC_VERSION_MINOR@/10/g' \
  -e 's/@DC_VERSION_MICRO@/0/g' \
  "$version_template" > "$version_header"

printf '#define DC_VERSION_REVISION "%s"\n' "$commit" \
  > "$destination/src/revision.h"

echo "libdivecomputer $commit is ready at $destination"
