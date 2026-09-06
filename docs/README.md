# DiveFrame documentation

## Active references

| Document | Purpose |
| --- | --- |
| [User guide](USER-GUIDE.md) | Import, edit, map, memo, export, backup, and installation workflows |
| [Maintainer handoff](../HANDOFF.md) | Current boundaries, code entry points, and remaining validation |
| [Release channels](RELEASE-CHANNELS.md) | Web/Preview publication and parity; stable-release gate |
| [F-Droid build guide](FDROID-BUILD.md) | Pinned stable record, recipe invariants, reproducibility, and historical failures |
| [Release records](releases/README.md) | Dated publication evidence; verify live state before reuse |
| [Cross-browser testing](CROSS-BROWSER-TESTING.md) | Browser/device validation checklist |
| [Dive map](dive-map.md) | Offline map implementation and behavior |
| [Dive-site catalog](dive-site-catalog.md) | Catalog format and integration |
| [Dive-site validation](dive-site-validation.md) | Catalog validation rules |
| [Back navigation design](2026-08-17-app-back-navigation-design.md) | Deliberate hierarchical Back behavior |
| [Android capture spike](native-android-spike.md) | Historical hardware findings and the separate research shell |

## Archives and local notes

[Archived public snapshots](archive/README.md) preserve earlier context without
serving as current release instructions. The former WEB-APK-SYNC and FDROID-PATH
procedures were consolidated into the release and F-Droid guides; their local
copies remain in ignored `docs/.local/archive/`.

The sibling `fdroid-prep` workspace keeps its historical submission and Preview
planning records under `archive/`, with a short active status document. No
local-only planning documents are added to the public repository by this cleanup.
