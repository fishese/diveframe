import { diveComputerCapability } from "../../lib/dive-computer-capability";
import { normalizeBleDownloadPreview } from "../../lib/ble-dive-normalizer";
import {
  bleCaptureFixtureFilename,
  buildBleCaptureFixture,
} from "../../lib/ble-capture-fixture";

const output = requiredElement<HTMLPreElement>("output");
const status = requiredElement<HTMLElement>("bridge-status");
const dot = requiredElement<HTMLElement>("status-dot");
const inspect = requiredElement<HTMLButtonElement>("inspect");
const permissions = requiredElement<HTMLButtonElement>("permissions");
const scan = requiredElement<HTMLButtonElement>("scan");
const connect = requiredElement<HTMLButtonElement>("connect");
const downloadOne = requiredElement<HTMLButtonElement>("download-one");
const downloadFive = requiredElement<HTMLButtonElement>("download-five");
const downloadSince = requiredElement<HTMLButtonElement>("download-since");
const saveCapture = requiredElement<HTMLButtonElement>("save-capture");
const cancel = requiredElement<HTMLButtonElement>("cancel");

const devices = new Map<string, { address: string; name: string; rssi: number }>();
const listeners: Array<{ remove: () => Promise<void> }> = [];

// A download report stays on screen until the next explicit button press, so
// transport events that fire right after a download cannot overwrite it.
let pinned = false;
let downloading = false;
let lastNewestFingerprint = "";
let lastDownload: Awaited<
  ReturnType<typeof diveComputerCapability.downloadDives>
> | null = null;
let lastCapabilities: Awaited<
  ReturnType<typeof diveComputerCapability.getCapabilities>
> | null = null;
let lastProgress: {
  current: number;
  maximum: number;
  diveCount: number;
} | null = null;
const capturedDuringDownload: Array<{
  index: number;
  size: number;
  fingerprintHex: string;
}> = [];

function showOutput(text: string, pin = false) {
  if (pinned && !pin) return;
  output.textContent = text;
  pinned = pin;
}

function showEvent(name: string, event: unknown) {
  showOutput(JSON.stringify({ event: name, ...(event as object) }, null, 2));
}

function beginAction(text: string) {
  pinned = false;
  showOutput(text);
}

function setDownloadButtonsDisabled(disabled: boolean) {
  downloadOne.disabled = disabled;
  downloadFive.disabled = disabled;
  downloadSince.disabled = disabled || !lastNewestFingerprint;
  saveCapture.disabled = disabled || !lastDownload || lastDownload.diveCount < 1;
}

function renderAvailability() {
  const native = diveComputerCapability.isAvailable();
  status.textContent = native
    ? "Native shell available"
    : "Native bridge unavailable";
  dot.classList.toggle("ready", native);
  showOutput(
    native
      ? "Ready to scan, connect, download, and Save full capture (gitignored fixture; not the logbook)."
      : "Expected in a regular browser. Run this page inside the Android shell.",
  );
  inspect.disabled = !native;
  permissions.disabled = !native;
  scan.disabled = !native;
  connect.disabled = !native;
  setDownloadButtonsDisabled(!native);
  cancel.disabled = !native;
  return native;
}

function showLiveProgress() {
  if (pinned || !downloading) return;
  showOutput(
    JSON.stringify(
      {
        event: "downloadProgress",
        progress: lastProgress,
        captured: capturedDuringDownload,
        lastNewestFingerprint: lastNewestFingerprint || null,
      },
      null,
      2,
    ),
  );
}

async function attachListeners() {
  for (const listener of listeners) {
    await listener.remove();
  }
  listeners.length = 0;
  if (!diveComputerCapability.isAvailable()) return;

  listeners.push(
    await diveComputerCapability.addListener("deviceFound", (event) => {
      devices.set(event.address, event);
      showOutput(
        JSON.stringify(
          { event: "deviceFound", devices: [...devices.values()] },
          null,
          2,
        ),
      );
    }),
  );
  listeners.push(
    await diveComputerCapability.addListener("phaseChanged", (event) => {
      status.textContent = `Phase: ${event.phase}`;
      dot.classList.toggle(
        "ready",
        event.transportReady || event.phase === "idle",
      );
    }),
  );
  listeners.push(
    await diveComputerCapability.addListener("scanStopped", (event) => {
      showEvent("scanStopped", event);
    }),
  );
  listeners.push(
    await diveComputerCapability.addListener("transportReady", (event) => {
      showEvent("transportReady", event);
    }),
  );
  listeners.push(
    await diveComputerCapability.addListener("transportClosed", (event) => {
      showEvent("transportClosed", event);
    }),
  );
  listeners.push(
    await diveComputerCapability.addListener("transportError", (event) => {
      showEvent("transportError", event);
    }),
  );
  listeners.push(
    await diveComputerCapability.addListener("downloadProgress", (event) => {
      lastProgress = event;
      showLiveProgress();
    }),
  );
  listeners.push(
    await diveComputerCapability.addListener("diveCaptured", (event) => {
      capturedDuringDownload.push(event);
      showLiveProgress();
    }),
  );
}

async function runDownload(options: {
  limit: number;
  fingerprintHex?: string;
  label: string;
}) {
  if (!renderAvailability()) return;
  downloading = true;
  setDownloadButtonsDisabled(true);
  lastProgress = null;
  capturedDuringDownload.length = 0;
  beginAction(options.label);
  try {
    const result = await diveComputerCapability.downloadDives({
      limit: options.limit,
      fingerprintHex: options.fingerprintHex,
    });
    lastDownload = result;
    if (result.newestFingerprintHex) {
      lastNewestFingerprint = result.newestFingerprintHex;
    }
    showOutput(summarizeDownload(result), true);
  } catch (error) {
    showOutput(errorMessage(error), true);
  } finally {
    downloading = false;
    setDownloadButtonsDisabled(false);
  }
}

inspect.addEventListener("click", async () => {
  if (!renderAvailability()) return;
  inspect.disabled = true;
  beginAction("Inspecting…");
  try {
    const result = await diveComputerCapability.getCapabilities();
    lastCapabilities = result;
    showOutput(JSON.stringify(result, null, 2));
  } catch (error) {
    showOutput(errorMessage(error));
  } finally {
    inspect.disabled = false;
  }
});

permissions.addEventListener("click", async () => {
  if (!renderAvailability()) return;
  beginAction("Requesting Bluetooth permissions…");
  try {
    const result = await diveComputerCapability.requestPermissions();
    showOutput(JSON.stringify(result, null, 2));
  } catch (error) {
    showOutput(errorMessage(error));
  }
});

scan.addEventListener("click", async () => {
  if (!renderAvailability()) return;
  devices.clear();
  beginAction("Scanning for classic Shearwater advertisements…");
  try {
    const result = await diveComputerCapability.startScan({ timeoutMs: 15000 });
    showOutput(
      JSON.stringify(
        { started: result, hint: "Tap Connect once a device appears." },
        null,
        2,
      ),
    );
  } catch (error) {
    showOutput(errorMessage(error));
  }
});

connect.addEventListener("click", async () => {
  if (!renderAvailability()) return;
  const first = devices.values().next().value;
  if (!first) {
    beginAction("Scan first so a Shearwater advertisement is listed.");
    return;
  }
  beginAction(`Connecting to ${first.name} (${first.address})…`);
  try {
    const result = await diveComputerCapability.connect({
      address: first.address,
      name: first.name,
    });
    showOutput(JSON.stringify(result, null, 2));
  } catch (error) {
    showOutput(errorMessage(error));
  }
});

downloadOne.addEventListener("click", () => {
  void runDownload({
    limit: 1,
    label: "Downloading 1 dive… (not saved)",
  });
});

downloadFive.addEventListener("click", () => {
  void runDownload({
    limit: 5,
    label: "Downloading up to 5 dives… (not saved)",
  });
});

downloadSince.addEventListener("click", () => {
  if (!lastNewestFingerprint) {
    beginAction("Download at least once first so a checkpoint fingerprint exists.");
    return;
  }
  void runDownload({
    limit: 50,
    fingerprintHex: lastNewestFingerprint,
    label: `Downloading new dives since ${lastNewestFingerprint}… (not saved)`,
  });
});

saveCapture.addEventListener("click", async () => {
  if (!lastDownload || lastDownload.diveCount < 1) {
    beginAction("Download at least one dive before saving a fixture.");
    return;
  }
  saveCapture.disabled = true;
  beginAction("Saving full capture into Downloads…");
  try {
    const fixture = buildBleCaptureFixture({
      download: lastDownload,
      apiVersion: lastCapabilities?.apiVersion,
      libdivecomputerCommit: lastCapabilities?.libdivecomputerCommit,
    });
    const filename = bleCaptureFixtureFilename(lastDownload);
    const contents = `${JSON.stringify(fixture, null, 2)}\n`;
    const result = await diveComputerCapability.saveCaptureFixture({
      filename,
      contents,
    });
    showOutput(
      JSON.stringify(
        {
          ...result,
          diveCount: fixture.download.diveCount,
          newestFingerprintHex: fixture.download.newestFingerprintHex,
          next: "Copy that JSON from the phone Downloads folder to web/fixtures/ble/ on the PC, then set BLE_CAPTURE_FIXTURE.",
        },
        null,
        2,
      ),
      true,
    );
  } catch (error) {
    showOutput(errorMessage(error), true);
  } finally {
    setDownloadButtonsDisabled(false);
  }
});

cancel.addEventListener("click", async () => {
  beginAction("Cancelling…");
  try {
    const result = await diveComputerCapability.cancel();
    showOutput(JSON.stringify(result, null, 2));
  } catch (error) {
    showOutput(errorMessage(error));
  }
});

renderAvailability();
void attachListeners();

function summarizeDownload(
  result: Awaited<ReturnType<typeof diveComputerCapability.downloadDives>>,
) {
  const { logTail, ...rest } = result;
  const normalized = normalizeBleDownloadPreview(
    {
      vendor: result.vendor,
      product: result.product,
      serial: result.serial,
      serialHex: result.serialHex,
      firmware: result.firmware,
      model: result.model,
    },
    result.dives.map((dive) => ({
      size: dive.size,
      fingerprintHex: dive.fingerprintHex,
      parsed: dive.parsed
        ? {
            ...dive.parsed,
            gasmixes: dive.parsed.gasmixes.map((gas) => ({
              o2Percent: gas.o2Percent,
              hePercent: gas.hePercent,
            })),
            tanks: dive.parsed.tanks.map((tank) => ({
              beginBar: tank.beginPressureBar,
              endBar: tank.endPressureBar,
              gasmixIndex: tank.gasmixIndex,
            })),
            profile: dive.parsed.profile,
          }
        : undefined,
    })),
  );

  const summary = {
    ...rest,
    normalizedPreview: normalized.map((dive) => ({
      parseOk: dive.parseOk,
      provisionalSource: dive.provisionalSource,
      sourceId: dive.sourceId,
      proposedCanonicalId: dive.proposedCanonicalId,
      diveDate: dive.diveDate,
      durationSeconds: dive.durationSeconds,
      maxDepthM: dive.maxDepthM,
      averageDepth: dive.averageDepth,
      computerModel: dive.computerModel,
      serialNumber: dive.serialNumber,
      gasMixes: dive.gasMixes,
      tankPressuresStartBar: dive.tankPressuresStartBar,
      tankPressuresEndBar: dive.tankPressuresEndBar,
      sampleCountReported: dive.sampleCountReported,
      downsampledSamples: dive.samples.length,
      omissions: dive.omissions,
    })),
    dives: result.dives.map((dive) => {
      const parsed = dive.parsed;
      return {
        size: dive.size,
        fingerprintHex: dive.fingerprintHex,
        parsed: parsed
          ? {
              parseStatus: parsed.parseStatus,
              parseMessage: parsed.parseMessage,
              datetime: parsed.datetime,
              diveTimeSeconds: parsed.diveTimeSeconds,
              diveTime:
                parsed.diveTimeSeconds > 0
                  ? `${Math.floor(parsed.diveTimeSeconds / 60)}:${String(
                      parsed.diveTimeSeconds % 60,
                    ).padStart(2, "0")}`
                  : undefined,
              maxDepthM: roundOptional(parsed.maxDepthM, 2),
              avgDepthM: roundOptional(parsed.avgDepthM, 2),
              temperatureMinC: roundOptional(parsed.temperatureMinC, 1),
              temperatureMaxC: roundOptional(parsed.temperatureMaxC, 1),
              atmosphericBar: roundOptional(parsed.atmosphericBar, 3),
              diveMode: parsed.diveMode,
              sampleCount: parsed.sampleCount,
              gasmixes: parsed.gasmixes.map((gas) => ({
                o2Percent: gas.o2Percent,
                hePercent: gas.hePercent,
              })),
              tanks: parsed.tanks.map((tank) => ({
                beginBar: roundOptional(tank.beginPressureBar, 1),
                endBar: roundOptional(tank.endPressureBar, 1),
                gasmixIndex: tank.gasmixIndex,
              })),
              profilePoints: parsed.profile.length,
            }
          : undefined,
      };
    }),
  };
  const log = logTail?.trim();
  return log
    ? `${JSON.stringify(summary, null, 2)}\n\nlibdivecomputer log\n${log}`
    : JSON.stringify(summary, null, 2);
}

function roundOptional(value: number | undefined, digits: number) {
  if (value == null || Number.isNaN(value)) return undefined;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function requiredElement<T extends HTMLElement>(id: string) {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) throw new Error(`Missing #${id}`);
  return element as T;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
