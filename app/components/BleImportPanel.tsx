"use client";

import {
  Bluetooth,
  LoaderCircle,
  Minus,
  Plus,
  Radio,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AppTranslate } from "@/lib/app-i18n";
import {
  BLE_LAST_N_DEFAULT,
  BLE_LAST_N_MAX,
  BLE_LAST_N_MIN,
  formatBleDiveStamp,
  resetCheckpointForDevice,
  runBleImportSession,
  type BleHistoryQuantity,
  type BleImportSessionResult,
  type BleSyncIntent,
} from "@/lib/ble-import-session";
import {
  diveComputerCapability,
  type DiveComputerDeviceFoundEvent,
} from "@/lib/dive-computer-capability";
import { listLocalDeviceCheckpoints } from "@/lib/indexed-db";

type BleImportPanelProps = {
  t: AppTranslate;
  onClose: () => void;
  onImported: () => void | Promise<void>;
};

type DeviceRow = {
  address: string;
  name: string;
  rssi: number;
};

type Phase =
  | "idle"
  | "scanning"
  | "connecting"
  | "ready"
  | "downloading"
  | "saving"
  | "done";

export function BleImportPanel({ t, onClose, onImported }: BleImportPanelProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<ReactNode>(null);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [connectedName, setConnectedName] = useState("");
  const [connectedProduct, setConnectedProduct] = useState("");
  const [connectedSerialHex, setConnectedSerialHex] = useState("");
  const [hasCheckpoint, setHasCheckpoint] = useState(false);
  const [checkpointSyncedAt, setCheckpointSyncedAt] = useState<string | null>(
    null,
  );
  const [quantityKind, setQuantityKind] = useState<"last-n" | "last-200" | "full">(
    "last-n",
  );
  // Held as text so the field can be emptied while retyping; the numeric value
  // is derived and clamped separately.
  const [lastNText, setLastNText] = useState(String(BLE_LAST_N_DEFAULT));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [capturedCount, setCapturedCount] = useState(0);
  const [libdivecomputerVersion, setLibdivecomputerVersion] = useState<string>();
  const [libdivecomputerCommit, setLibdivecomputerCommit] = useState<string>();
  const listenersRef = useRef<Array<{ remove: () => Promise<void> }>>([]);
  const parsedLastN = Number.parseInt(lastNText, 10);
  const lastN = Number.isNaN(parsedLastN)
    ? BLE_LAST_N_DEFAULT
    : Math.min(BLE_LAST_N_MAX, Math.max(BLE_LAST_N_MIN, parsedLastN));
  const downloadBusy = phase === "downloading" || phase === "saving";
  // Scanning does not block connecting: connectSelected() stops the scan first,
  // so the natural flow is to pick a computer as soon as it appears.
  const transportBusy = phase === "connecting" || downloadBusy;
  const connectReady = phase === "ready" || phase === "done";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const caps = await diveComputerCapability.getCapabilities();
        if (cancelled) return;
        setLibdivecomputerVersion(caps.libdivecomputerVersion);
        setLibdivecomputerCommit(caps.libdivecomputerCommit);
        // The native session outlives this panel and the WebView, so a reopen
        // (or a reload) must adopt a transport that is still open instead of
        // sitting at idle while native refuses to scan or connect again.
        if (caps.transportReady) {
          setPhase("ready");
          setStatus(t("bleImportSessionResumed"));
        }
      } catch {
        /* ignore until bridge is ready */
      }
    })();

    void (async () => {
      const listeners = [
        await diveComputerCapability.addListener("deviceFound", (event) => {
          addDevice(event);
        }),
        await diveComputerCapability.addListener("diveCaptured", () => {
          setCapturedCount((count) => count + 1);
        }),
        await diveComputerCapability.addListener("transportReady", (event) => {
          setConnectedName((current) => event.name || current);
          setPhase("ready");
        }),
        await diveComputerCapability.addListener("transportClosed", () => {
          setConnectedName("");
          setPhase((current) =>
            current === "downloading" || current === "saving"
              ? current
              : "idle",
          );
        }),
      ];
      listenersRef.current = listeners;
    })();

    return () => {
      cancelled = true;
      void Promise.all(
        listenersRef.current.map((listener) => listener.remove()),
      );
      // Release the computer so the next open can scan from idle.
      void diveComputerCapability.stopScan().catch(() => undefined);
      void diveComputerCapability.disconnect().catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only listeners
  }, []);

  /**
   * Native only accepts a scan from idle and a connect from idle or scanning,
   * so drop any transport left over from an earlier session first.
   */
  async function releaseNativeSession() {
    const caps = await diveComputerCapability.getCapabilities().catch(() => null);
    if (!caps || caps.phase === "idle") return;
    if (caps.phase === "scanning") {
      await diveComputerCapability.stopScan().catch(() => undefined);
      return;
    }
    await diveComputerCapability.disconnect().catch(() => undefined);
  }

  function addDevice(event: DiveComputerDeviceFoundEvent) {
    setDevices((current) => {
      const next = new Map(current.map((device) => [device.address, device]));
      next.set(event.address, {
        address: event.address,
        name: event.name || event.address,
        rssi: event.rssi,
      });
      return [...next.values()].sort((a, b) => b.rssi - a.rssi);
    });
  }

  async function refreshCheckpoint(productHint: string, serialHexHint?: string) {
    const checkpoints = await listLocalDeviceCheckpoints();
    if (serialHexHint) {
      const serial = serialHexHint.toUpperCase();
      const match =
        checkpoints.find(
          (row) => row.id === `${productHint}\u0000${serial}`,
        ) ??
        checkpoints.find((row) => row.id.endsWith(`\u0000${serial}`));
      if (match) {
        const [product = productHint, matchedSerial = serial] =
          match.id.split("\u0000");
        setConnectedProduct(product);
        setConnectedSerialHex(matchedSerial);
        setHasCheckpoint(Boolean(match.fingerprintHex));
        setCheckpointSyncedAt(match.fingerprintHex ? match.lastSyncedAt : null);
        return;
      }
      setConnectedSerialHex(serial);
      setHasCheckpoint(false);
      setCheckpointSyncedAt(null);
      return;
    }
    const byProduct = checkpoints.filter((row) =>
      row.id.startsWith(`${productHint}\u0000`),
    );
    if (byProduct.length === 1) {
      const [product = productHint, serial = ""] = byProduct[0].id.split("\u0000");
      setConnectedProduct(product);
      setConnectedSerialHex(serial);
      setHasCheckpoint(Boolean(byProduct[0].fingerprintHex));
      setCheckpointSyncedAt(
        byProduct[0].fingerprintHex ? byProduct[0].lastSyncedAt : null,
      );
      return;
    }
    setHasCheckpoint(false);
    setCheckpointSyncedAt(null);
  }

  async function requestPermissions() {
    setStatus("");
    try {
      const result = await diveComputerCapability.requestPermissions();
      if (result.bluetooth !== "granted") {
        setStatus(t("bleImportPermissionDenied"));
        return;
      }
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("bleImportError"));
    }
  }

  async function startScan() {
    setStatus("");
    setDevices([]);
    setSelectedAddress(null);
    setPhase("scanning");
    try {
      await diveComputerCapability.requestPermissions();
      await releaseNativeSession();
      setConnectedName("");
      await diveComputerCapability.startScan({ timeoutMs: 15000 });
    } catch (error) {
      setPhase("idle");
      setStatus(error instanceof Error ? error.message : t("bleImportError"));
    }
  }

  async function stopScan() {
    try {
      await diveComputerCapability.stopScan();
    } finally {
      setPhase((current) => (current === "ready" ? "ready" : "idle"));
    }
  }

  async function connectSelected() {
    if (!selectedAddress) return;
    const device = devices.find((row) => row.address === selectedAddress);
    setPhase("connecting");
    setStatus("");
    try {
      await diveComputerCapability.stopScan().catch(() => undefined);
      await releaseNativeSession();
      const result = await diveComputerCapability.connect({
        address: selectedAddress,
        name: device?.name,
      });
      const name = result.name || device?.name || selectedAddress;
      setConnectedName(name);
      setConnectedProduct(name);
      setPhase("ready");
      await refreshCheckpoint(name);
    } catch (error) {
      setPhase("idle");
      setStatus(error instanceof Error ? error.message : t("bleImportError"));
    }
  }

  function quantity(): BleHistoryQuantity {
    if (quantityKind === "full") return { kind: "full" };
    if (quantityKind === "last-200") return { kind: "last-200" };
    return { kind: "last-n", n: lastN };
  }

  async function startDownload(intent: BleSyncIntent) {
    setStatus("");
    setCapturedCount(0);
    setPhase("downloading");
    try {
      const result = await runBleImportSession({
        intent,
        quantity: intent === "history" ? quantity() : undefined,
        deviceDescriptorHint: connectedProduct || connectedName,
        serialHexHint: connectedSerialHex,
        libdivecomputerVersion,
        libdivecomputerCommit,
      });

      if (result.download) {
        const product = result.download.product || connectedProduct || connectedName;
        const serial = (result.download.serialHex || connectedSerialHex).toUpperCase();
        setConnectedProduct(product);
        setConnectedSerialHex(serial);
        await refreshCheckpoint(product, serial);
      } else if (result.product || result.serialHex) {
        if (result.product) setConnectedProduct(result.product);
        if (result.serialHex) setConnectedSerialHex(result.serialHex);
        await refreshCheckpoint(
          result.product || connectedProduct || connectedName,
          result.serialHex || connectedSerialHex,
        );
      }

      const failed =
        result.failedParseCount > 0
          ? t("bleImportFailedParse", { count: result.failedParseCount })
          : "";
      const detail =
        result.newCount > 0 ? formatBleImportDetail(t, result) : null;

      if (result.cancelled) {
        setPhase("ready");
        if (result.newCount > 0 || result.alreadyPresentCount > 0) {
          await onImported();
          setStatus(
            <>
              {t("bleImportCancelledSaved", {
                newCount: result.newCount,
                alreadyPresent: result.alreadyPresentCount,
                failed,
              })}
              {detail}
            </>,
          );
        } else {
          setStatus(t("bleImportCancelled"));
        }
        return;
      }

      if (result.newCount > 0 || result.alreadyPresentCount > 0) {
        await onImported();
      }
      setPhase("done");
      setStatus(
        result.received === 0 && result.newCount === 0
          ? t("bleImportNothingNew")
          : (
              <>
                {t("bleImportSummary", {
                  received: result.received,
                  newCount: result.newCount,
                  alreadyPresent: result.alreadyPresentCount,
                  failed,
                })}
                {detail}
              </>
            ),
      );
    } catch (error) {
      // A dropped link and a rejected request need different recovery, so ask
      // native whether the transport survived rather than assuming it did.
      const caps = await diveComputerCapability
        .getCapabilities()
        .catch(() => null);
      setPhase(caps?.transportReady ? "ready" : "idle");
      setStatus(error instanceof Error ? error.message : t("bleImportError"));
    }
  }

  async function disconnectComputer() {
    await diveComputerCapability.disconnect().catch(() => undefined);
    setConnectedName("");
    setPhase("idle");
    setStatus(null);
  }

  async function cancelDownload() {
    if (!(await confirmStopDownload())) return;
    await stopDownload();
  }

  /** Close / backdrop: during transfer, cancel only and stay open for the summary. */
  async function requestClose() {
    if (phase === "saving") return;
    if (phase === "downloading") {
      await cancelDownload();
      return;
    }
    onClose();
  }

  function confirmStopDownload() {
    return window.confirm(t("bleImportCancelConfirm"));
  }

  async function stopDownload() {
    try {
      await diveComputerCapability.cancel();
    } catch {
      /* best effort */
    }
  }

  async function resetCheckpoint() {
    const product = connectedProduct || connectedName;
    if (!product || !connectedSerialHex) return;
    await resetCheckpointForDevice(product, connectedSerialHex);
    setHasCheckpoint(false);
    setCheckpointSyncedAt(null);
    setStatus(t("bleImportResetCheckpointDone"));
  }

  function formatSyncedAt(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  }

  const quantityFieldset = (
    <fieldset className="ble-import-fieldset" disabled={downloadBusy}>
      <legend>{t("bleImportQuantityLegend")}</legend>
      <label className="ble-radio">
        <input
          type="radio"
          name="ble-qty"
          checked={quantityKind === "last-n"}
          onChange={() => setQuantityKind("last-n")}
        />
        <span>
          {t("bleImportQuantityLastN")}
          <span className="ble-n-stepper">
            <button
              type="button"
              className="button button-quiet"
              aria-label={t("bleImportQuantityDecrease")}
              onClick={() => {
                setQuantityKind("last-n");
                setLastNText(String(Math.max(BLE_LAST_N_MIN, lastN - 1)));
              }}
              disabled={lastN <= BLE_LAST_N_MIN && quantityKind === "last-n"}
            >
              <Minus size={15} />
            </button>
            <input
              type="number"
              inputMode="numeric"
              className="ble-n-input"
              min={BLE_LAST_N_MIN}
              max={BLE_LAST_N_MAX}
              value={lastNText}
              aria-label={t("bleImportQuantityLastNValue")}
              onChange={(event) => {
                setQuantityKind("last-n");
                setLastNText(event.target.value);
              }}
              onFocus={() => setQuantityKind("last-n")}
              onBlur={() => setLastNText(String(lastN))}
            />
            <button
              type="button"
              className="button button-quiet"
              aria-label={t("bleImportQuantityIncrease")}
              onClick={() => {
                setQuantityKind("last-n");
                setLastNText(String(Math.min(BLE_LAST_N_MAX, lastN + 1)));
              }}
              disabled={lastN >= BLE_LAST_N_MAX && quantityKind === "last-n"}
            >
              <Plus size={15} />
            </button>
          </span>
        </span>
      </label>
      <label className="ble-radio">
        <input
          type="radio"
          name="ble-qty"
          checked={quantityKind === "last-200"}
          onChange={() => setQuantityKind("last-200")}
        />
        <span>
          {t("bleImportQuantityLast200")}
          <small>{t("bleImportQuantityLast200Hint")}</small>
        </span>
      </label>

      <details
        className="ble-advanced"
        open={advancedOpen}
        onToggle={(event) =>
          setAdvancedOpen((event.target as HTMLDetailsElement).open)
        }
      >
        <summary>{t("bleImportAdvanced")}</summary>
        <label className="ble-radio">
          <input
            type="radio"
            name="ble-qty"
            checked={quantityKind === "full"}
            onChange={() => setQuantityKind("full")}
          />
          <span>{t("bleImportFull")}</span>
        </label>
        <p className="settings-note ble-full-warning">
          {t("bleImportFullWarning")}
        </p>
      </details>
    </fieldset>
  );

  return (
    <div
      className="ble-import-backdrop"
      role="presentation"
      onClick={() => {
        void requestClose();
      }}
    >
      <div
        className="ble-import-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ble-import-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="ble-import-header">
          <div>
            <p className="eyebrow">
              <Bluetooth size={14} />
              Shearwater BLE
            </p>
            <h2 id="ble-import-title">{t("bleImportTitle")}</h2>
          </div>
          <button
            type="button"
            className="button button-quiet"
            onClick={() => void requestClose()}
            disabled={phase === "saving"}
          >
            <X size={16} />
            {t("bleImportClose")}
          </button>
        </header>

        <div className="ble-import-body">
          <div className="ble-import-actions">
            <button
              type="button"
              className="button button-quiet"
              onClick={() => void requestPermissions()}
              disabled={transportBusy}
            >
              {t("bleImportPermissions")}
            </button>
            {phase === "scanning" ? (
              <button
                type="button"
                className="button button-quiet"
                onClick={() => void stopScan()}
              >
                {t("bleImportStopScan")}
              </button>
            ) : (
              <button
                type="button"
                className="button button-primary"
                onClick={() => void startScan()}
                disabled={transportBusy}
              >
                <Radio size={16} />
                {t("bleImportScan")}
              </button>
            )}
          </div>

          {devices.length === 0 ? (
            <p className="settings-note">{t("bleImportNoDevices")}</p>
          ) : (
            <ul className="ble-device-list">
              {devices.map((device) => (
                <li key={device.address}>
                  <label className="ble-device-row">
                    <input
                      type="radio"
                      name="ble-device"
                      checked={selectedAddress === device.address}
                      onChange={() => setSelectedAddress(device.address)}
                      disabled={transportBusy}
                    />
                    <span>
                      <strong>{device.name}</strong>
                      <small>
                        {device.address} · {t("bleImportRssi", { rssi: device.rssi })}
                      </small>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          <div className="ble-import-actions">
            <button
              type="button"
              className="button button-primary"
              onClick={() => void connectSelected()}
              disabled={!selectedAddress || transportBusy}
            >
              {t("bleImportConnect")}
            </button>
            {phase === "ready" || phase === "done" ? (
              <button
                type="button"
                className="button button-quiet"
                onClick={() => void disconnectComputer()}
              >
                {t("bleImportDisconnect")}
              </button>
            ) : null}
          </div>

          {connectedName ? (
            <p className="settings-note">
              {t("bleImportConnected", { name: connectedName })}
              {connectedSerialHex ? ` · ${connectedSerialHex}` : ""}
            </p>
          ) : null}

          {downloadBusy ? (
            <div className="ble-import-actions">
              <button
                type="button"
                className="button button-quiet"
                onClick={() => void cancelDownload()}
                disabled={phase === "saving"}
              >
                {t("bleImportCancel")}
              </button>
            </div>
          ) : hasCheckpoint ? (
            <>
              <div className="ble-primary-sync">
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => void startDownload("incremental")}
                  disabled={!connectReady}
                >
                  {t("bleImportDownloadNew")}
                </button>
                {checkpointSyncedAt ? (
                  <p className="settings-note ble-last-synced">
                    {t("bleImportLastSynced", {
                      when: formatSyncedAt(checkpointSyncedAt),
                    })}
                  </p>
                ) : null}
              </div>
              <section className="ble-more-history" aria-labelledby="ble-more-history-title">
                <h3 id="ble-more-history-title">{t("bleImportMoreHistory")}</h3>
                <p className="settings-note">{t("bleImportMoreHistoryHint")}</p>
                {quantityFieldset}
                <div className="ble-import-actions">
                  <button
                    type="button"
                    className="button button-primary ble-history-download"
                    onClick={() => void startDownload("history")}
                    disabled={!connectReady}
                  >
                    {t("bleImportDownloadHistory")}
                  </button>
                  <button
                    type="button"
                    className="button button-quiet"
                    onClick={() => void resetCheckpoint()}
                    disabled={transportBusy}
                  >
                    {t("bleImportResetCheckpoint")}
                  </button>
                </div>
              </section>
            </>
          ) : connectReady ? (
            <>
              {quantityFieldset}
              <div className="ble-import-actions">
                <button
                  type="button"
                  className="button button-primary ble-history-download"
                  onClick={() => void startDownload("history")}
                  disabled={!connectReady}
                >
                  {t("bleImportDownloadHistory")}
                </button>
              </div>
            </>
          ) : null}

          {phase === "downloading" ? (
            <p className="ble-progress" role="status">
              <LoaderCircle size={15} className="spin" />
              {t("bleImportDownloading", { count: capturedCount })}
            </p>
          ) : null}
          {phase === "saving" ? (
            <p className="ble-progress" role="status">
              <LoaderCircle size={15} className="spin" />
              {t("bleImportSaving")}
            </p>
          ) : null}
          {status ? (
            <p className="settings-note" role="status">
              {status}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function formatBleImportDetail(
  t: AppTranslate,
  result: BleImportSessionResult,
): ReactNode {
  const computer = [result.product, result.serialHex].filter(Boolean).join(" · ");
  let dateRange: string | null = null;
  if (result.newDiveDateEarliest && result.newDiveDateLatest) {
    const earliest = formatBleDiveStamp(result.newDiveDateEarliest);
    const latest = formatBleDiveStamp(result.newDiveDateLatest);
    dateRange =
      earliest === latest
        ? t("bleImportDateSingle", { date: earliest })
        : t("bleImportDateRange", { earliest, latest });
  }
  if (!computer && !dateRange) return null;
  return (
    <>
      {" "}
      {computer || "—"}
      {dateRange ? (
        <>
          {" · "}
          {t("bleImportNewDivesLabel")}{" "}
          <strong>{dateRange}</strong>
        </>
      ) : null}
      {t("bleImportSummaryFindHint")}
    </>
  );
}
