# DiveFrame

A private, device-local companion for your dive logs. Import from your dive
computer or logbook app — or download classic Shearwater dives over Bluetooth
on Android — then merge matching records, add maps and photos, and create
shareable dive images.

**Try it:** [divelog.fishese.cc](https://divelog.fishese.cc)

Pull location from a dive photo to get nearby site suggestions, fix the name
once, and keep the result when you re-import. No account. Your logbook stays
on the device; map-name and nearby-site lookups use network services.

> **Beta.** Keep your original exports and a recent DiveFrame backup while
> workflows are still changing.

## Highlights

- **Photo → place.** Read GPS from a dive photo, then pick from nearby site
  suggestions ranked by distance (catalog + OpenStreetMap).
- **Import & merge.** Shearwater Cloud Desktop, Subsurface `.ssrf`/XML, UDDF
  (including Oceanic+), and Garmin Dive / Suunto app `.fit` — matching dives
  combine so you keep the richer profile, GPS, notes, and source dive numbers.
- **Share images.** Four layouts—Bottom Profile, Right Information Panel,
  Bottom Stats Dock, and Solid Info Band—with depth profiles, optional tank
  pressure and temperature, logo, and overlays in English, 繁體中文, or 日本語.
- **Trips, edits, memos.** Group dives, correct site and location, and jot
  pre-import memos so details aren’t lost between the water and the log.
- **Export & backup.** Full Subsurface logbook export, plus a private on-device
  backup (optional password) for browser ↔ browser or browser ↔ Android —
  your logbook data stays on the device.
- **Android APK.** Same app, plus classic Shearwater Bluetooth download and
  native save/share —
  [download the debug APK](https://github.com/fishese/diveframe/releases/latest/download/diveframe-debug.apk).

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
