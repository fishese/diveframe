import { env } from "cloudflare:workers";

export type ImportedDive = {
  id: string;
  diveNumber: number | null;
  diveDate: string | null;
  lastModified: string | null;
  depth: string | null;
  averageDepth: number | null;
  minTemp: number | null;
  maxTemp: number | null;
  lengthText: string | null;
  location: string | null;
  site: string | null;
  buddy: string | null;
  notes: string | null;
  serialNumber: string | null;
  gpsEntryLat: number | null;
  gpsEntryLng: number | null;
  gpsExitLat: number | null;
  gpsExitLng: number | null;
  calculatedJson: string | null;
};

export type DiveRow = ImportedDive & {
  importedAt: string;
  photoCount: number;
};

export type AttachmentRow = {
  id: string;
  diveId: string;
  objectKey: string;
  fileName: string;
  contentType: string;
  size: number;
  caption: string | null;
  sortOrder: number;
  createdAt: string;
};

export type GeocodeRow = {
  query: string;
  displayName: string;
  latitude: number;
  longitude: number;
  fetchedAt: string;
};

let initialized = false;

export async function ensureStorage() {
  if (initialized) return;
  const db = env.DB;
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS dives (
        id TEXT PRIMARY KEY,
        dive_number INTEGER,
        dive_date TEXT,
        last_modified TEXT,
        depth TEXT,
        average_depth REAL,
        min_temp REAL,
        max_temp REAL,
        length_text TEXT,
        location TEXT,
        site TEXT,
        buddy TEXT,
        notes TEXT,
        serial_number TEXT,
        gps_entry_lat REAL,
        gps_entry_lng REAL,
        gps_exit_lat REAL,
        gps_exit_lng REAL,
        calculated_json TEXT,
        imported_at TEXT NOT NULL
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        dive_id TEXT NOT NULL,
        object_key TEXT NOT NULL,
        file_name TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        caption TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (dive_id) REFERENCES dives(id) ON DELETE CASCADE
      )
    `),
    db.prepare("CREATE INDEX IF NOT EXISTS dives_date_idx ON dives(dive_date)"),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS attachments_dive_idx ON attachments(dive_id)",
    ),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS geocodes (
        query TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        fetched_at TEXT NOT NULL
      )
    `),
  ]);
  initialized = true;
}

export async function upsertDives(dives: ImportedDive[]) {
  await ensureStorage();
  const now = new Date().toISOString();
  const statement = env.DB.prepare(`
    INSERT INTO dives (
      id, dive_number, dive_date, last_modified, depth, average_depth,
      min_temp, max_temp, length_text, location, site, buddy, notes,
      serial_number, gps_entry_lat, gps_entry_lng, gps_exit_lat, gps_exit_lng,
      calculated_json, imported_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      dive_number = excluded.dive_number,
      dive_date = excluded.dive_date,
      last_modified = excluded.last_modified,
      depth = excluded.depth,
      average_depth = excluded.average_depth,
      min_temp = excluded.min_temp,
      max_temp = excluded.max_temp,
      length_text = excluded.length_text,
      location = excluded.location,
      site = excluded.site,
      buddy = excluded.buddy,
      notes = excluded.notes,
      serial_number = excluded.serial_number,
      gps_entry_lat = excluded.gps_entry_lat,
      gps_entry_lng = excluded.gps_entry_lng,
      gps_exit_lat = excluded.gps_exit_lat,
      gps_exit_lng = excluded.gps_exit_lng,
      calculated_json = excluded.calculated_json,
      imported_at = excluded.imported_at
  `);

  for (let index = 0; index < dives.length; index += 50) {
    const batch = dives.slice(index, index + 50).map((dive) =>
      statement.bind(
        dive.id,
        dive.diveNumber,
        dive.diveDate,
        dive.lastModified,
        dive.depth,
        dive.averageDepth,
        dive.minTemp,
        dive.maxTemp,
        dive.lengthText,
        dive.location,
        dive.site,
        dive.buddy,
        dive.notes,
        dive.serialNumber,
        dive.gpsEntryLat,
        dive.gpsEntryLng,
        dive.gpsExitLat,
        dive.gpsExitLng,
        dive.calculatedJson,
        now,
      ),
    );
    await env.DB.batch(batch);
  }
}

export async function listDives(): Promise<DiveRow[]> {
  await ensureStorage();
  const result = await env.DB.prepare(`
    SELECT d.*,
           COUNT(a.id) AS photo_count
    FROM dives d
    LEFT JOIN attachments a ON a.dive_id = d.id
    GROUP BY d.id
    ORDER BY COALESCE(d.dive_date, '') DESC, COALESCE(d.dive_number, 0) DESC
  `).all<Record<string, unknown>>();
  return result.results.map(mapDive);
}

export async function getDive(id: string) {
  await ensureStorage();
  const diveResult = await env.DB.prepare(`
    SELECT d.*, COUNT(a.id) AS photo_count
    FROM dives d
    LEFT JOIN attachments a ON a.dive_id = d.id
    WHERE d.id = ?
    GROUP BY d.id
  `)
    .bind(id)
    .first<Record<string, unknown>>();
  if (!diveResult) return null;

  const attachmentResult = await env.DB.prepare(`
    SELECT id, dive_id, object_key, file_name, content_type, size,
           caption, sort_order, created_at
    FROM attachments
    WHERE dive_id = ?
    ORDER BY sort_order, created_at
  `)
    .bind(id)
    .all<Record<string, unknown>>();

  return {
    dive: mapDive(diveResult),
    attachments: attachmentResult.results.map(mapAttachment),
  };
}

export async function addAttachment(attachment: AttachmentRow) {
  await ensureStorage();
  await env.DB.prepare(`
    INSERT INTO attachments (
      id, dive_id, object_key, file_name, content_type, size,
      caption, sort_order, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      attachment.id,
      attachment.diveId,
      attachment.objectKey,
      attachment.fileName,
      attachment.contentType,
      attachment.size,
      attachment.caption,
      attachment.sortOrder,
      attachment.createdAt,
    )
    .run();
}

export async function getAttachment(id: string) {
  await ensureStorage();
  const row = await env.DB.prepare(`
    SELECT id, dive_id, object_key, file_name, content_type, size,
           caption, sort_order, created_at
    FROM attachments
    WHERE id = ?
  `)
    .bind(id)
    .first<Record<string, unknown>>();
  return row ? mapAttachment(row) : null;
}

export async function getGeocode(query: string): Promise<GeocodeRow | null> {
  await ensureStorage();
  const row = await env.DB.prepare(`
    SELECT query, display_name, latitude, longitude, fetched_at
    FROM geocodes
    WHERE query = ?
  `)
    .bind(query)
    .first<Record<string, unknown>>();
  if (!row) return null;
  return {
    query: String(row.query),
    displayName: String(row.display_name),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    fetchedAt: String(row.fetched_at),
  };
}

export async function saveGeocode(geocode: GeocodeRow) {
  await ensureStorage();
  await env.DB.prepare(`
    INSERT INTO geocodes (
      query, display_name, latitude, longitude, fetched_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(query) DO UPDATE SET
      display_name = excluded.display_name,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      fetched_at = excluded.fetched_at
  `)
    .bind(
      geocode.query,
      geocode.displayName,
      geocode.latitude,
      geocode.longitude,
      geocode.fetchedAt,
    )
    .run();
}

function mapDive(row: Record<string, unknown>): DiveRow {
  return {
    id: String(row.id),
    diveNumber: nullableNumber(row.dive_number),
    diveDate: nullableString(row.dive_date),
    lastModified: nullableString(row.last_modified),
    depth: nullableString(row.depth),
    averageDepth: nullableNumber(row.average_depth),
    minTemp: nullableNumber(row.min_temp),
    maxTemp: nullableNumber(row.max_temp),
    lengthText: nullableString(row.length_text),
    location: nullableString(row.location),
    site: nullableString(row.site),
    buddy: nullableString(row.buddy),
    notes: nullableString(row.notes),
    serialNumber: nullableString(row.serial_number),
    gpsEntryLat: nullableNumber(row.gps_entry_lat),
    gpsEntryLng: nullableNumber(row.gps_entry_lng),
    gpsExitLat: nullableNumber(row.gps_exit_lat),
    gpsExitLng: nullableNumber(row.gps_exit_lng),
    calculatedJson: nullableString(row.calculated_json),
    importedAt: String(row.imported_at),
    photoCount: Number(row.photo_count ?? 0),
  };
}

function mapAttachment(row: Record<string, unknown>): AttachmentRow {
  return {
    id: String(row.id),
    diveId: String(row.dive_id),
    objectKey: String(row.object_key),
    fileName: String(row.file_name),
    contentType: String(row.content_type),
    size: Number(row.size),
    caption: nullableString(row.caption),
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: String(row.created_at),
  };
}

function nullableString(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
