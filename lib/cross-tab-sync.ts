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
let memoryRevision = 0;

export function getLocalTabId() {
  if (tabId) return tabId;
  tabId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return tabId;
}

export function readLocalDataRevision(): number {
  if (typeof localStorage === "undefined") return memoryRevision;
  try {
    const raw = localStorage.getItem(REVISION_KEY);
    const value = raw == null ? 0 : Number(raw);
    const stored = Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
    memoryRevision = Math.max(memoryRevision, stored);
  } catch {
    // Some privacy modes expose localStorage but throw for every operation.
  }
  return memoryRevision;
}

export function bumpLocalDataRevision(): number {
  const next = readLocalDataRevision() + 1;
  memoryRevision = next;
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(REVISION_KEY, String(next));
    } catch {
      // IndexedDB mutations must not be reported as failed merely because the
      // optional cross-tab revision marker cannot be written.
    }
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
  try {
    getChannel()?.postMessage(message);
  } catch {
    // A closing page can invalidate the channel after it was created.
  }
  return message;
}

export function subscribeLocalDataChanges(
  onChange: (message: LocalDataChangeMessage) => void,
) {
  const active = getChannel();
  const sourceId = getLocalTabId();
  if (active) {
    const listener = (event: MessageEvent<LocalDataChangeMessage>) => {
      const message = event.data;
      if (!message || message.type !== "data-changed") return;
      if (message.sourceId === sourceId) return;
      onChange(message);
    };
    active.addEventListener("message", listener);
    return () => active.removeEventListener("message", listener);
  }

  // BroadcastChannel is absent in some embedded/older browsers. The revision
  // key still produces a storage event in other tabs, which is enough to make
  // them reload current IndexedDB state.
  if (typeof window !== "undefined" && "addEventListener" in window) {
    const listener = (event: StorageEvent) => {
      if (event.key !== REVISION_KEY || event.newValue === null) return;
      const revision = Number(event.newValue);
      if (!Number.isFinite(revision) || revision < 0) return;
      memoryRevision = Math.max(memoryRevision, Math.floor(revision));
      onChange({
        type: "data-changed",
        reason: "mutation",
        revision: Math.floor(revision),
        sourceId: "storage-event",
      });
    };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }

  return () => undefined;
}

/** Test helper: reset module channel state between Node tests. */
export function resetCrossTabSyncForTests() {
  channel?.close();
  channel = undefined;
  tabId = null;
  memoryRevision = 0;
}
