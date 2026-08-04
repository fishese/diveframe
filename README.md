# DiveFrame

A private, device-local companion for your dive logs. Import exports from your
dive computer or logbook app, merge matching records, add maps and photos, and
create shareable dive images — without uploading your logbook to DiveFrame.

**Try it:** [divelog.fishese.cc](https://divelog.fishese.cc)

> **Beta.** Keep your original exports and a recent DiveFrame backup while
> workflows are still changing.

## What it does

- **Import** Shearwater Cloud Desktop databases, Subsurface `.ssrf`/XML, UDDF
  (including Oceanic+), and Garmin Dive / Suunto app `.fit` files
- **Merge** the same dive across sources without discarding the richer profile,
  GPS, site, notes, or source dive numbers
- **Enrich** with maps, nearby site suggestions, photos, trips, and local edits
- **Compose** high-resolution share images with depth profiles and overlays
  (English, 繁體中文, or 日本語)
- **Back up** everything on-device (optional password) and restore on another
  browser or the Android app
- **Android APK:** same UI, plus classic Shearwater Bluetooth download and
  native file save/share ([download](https://github.com/fishese/diveframe/releases/latest/download/diveframe-debug.apk))

Your source apps stay the system of record. DiveFrame does not write changes
back to them.

Full how-to: [User guide](docs/USER-GUIDE.md)

## Quick start

1. Export a supported log from your computer or logbook app.
2. Open DiveFrame → **Import log** → choose one or more files.
3. Re-import later anytime; matching dives update in place and keep photos.
4. Add sites, GPS, photos, and share images as needed.
5. Use **Settings → Export app data** before clearing storage or switching
   devices.

Install as a PWA from **Settings → Install DiveFrame** (or Safari → Share →
Add to Home Screen on iPhone). The PWA and Android APK keep separate local
data — transfer with an app-data backup.

## For contributors

Node.js 22+. Before pushing shared web/APK changes, see
[web/APK sync](docs/WEB-APK-SYNC.md).

```sh
npm install
npm run dev
npm test
```

Product/engineering review notes live in
[PRODUCT-SPEC.md](docs/PRODUCT-SPEC.md). Maintainer handoff is in
[HANDOFF.md](HANDOFF.md).

## License

[GPL-3.0-or-later](LICENSE). The bundled Bubbles sample background is
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) — see
[ASSET-LICENSES.md](ASSET-LICENSES.md).
