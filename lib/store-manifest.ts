export const STORE_NAMES = {
  dives: "dives",
  sourceRecords: "sourceRecords",
  attachments: "attachments",
  siteContributions: "siteContributions",
  composerSettings: "composerSettings",
  composerPresets: "composerPresets",
  backgrounds: "backgrounds",
  brandingAssets: "brandingAssets",
  appPreferences: "appPreferences",
  rawDiveRecords: "rawDiveRecords",
  deviceCheckpoints: "deviceCheckpoints",
  trips: "trips",
  supplementaryCatalog: "supplementaryCatalog",
} as const;

export type StoreName = (typeof STORE_NAMES)[keyof typeof STORE_NAMES];

export type EraseScope = "all-data" | "dive-data-only";

export type StoreErasePolicy = {
  eraseAllData: boolean;
  eraseDiveDataOnly: boolean;
};

/** Central coverage for backup, erase, and schema creation. */
export const STORE_MANIFEST: Record<StoreName, StoreErasePolicy> = {
  dives: { eraseAllData: true, eraseDiveDataOnly: true },
  sourceRecords: { eraseAllData: true, eraseDiveDataOnly: true },
  attachments: { eraseAllData: true, eraseDiveDataOnly: false },
  siteContributions: { eraseAllData: true, eraseDiveDataOnly: true },
  composerSettings: { eraseAllData: true, eraseDiveDataOnly: false },
  composerPresets: { eraseAllData: true, eraseDiveDataOnly: false },
  backgrounds: { eraseAllData: true, eraseDiveDataOnly: false },
  brandingAssets: { eraseAllData: true, eraseDiveDataOnly: false },
  appPreferences: { eraseAllData: true, eraseDiveDataOnly: false },
  rawDiveRecords: { eraseAllData: true, eraseDiveDataOnly: true },
  deviceCheckpoints: { eraseAllData: true, eraseDiveDataOnly: true },
  trips: { eraseAllData: true, eraseDiveDataOnly: true },
  supplementaryCatalog: { eraseAllData: true, eraseDiveDataOnly: false },
};

export const ALL_STORE_NAMES: StoreName[] = Object.values(STORE_NAMES);

export function storeNamesForErase(scope: EraseScope): StoreName[] {
  const flag = scope === "all-data" ? "eraseAllData" : "eraseDiveDataOnly";
  return ALL_STORE_NAMES.filter((name) => STORE_MANIFEST[name][flag]);
}

/** Every store included in portable app-data backups. */
export const BACKUP_STORE_NAMES: StoreName[] = [...ALL_STORE_NAMES];
