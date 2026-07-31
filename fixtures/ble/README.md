# BLE capture fixtures (local only)

Save full downloads from the Android research spike (**Save full capture**)
or copy a `diveframe-ble-capture` JSON here. Files are gitignored.

## Why

Re-pairing the dive computer for every code change is slow. Capture once,
develop against the fixture, and re-capture only when:

- GATT / MTU / libdivecomputer download behavior might have changed;
- you hit a milestone and want hardware regression confidence; or
- you need a new model/firmware in the compatibility matrix.

## Env

```powershell
$env:BLE_CAPTURE_FIXTURE="D:\Projects\Dive log\web\fixtures\ble\perdix2-2026-08-01.json"
$env:SHEARWATER_DB_FIXTURE="D:\path\to\Shearwater export.db"
npm test
```

Identity comparison tests skip when either fixture is absent.

## Format

`format`: `diveframe-ble-capture`  
`formatVersion`: `1`  

Includes the full plugin `download` payload (`dataBase64` per dive), device
metadata, and an optional `normalizedPreview` snapshot from the spike.
Treat these files as private dive data.
