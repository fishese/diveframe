# Cross-browser backup and PWA checklist

## Practical device-transfer test

Using Chromium and Firefox is a useful manual acceptance test:

1. In Chromium, import representative Shearwater/Subsurface logs and make
   several local changes.
2. Add a dive photo, reusable background, logo, and named composer preset.
3. Export an app backup.
   Repeat with **Password-protect this backup**, including a short numeric
   password, and confirm the encrypted file requests that password on import.
4. Open DiveFrame in a clean Firefox profile and select that backup.
5. Confirm the preview shows a verified checksum and the expected counts.
6. Choose **Replace with backup** and compare dive counts, source numbers,
   site/buddy/notes edits, photos, backgrounds, logo, language, and presets.
7. Add one Firefox-only edit, export again, and import into Chromium with
   **Merge backup**. Confirm the preview reports both matching and
   device-only records and that the device-only records remain.
8. Repeat once with **Replace with backup** and confirm records absent from the
   backup are removed.
9. Deliberately change one character in a current backup file and confirm the
   checksum failure prevents import.
10. Confirm an incorrect password cannot open the encrypted backup, then enter
    the correct password and complete the preview.
11. Compare the persistent/best-effort storage status shown by each browser.
12. Confirm the beta notice appears in each interface language and its backup
    link opens Settings without changing the deployment origin.

Use disposable browser profiles for destructive replace tests. Do not use
private browsing because IndexedDB is intentionally temporary there.

## What automated cross-browser integration means

Automated integration tests go beyond parsing the same JSON in Node. They run
the built application in real browser engines—Chromium, Firefox, and
WebKit-compatible—then exercise:

- IndexedDB creation, merge, replace, and transaction failure behavior;
- file input and generated backup download handling;
- Blob/base64 photo round trips and larger backup memory behavior;
- PWA manifest and service-worker update behavior;
- composer canvas/SVG export; and
- browser-specific storage persistence and quota behavior.

The current repository has unit/contract coverage but not this full
Playwright-style browser matrix yet. Manual Chromium-to-Firefox testing is the
right near-term release check; iOS Safari/Home Screen and Android Chrome remain
important device checks before a native wrapper.
