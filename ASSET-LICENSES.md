# Asset licensing

DiveFrame's software source code is licensed under
`GPL-3.0-or-later` as described in [`LICENSE`](LICENSE).

## Bubbles sample background

File: `public/backgrounds/bubbles-bg.jpg`

Copyright © 2026 DiveFrame developer.

This image is licensed under the Creative Commons Attribution-ShareAlike 4.0
International License (CC BY-SA 4.0).

You are free to share and adapt the image for any purpose, including commercial
use, provided you give appropriate credit to the DiveFrame developer, indicate
if changes were made, and distribute your contributions under the same license.
See <https://creativecommons.org/licenses/by-sa/4.0/> for the full legal text.

The DiveFrame software remains GPL-3.0-or-later. Redistributors may keep this
CC BY-SA image in a fork when they comply with CC BY-SA 4.0.

## Overlay fonts

DiveFrame bundles the following SIL Open Font License 1.1 (OFL) families for
offline composer overlays (web, PWA, and Android APK):

- Noto Sans TC
- Inter
- Outfit
- Space Mono
- Huninn

Binary files live under `public/fonts/` as unmodified `.woff2` redistributions.
Per-family OFL text is stored as `public/fonts/OFL-*.txt`. See
<https://openfontlicense.org/> for the license terms.

These fonts were acquired via the Google Fonts CSS API for packaging only.
DiveFrame does not load `fonts.googleapis.com` or `fonts.gstatic.com` at
runtime. Device Sans continues to use the device system font stack and is not
an OFL bundle.

## Native libdivecomputer

The Android classic Shearwater BLE bridge links the pinned libdivecomputer
source recorded in `android/app/src/main/cpp/libdivecomputer.pin`. It is
licensed under LGPL-2.1-or-later. The Windows and portable Unix fetch helpers
prepare the corresponding source and generated version headers for the native
build.
