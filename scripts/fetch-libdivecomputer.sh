#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
root_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
destination=${1:-"$root_dir/android/app/src/main/cpp/vendor/libdivecomputer"}
pin_file="$root_dir/android/app/src/main/cpp/libdivecomputer.pin"

read_pin() {
  sed -n "s/^$1=//p" "$pin_file"
}

repository=$(read_pin repository)
commit=$(read_pin commit)
version=$(read_pin version)

case "$commit" in
  ''|*[!0-9a-f]*)
    echo "libdivecomputer.pin does not contain a hexadecimal commit." >&2
    exit 1
    ;;
  *) ;;
esac

case "$repository" in
  https://*) ;;
  *)
    echo "libdivecomputer.pin must use an HTTPS repository URL." >&2
    exit 1
    ;;
esac

if [ "${#commit}" -ne 40 ]; then
  echo "libdivecomputer.pin must contain a full 40-character commit." >&2
  exit 1
fi

version_core=${version%%-*}
old_ifs=$IFS
IFS=.
set -- $version_core
IFS=$old_ifs
version_major=${1:-}
version_minor=${2:-}
version_micro=${3:-}

if [ -z "$repository" ] || [ -z "$version_major" ] || \
   [ -z "$version_minor" ] || [ -z "$version_micro" ]; then
  echo "libdivecomputer.pin is incomplete." >&2
  exit 1
fi

case "$destination" in
  "$root_dir"/*) ;;
  *)
    echo "Destination must remain inside the DiveFrame workspace." >&2
    exit 1
    ;;
esac

if [ -e "$destination" ]; then
  if ! git -C "$destination" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
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
  -e "s/@DC_VERSION_MAJOR@/$version_major/g" \
  -e "s/@DC_VERSION_MINOR@/$version_minor/g" \
  -e "s/@DC_VERSION_MICRO@/$version_micro/g" \
  "$version_template" > "$version_header"

printf '#define DC_VERSION_REVISION "%s"\n' "$commit" \
  > "$destination/src/revision.h"

echo "libdivecomputer $commit is ready at $destination"
