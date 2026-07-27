import { env } from "cloudflare:workers";

export type ImportedDive = {
  id: string;
  source: "shearwater" | "subsurface";
  sourceId: string;
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

export type DiveRow = Omit<ImportedDive, "source" | "sourceId"> & {
  importedAt: string;
  photoCount: number;
  userSite: string | null;
  resolvedLocation: string | null;
  resolvedCity: string | null;
  resolvedCountry: string | null;
  sources: string[];
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

export type CatalogSite = {
  id: string;
  name: string;
  aliases: string[];
  latitude: number;
  longitude: number;
  countryCode: string | null;
  country: string | null;
  region: string | null;
  locality: string | null;
  source: string;
  sourceRef: string | null;
  notes: string | null;
  distanceKm: number;
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
        user_site TEXT,
        resolved_location TEXT,
        resolved_city TEXT,
        resolved_country TEXT,
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
    db.prepare(`
      CREATE TABLE IF NOT EXISTS dive_sources (
        source TEXT NOT NULL,
        source_record_id TEXT NOT NULL,
        dive_id TEXT NOT NULL,
        imported_at TEXT NOT NULL,
        PRIMARY KEY (source, source_record_id),
        FOREIGN KEY (dive_id) REFERENCES dives(id) ON DELETE CASCADE
      )
    `),
    db.prepare("CREATE INDEX IF NOT EXISTS dives_date_idx ON dives(dive_date)"),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS attachments_dive_idx ON attachments(dive_id)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS dive_sources_dive_idx ON dive_sources(dive_id)",
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
    db.prepare(`
      CREATE TABLE IF NOT EXISTS dive_site_catalog (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        aliases_json TEXT NOT NULL DEFAULT '[]',
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        country_code TEXT,
        country TEXT,
        region TEXT,
        locality TEXT,
        source TEXT NOT NULL,
        source_ref TEXT,
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        updated_at TEXT NOT NULL
      )
    `),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS dive_site_catalog_coordinates_idx ON dive_site_catalog(latitude, longitude)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS dive_site_catalog_status_idx ON dive_site_catalog(status)",
    ),
    db.prepare(`
      INSERT OR IGNORE INTO dive_site_catalog (
        id, name, aliases_json, latitude, longitude, country_code,
        country, region, locality, source, source_ref, notes, status, updated_at
      ) VALUES (
        'hk-sharp-island',
        'Sharp Island',
        '["Kiu Tsui Chau"]',
        22.3636,
        114.2928,
        'HK',
        'Hong Kong',
        'New Territories',
        'Sai Kung',
        'manual_seed',
        NULL,
        'Initial catalog example supplied by the owner.',
        'active',
        '2026-07-28T00:00:00.000Z'
      )
    `),
    db.prepare(`
      INSERT OR IGNORE INTO dive_site_catalog (
        id, name, aliases_json, latitude, longitude, country_code,
        country, region, locality, source, source_ref, notes, status, updated_at
      ) VALUES (
        'hk-basalt-island',
        'Basalt Island',
        '["Fo Siu Pai","Shek Chau"]',
        22.3158,
        114.3656,
        'HK',
        'Hong Kong',
        'New Territories',
        'Sai Kung',
        'manual_seed',
        NULL,
        'Initial catalog example supplied by the owner.',
        'active',
        '2026-07-28T00:00:00.000Z'
      )
    `),
  ]);

  const diveColumns = await db
    .prepare("PRAGMA table_info(dives)")
    .all<{ name: string }>();
  const existingColumns = new Set(diveColumns.results.map((column) => column.name));
  const additiveColumns = [
    ["user_site", "ALTER TABLE dives ADD COLUMN user_site TEXT"],
    ["resolved_location", "ALTER TABLE dives ADD COLUMN resolved_location TEXT"],
    ["resolved_city", "ALTER TABLE dives ADD COLUMN resolved_city TEXT"],
    ["resolved_country", "ALTER TABLE dives ADD COLUMN resolved_country TEXT"],
  ] as const;
  const missingColumns = additiveColumns
    .filter(([name]) => !existingColumns.has(name))
    .map(([, sql]) => db.prepare(sql));
  if (missingColumns.length) await db.batch(missingColumns);

  initialized = true;
}

export async function upsertDives(dives: ImportedDive[]) {
  await ensureStorage();
  const now = new Date().toISOString();
  const [existingDives, existingSources] = await Promise.all([
    env.DB.prepare(`
      SELECT id, dive_date, depth, serial_number
      FROM dives
    `).all<Record<string, unknown>>(),
    env.DB.prepare(`
      SELECT source, source_record_id, dive_id
      FROM dive_sources
    `).all<Record<string, unknown>>(),
  ]);
  const candidates = [...existingDives.results];
  const candidateIds = new Set(candidates.map((candidate) => String(candidate.id)));
  const sourceMappings = new Map(
    existingSources.results.map((mapping) => [
      sourceKey(String(mapping.source), String(mapping.source_record_id)),
      String(mapping.dive_id),
    ]),
  );
  const statements: ReturnType<typeof env.DB.prepare>[] = [];

  for (const dive of dives) {
    const canonicalId = resolveCanonicalDiveId(
      dive,
      candidates,
      candidateIds,
      sourceMappings,
    );
    statements.push(mergeDive(canonicalId, dive, now));
    statements.push(env.DB.prepare(`
      INSERT INTO dive_sources (source, source_record_id, dive_id, imported_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(source, source_record_id) DO UPDATE SET
        dive_id = excluded.dive_id,
        imported_at = excluded.imported_at
    `)
      .bind(dive.source, dive.sourceId, canonicalId, now));
    sourceMappings.set(sourceKey(dive.source, dive.sourceId), canonicalId);
    if (!candidateIds.has(canonicalId)) {
      candidates.push({
        id: canonicalId,
        dive_date: dive.diveDate,
        depth: dive.depth,
        serial_number: dive.serialNumber,
      });
      candidateIds.add(canonicalId);
    }
  }

  for (let index = 0; index < statements.length; index += 80) {
    await env.DB.batch(statements.slice(index, index + 80));
  }
}

function resolveCanonicalDiveId(
  dive: ImportedDive,
  candidates: Record<string, unknown>[],
  candidateIds: Set<string>,
  sourceMappings: Map<string, string>,
) {
  const mapped = sourceMappings.get(sourceKey(dive.source, dive.sourceId));
  if (mapped) return mapped;

  if (dive.source === "shearwater" && candidateIds.has(dive.id)) return dive.id;

  const matched = findMatchingDive(dive, candidates);
  if (matched) return matched;
  return dive.source === "shearwater"
    ? dive.id
    : `subsurface:${dive.sourceId}`;
}

function findMatchingDive(
  dive: ImportedDive,
  candidates: Record<string, unknown>[],
) {
  if (!dive.diveDate) return null;
  const incomingTime = parseSqlDate(dive.diveDate);
  const incomingSerial = normalizeSerial(dive.serialNumber);
  const incomingDepth = nullableNumber(dive.depth);
  let best: { id: string; score: number } | null = null;

  for (const candidate of candidates) {
    const candidateTime = parseSqlDate(nullableString(candidate.dive_date));
    if (incomingTime === null || candidateTime === null) continue;
    const secondsApart = Math.abs(incomingTime - candidateTime) / 1000;
    if (secondsApart > 300) continue;
    const candidateSerial = normalizeSerial(nullableString(candidate.serial_number));
    const sameSerial =
      Boolean(incomingSerial) &&
      Boolean(candidateSerial) &&
      incomingSerial === candidateSerial;
    const candidateDepth = nullableNumber(candidate.depth);
    const depthApart =
      incomingDepth === null || candidateDepth === null
        ? 0
        : Math.abs(incomingDepth - candidateDepth);

    if (!sameSerial && (secondsApart > 90 || depthApart > 1)) continue;
    if (sameSerial && depthApart > 3) continue;
    const score = (sameSerial ? 10_000 : 0) - secondsApart - depthApart * 20;
    if (!best || score > best.score) best = { id: String(candidate.id), score };
  }

  return best?.id ?? null;
}

function mergeDive(canonicalId: string, dive: ImportedDive, now: string) {
  const preferIncoming = dive.source === "shearwater" ? 1 : 0;
  return env.DB.prepare(`
    INSERT INTO dives (
      id, dive_number, dive_date, last_modified, depth, average_depth,
      min_temp, max_temp, length_text, location, site, buddy, notes,
      serial_number, gps_entry_lat, gps_entry_lng, gps_exit_lat, gps_exit_lng,
      calculated_json, imported_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      dive_number = CASE WHEN ? = 1 AND excluded.dive_number IS NOT NULL
        THEN excluded.dive_number ELSE COALESCE(dives.dive_number, excluded.dive_number) END,
      dive_date = CASE WHEN ? = 1 AND excluded.dive_date IS NOT NULL
        THEN excluded.dive_date ELSE COALESCE(dives.dive_date, excluded.dive_date) END,
      last_modified = CASE WHEN ? = 1 AND excluded.last_modified IS NOT NULL
        THEN excluded.last_modified ELSE COALESCE(dives.last_modified, excluded.last_modified) END,
      depth = CASE WHEN ? = 1 AND excluded.depth IS NOT NULL
        THEN excluded.depth ELSE COALESCE(dives.depth, excluded.depth) END,
      average_depth = CASE WHEN ? = 1 AND excluded.average_depth IS NOT NULL
        THEN excluded.average_depth ELSE COALESCE(dives.average_depth, excluded.average_depth) END,
      min_temp = CASE WHEN ? = 1 AND excluded.min_temp IS NOT NULL
        THEN excluded.min_temp ELSE COALESCE(dives.min_temp, excluded.min_temp) END,
      max_temp = CASE WHEN ? = 1 AND excluded.max_temp IS NOT NULL
        THEN excluded.max_temp ELSE COALESCE(dives.max_temp, excluded.max_temp) END,
      length_text = CASE WHEN ? = 1 AND excluded.length_text IS NOT NULL
        THEN excluded.length_text ELSE COALESCE(dives.length_text, excluded.length_text) END,
      location = COALESCE(dives.location, excluded.location),
      site = COALESCE(dives.site, excluded.site),
      buddy = COALESCE(dives.buddy, excluded.buddy),
      notes = COALESCE(dives.notes, excluded.notes),
      serial_number = CASE WHEN ? = 1 AND excluded.serial_number IS NOT NULL
        THEN excluded.serial_number ELSE COALESCE(dives.serial_number, excluded.serial_number) END,
      gps_entry_lat = COALESCE(dives.gps_entry_lat, excluded.gps_entry_lat),
      gps_entry_lng = COALESCE(dives.gps_entry_lng, excluded.gps_entry_lng),
      gps_exit_lat = COALESCE(dives.gps_exit_lat, excluded.gps_exit_lat),
      gps_exit_lng = COALESCE(dives.gps_exit_lng, excluded.gps_exit_lng),
      calculated_json = CASE WHEN ? = 1 AND excluded.calculated_json IS NOT NULL
        THEN excluded.calculated_json ELSE COALESCE(dives.calculated_json, excluded.calculated_json) END,
      imported_at = excluded.imported_at
  `)
    .bind(
      canonicalId,
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
      ...Array(10).fill(preferIncoming),
    );
}

export async function listDives(): Promise<DiveRow[]> {
  await ensureStorage();
  const result = await env.DB.prepare(`
    SELECT d.*,
           COUNT(DISTINCT a.id) AS photo_count,
           GROUP_CONCAT(DISTINCT s.source) AS sources
    FROM dives d
    LEFT JOIN attachments a ON a.dive_id = d.id
    LEFT JOIN dive_sources s ON s.dive_id = d.id
    GROUP BY d.id
    ORDER BY COALESCE(d.dive_date, '') DESC, COALESCE(d.dive_number, 0) DESC
  `).all<Record<string, unknown>>();
  return result.results.map(mapDive);
}

export async function getDive(id: string) {
  await ensureStorage();
  const diveResult = await env.DB.prepare(`
    SELECT d.*, COUNT(DISTINCT a.id) AS photo_count,
           GROUP_CONCAT(DISTINCT s.source) AS sources
    FROM dives d
    LEFT JOIN attachments a ON a.dive_id = d.id
    LEFT JOIN dive_sources s ON s.dive_id = d.id
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

export async function updateDiveSite(id: string, site: string | null) {
  await ensureStorage();
  await env.DB.prepare("UPDATE dives SET user_site = ? WHERE id = ?")
    .bind(site, id)
    .run();
  return getDive(id);
}

export async function saveResolvedLocation(
  id: string,
  location: { label: string; city: string | null; country: string | null },
) {
  await ensureStorage();
  await env.DB.prepare(`
    UPDATE dives
    SET resolved_location = ?, resolved_city = ?, resolved_country = ?
    WHERE id = ?
  `)
    .bind(location.label, location.city, location.country, id)
    .run();
  return getDive(id);
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

export async function listCatalogSitesNear(
  latitude: number,
  longitude: number,
  radiusKm = 30,
): Promise<CatalogSite[]> {
  await ensureStorage();
  const latitudeDelta = radiusKm / 111;
  const longitudeScale = Math.max(Math.cos((latitude * Math.PI) / 180), 0.1);
  const longitudeDelta = radiusKm / (111 * longitudeScale);
  const result = await env.DB.prepare(`
    SELECT id, name, aliases_json, latitude, longitude, country_code,
           country, region, locality, source, source_ref, notes
    FROM dive_site_catalog
    WHERE status = 'active'
      AND latitude BETWEEN ? AND ?
      AND longitude BETWEEN ? AND ?
  `)
    .bind(
      latitude - latitudeDelta,
      latitude + latitudeDelta,
      longitude - longitudeDelta,
      longitude + longitudeDelta,
    )
    .all<Record<string, unknown>>();

  return result.results
    .map((row) => {
      const siteLatitude = Number(row.latitude);
      const siteLongitude = Number(row.longitude);
      return {
        id: String(row.id),
        name: String(row.name),
        aliases: stringArray(row.aliases_json),
        latitude: siteLatitude,
        longitude: siteLongitude,
        countryCode: nullableString(row.country_code),
        country: nullableString(row.country),
        region: nullableString(row.region),
        locality: nullableString(row.locality),
        source: String(row.source),
        sourceRef: nullableString(row.source_ref),
        notes: nullableString(row.notes),
        distanceKm: distanceKm(latitude, longitude, siteLatitude, siteLongitude),
      };
    })
    .filter((site) => site.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
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
    userSite: nullableString(row.user_site),
    resolvedLocation: nullableString(row.resolved_location),
    resolvedCity: nullableString(row.resolved_city),
    resolvedCountry: nullableString(row.resolved_country),
    sources: nullableString(row.sources)?.split(",").filter(Boolean) ?? [],
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

function normalizeSerial(value: string | null) {
  return value?.replace(/[^a-z0-9]/gi, "").toUpperCase() || null;
}

function sourceKey(source: string, sourceRecordId: string) {
  return `${source}\u0000${sourceRecordId}`;
}

function parseSqlDate(value: string | null) {
  if (!value) return null;
  const timestamp = new Date(value.replace(" ", "T")).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function stringArray(value: unknown) {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLat = radians(lat2 - lat1);
  const deltaLng = radians(lng2 - lng1);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(radians(lat1)) *
      Math.cos(radians(lat2)) *
      Math.sin(deltaLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
