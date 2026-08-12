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
  [download the signed GitHub Preview APK](https://github.com/fishese/diveframe/releases/download/preview/diveframe-preview.apk). The Preview workflow builds the exact pushed source commit with version names `preview.<run>.<short-sha>`; F-Droid releases use separate, accumulated production versions.

  DiveFrame Preview and production use separate Android application IDs and
  private storage. Use **Settings → Export app data** and **Import app data**
  when moving a logbook between them.

  The legacy GitHub nightly and F-Droid production APKs used different
  signing keys. If that old nightly is installed, export app data, uninstall
  it, install F-Droid, then use **Settings → Import app data**. Preview and
  production can remain installed together but keep separate data.

Full how-to: [User guide](docs/USER-GUIDE.md)

Maintainer release channels, source-commit matching, and web/APK parity rules:
[Release channels](docs/RELEASE-CHANNELS.md).
F-Droid recipe and stable-update details:
[F-Droid build guide](docs/FDROID-BUILD.md).

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

Node.js 22+. Before pushing shared web/APK changes, see the
[release channels and parity procedure](docs/RELEASE-CHANNELS.md).

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
