/**
 * Cross-tab coordination for the device-local logbook.
 *
 * IndexedDB serializes transactions, but React state in another tab can stay
 * stale, and long read/transform/write cycles (photo optimization) need an
 * optimistic revision check before committing.
 */

const CHANNEL_NAME = "diveframe-local-data";
const REVISION_KEY = "diveframe-data-revision";

export type LocalDataChangeReason =
  | "backup-restore"
  | "optimize-photos"
  | "erase"
  | "import"
  | "mutation"
  | "preferences";

export type LocalDataChangeMessage = {
  type: "data-changed";
  reason: LocalDataChangeReason;
  revision: number;
  sourceId: string;
};

export class LocalDataConflictError extends Error {
  constructor(message = "Local data changed in another tab while this work was running.") {
    super(message);
    this.name = "LocalDataConflictError";
  }
}

let tabId: string | null = null;
let channel: BroadcastChannel | null | undefined;

export function getLocalTabId() {
  if (tabId) return tabId;
  tabId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return tabId;
}

export function readLocalDataRevision(): number {
  if (typeof localStorage === "undefined") return 0;
  const raw = localStorage.getItem(REVISION_KEY);
  const value = raw == null ? 0 : Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

export function bumpLocalDataRevision(): number {
  const next = readLocalDataRevision() + 1;
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(REVISION_KEY, String(next));
  }
  return next;
}

export function assertLocalDataRevision(expected: number) {
  const current = readLocalDataRevision();
  if (current !== expected) {
    throw new LocalDataConflictError();
  }
  return current;
}

function getChannel() {
  if (channel !== undefined) return channel;
  if (typeof BroadcastChannel === "undefined") {
    channel = null;
    return channel;
  }
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
  } catch {
    channel = null;
  }
  return channel;
}

export function publishLocalDataChange(reason: LocalDataChangeReason) {
  const revision = bumpLocalDataRevision();
  const message: LocalDataChangeMessage = {
    type: "data-changed",
    reason,
    revision,
    sourceId: getLocalTabId(),
  };
  getChannel()?.postMessage(message);
  return message;
}

export function subscribeLocalDataChanges(
  onChange: (message: LocalDataChangeMessage) => void,
) {
  const active = getChannel();
  if (!active) return () => undefined;

  const sourceId = getLocalTabId();
  const listener = (event: MessageEvent<LocalDataChangeMessage>) => {
    const message = event.data;
    if (!message || message.type !== "data-changed") return;
    if (message.sourceId === sourceId) return;
    onChange(message);
  };
  active.addEventListener("message", listener);
  return () => active.removeEventListener("message", listener);
}

/** Test helper: reset module channel state between Node tests. */
export function resetCrossTabSyncForTests() {
  channel?.close();
  channel = undefined;
  tabId = null;
}
