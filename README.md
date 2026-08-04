# DiveFrame

Your dive computer’s log is the source of truth. DiveFrame makes it richer —
maps, photos, site names, and share-ready images — entirely on your device.

**Try it:** [divelog.fishese.cc](https://divelog.fishese.cc)

Pull a location from a dive photo, get nearby site suggestions, fix the name
once, and keep the result when you re-import. No account. No cloud logbook.
Nothing leaves your browser or phone unless you export it.

> **Beta.** Keep your original exports and a recent DiveFrame backup while
> workflows are still changing.

## Highlights

- **Photo → place.** Read GPS from a dive photo, then pick from nearby site
  suggestions ranked by distance (catalog + OpenStreetMap).
- **Import & merge.** Shearwater Cloud Desktop, Subsurface `.ssrf`/XML, UDDF
  (including Oceanic+), and Garmin Dive / Suunto app `.fit` — matching dives
  combine so you keep the richer profile, GPS, notes, and source dive numbers.
- **Share images.** Five layouts, depth profiles, optional tank pressure and
  temperature, logo, and overlays in English, 繁體中文, or 日本語.
- **Trips, edits, memos.** Group dives, correct site and location, and jot
  pre-import memos so details aren’t lost between the water and the log.
- **Private backup.** Full on-device backup (optional password) for browser ↔
  browser or browser ↔ Android transfers.
- **Android APK.** Same app, plus classic Shearwater Bluetooth download and
  native save/share —
  [download the debug APK](https://github.com/fishese/diveframe/releases/latest/download/diveframe-debug.apk).

Your source apps stay the system of record. DiveFrame does not write changes
back to them.

Full how-to: [User guide](docs/USER-GUIDE.md)

## Quick start

1. Export a supported log from your computer or logbook app.
2. Open DiveFrame → **Import log** → choose one or more files.
3. Re-import later anytime; matching dives update in place and keep photos.
4. Add a photo’s location, choose a nearby site, compose a share image.
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
