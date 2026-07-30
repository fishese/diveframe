import type { CatalogSite, DiveSiteCatalog } from "./dive-site-catalog";

export type IssueLevel = "error" | "warning";

export type ValidationIssue = {
  level: IssueLevel;
  code: string;
  message: string;
  siteIds: string[];
};

export type ValidationReport = {
  ok: boolean;
  siteCount: number;
  validSiteCount: number;
  errorCount: number;
  warningCount: number;
  issues: ValidationIssue[];
  catalog: DiveSiteCatalog | null;
};

export const DIVE_SITE_VALIDATION_THRESHOLDS = {
  isolatedSiteKm: 250,
  localityOutlierFloorKm: 15,
  localityOutlierMultiple: 3,
  duplicateDistanceMeters: 150,
} as const;

type Coordinates = CatalogSite["coordinates"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function issue(
  code: string,
  message: string,
  siteIds: string[],
): ValidationIssue {
  return { level: "error", code, message, siteIds };
}

function validateSite(raw: unknown, index: number): {
  site: CatalogSite | null;
  issues: ValidationIssue[];
} {
  const issues: ValidationIssue[] = [];
  if (!isRecord(raw)) {
    return {
      site: null,
      issues: [
        issue(
          "invalid-site",
          `Site at index ${index} must be an object.`,
          [`#${index}`],
        ),
      ],
    };
  }

  const reference =
    typeof raw.id === "string" && raw.id.trim() ? raw.id : `#${index}`;
  const siteIds = [reference];

  if (typeof raw.id !== "string" || !raw.id.trim()) {
    issues.push(issue("invalid-id", '"id" must be a non-empty string.', siteIds));
  }
  if (typeof raw.name !== "string" || !raw.name.trim()) {
    issues.push(
      issue("invalid-name", '"name" must be a non-empty string.', siteIds),
    );
  }
  if (
    !Array.isArray(raw.aliases) ||
    !raw.aliases.every((alias) => typeof alias === "string")
  ) {
    issues.push(
      issue("invalid-aliases", '"aliases" must be an array of strings.', siteIds),
    );
  }

  if (!isRecord(raw.coordinates)) {
    issues.push(
      issue(
        "invalid-coordinates",
        '"coordinates" must contain numeric latitude and longitude.',
        siteIds,
      ),
    );
  } else {
    const { latitude, longitude } = raw.coordinates;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      issues.push(
        issue(
          "invalid-coordinates",
          "coordinates.latitude and coordinates.longitude must be finite numbers.",
          siteIds,
        ),
      );
    } else if (
      (latitude as number) < -90 ||
      (latitude as number) > 90 ||
      (longitude as number) < -180 ||
      (longitude as number) > 180
    ) {
      issues.push(
        issue(
          "coordinates-out-of-range",
          `Coordinates (${latitude}, ${longitude}) are outside the valid latitude/longitude range.`,
          siteIds,
        ),
      );
    }
  }

  if (!isRecord(raw.place)) {
    issues.push(
      issue(
        "invalid-place",
        '"place" must be an object with countryCode, country, region, and locality.',
        siteIds,
      ),
    );
  } else {
    for (const field of ["countryCode", "country", "region", "locality"]) {
      if (!(field in raw.place) || !isNullableString(raw.place[field])) {
        issues.push(
          issue(
            "invalid-place-field",
            `"place.${field}" must be a string or null.`,
            siteIds,
          ),
        );
      }
    }
  }

  if (!isRecord(raw.source)) {
    issues.push(
      issue(
        "invalid-source",
        '"source" must contain kind and reference.',
        siteIds,
      ),
    );
  } else {
    if (typeof raw.source.kind !== "string" || !raw.source.kind.trim()) {
      issues.push(
        issue(
          "invalid-source-kind",
          '"source.kind" must be a non-empty string.',
          siteIds,
        ),
      );
    }
    if (
      !("reference" in raw.source) ||
      !isNullableString(raw.source.reference)
    ) {
      issues.push(
        issue(
          "invalid-source-reference",
          '"source.reference" must be a string or null.',
          siteIds,
        ),
      );
    }
  }

  if (
    typeof raw.status !== "string" ||
    !["active", "review", "retired"].includes(raw.status)
  ) {
    issues.push(
      issue(
        "invalid-status",
        '"status" must be "active", "review", or "retired".',
        siteIds,
      ),
    );
  }
  if (
    typeof raw.updatedAt !== "string" ||
    !raw.updatedAt.trim() ||
    Number.isNaN(Date.parse(raw.updatedAt))
  ) {
    issues.push(
      issue(
        "invalid-updated-at",
        '"updatedAt" must be a valid ISO 8601 date or timestamp.',
        siteIds,
      ),
    );
  }

  return {
    site: issues.length === 0 ? (raw as unknown as CatalogSite) : null,
    issues,
  };
}

function haversineKm(a: Coordinates, b: Coordinates): number {
  const earthRadiusKm = 6371;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(b.latitude - a.latitude);
  const longitudeDelta = toRadians(b.longitude - a.longitude);
  const latitudeA = toRadians(a.latitude);
  const latitudeB = toRadians(b.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeA) *
      Math.cos(latitudeB) *
      Math.sin(longitudeDelta / 2) ** 2;
  return (
    2 *
    earthRadiusKm *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

function sphericalCentroid(points: Coordinates[]): Coordinates {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const toDegrees = (radians: number) => (radians * 180) / Math.PI;
  let x = 0;
  let y = 0;
  let z = 0;

  for (const point of points) {
    const latitude = toRadians(point.latitude);
    const longitude = toRadians(point.longitude);
    x += Math.cos(latitude) * Math.cos(longitude);
    y += Math.cos(latitude) * Math.sin(longitude);
    z += Math.sin(latitude);
  }

  x /= points.length;
  y /= points.length;
  z /= points.length;
  const longitude = Math.atan2(y, x);
  const hypotenuse = Math.sqrt(x * x + y * y);
  const latitude = Math.atan2(z, hypotenuse);
  return {
    latitude: toDegrees(latitude),
    longitude: toDegrees(longitude),
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function normalizeName(name: string): string {
  return name
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function duplicateIdIssues(sites: CatalogSite[]): ValidationIssue[] {
  const counts = new Map<string, number>();
  for (const site of sites) counts.set(site.id, (counts.get(site.id) ?? 0) + 1);
  return [...counts]
    .filter(([, count]) => count > 1)
    .map(([id, count]) =>
      issue(
        "duplicate-id",
        `"${id}" is used by ${count} sites; IDs must be unique.`,
        [id],
      ),
    );
}

function isolatedSiteIssues(sites: CatalogSite[]): ValidationIssue[] {
  if (sites.length < 2) return [];
  const issues: ValidationIssue[] = [];

  for (const site of sites) {
    let nearestDistanceKm = Number.POSITIVE_INFINITY;
    let nearestSite: CatalogSite | null = null;
    for (const other of sites) {
      if (other === site) continue;
      const distanceKm = haversineKm(site.coordinates, other.coordinates);
      if (distanceKm < nearestDistanceKm) {
        nearestDistanceKm = distanceKm;
        nearestSite = other;
      }
    }
    if (
      nearestSite &&
      nearestDistanceKm > DIVE_SITE_VALIDATION_THRESHOLDS.isolatedSiteKm
    ) {
      issues.push({
        level: "warning",
        code: "isolated-site",
        message: `"${site.name}" (${site.id}) has no other site within ${DIVE_SITE_VALIDATION_THRESHOLDS.isolatedSiteKm} km; its nearest neighbor is "${nearestSite.name}" at ${nearestDistanceKm.toFixed(0)} km. Double-check the coordinates.`,
        siteIds: [site.id],
      });
    }
  }
  return issues;
}

function localityOutlierIssues(sites: CatalogSite[]): ValidationIssue[] {
  const groups = new Map<string, CatalogSite[]>();
  for (const site of sites) {
    const locality = site.place.locality?.normalize("NFKC").trim();
    if (!locality) continue;
    const countryCode =
      site.place.countryCode?.normalize("NFKC").trim().toUpperCase() ?? "";
    const key = `${countryCode}\u0000${locality.toLocaleLowerCase()}`;
    const group = groups.get(key) ?? [];
    group.push(site);
    groups.set(key, group);
  }

  const issues: ValidationIssue[] = [];
  for (const group of groups.values()) {
    if (group.length < 3) continue;
    const center = sphericalCentroid(group.map((site) => site.coordinates));
    const distances = group.map((site) =>
      haversineKm(site.coordinates, center),
    );
    const typicalDistance = median(distances);
    const threshold = Math.max(
      DIVE_SITE_VALIDATION_THRESHOLDS.localityOutlierFloorKm,
      typicalDistance *
        DIVE_SITE_VALIDATION_THRESHOLDS.localityOutlierMultiple,
    );

    group.forEach((site, index) => {
      if (distances[index] <= threshold) return;
      issues.push({
        level: "warning",
        code: "locality-outlier",
        message: `"${site.name}" (${site.id}) is ${distances[index].toFixed(1)} km from the center of "${site.place.locality}", compared with a typical distance of ${typicalDistance.toFixed(1)} km. Double-check the coordinates or locality.`,
        siteIds: [site.id],
      });
    });
  }
  return issues;
}

function nearbyDuplicateIssues(sites: CatalogSite[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (let first = 0; first < sites.length; first += 1) {
    for (let second = first + 1; second < sites.length; second += 1) {
      const a = sites[first];
      const b = sites[second];
      const distanceMeters =
        haversineKm(a.coordinates, b.coordinates) * 1000;
      if (
        distanceMeters >
        DIVE_SITE_VALIDATION_THRESHOLDS.duplicateDistanceMeters
      ) {
        continue;
      }
      const normalizedA = normalizeName(a.name);
      const normalizedB = normalizeName(b.name);
      const sameName =
        normalizedA.length > 0 &&
        normalizedB.length > 0 &&
        normalizedA === normalizedB;
      issues.push({
        level: sameName ? "error" : "warning",
        code: "possible-duplicate",
        message: `"${a.name}" (${a.id}) and "${b.name}" (${b.id}) are ${distanceMeters.toFixed(0)} m apart${sameName ? " and have the same normalized name" : ""}; review whether they represent the same site.`,
        siteIds: [a.id, b.id],
      });
    }
  }
  return issues;
}

export function validateDiveSitesFile(data: unknown): ValidationReport {
  const structuralIssues: ValidationIssue[] = [];
  if (!isRecord(data)) {
    structuralIssues.push(
      issue("invalid-root", "The catalog must be a JSON object.", []),
    );
    return buildReport(0, [], structuralIssues, null);
  }

  if (data.schemaVersion !== 1) {
    structuralIssues.push(
      issue(
        "unsupported-schema-version",
        '"schemaVersion" must be the supported integer value 1.',
        [],
      ),
    );
  }
  if (!Array.isArray(data.sites)) {
    structuralIssues.push(
      issue("missing-sites-array", '"sites" must be an array.', []),
    );
    return buildReport(0, [], structuralIssues, null);
  }

  const validSites: CatalogSite[] = [];
  data.sites.forEach((raw, index) => {
    const result = validateSite(raw, index);
    structuralIssues.push(...result.issues);
    if (result.site) validSites.push(result.site);
  });

  const geographicIssues = [
    ...duplicateIdIssues(validSites),
    ...isolatedSiteIssues(validSites),
    ...localityOutlierIssues(validSites),
    ...nearbyDuplicateIssues(validSites),
  ];
  const allIssues = [...structuralIssues, ...geographicIssues];
  const catalog =
    !allIssues.some(({ level }) => level === "error") &&
    data.schemaVersion === 1
      ? ({ schemaVersion: 1, sites: validSites } satisfies DiveSiteCatalog)
      : null;
  return buildReport(data.sites.length, validSites, allIssues, catalog);
}

function buildReport(
  siteCount: number,
  validSites: CatalogSite[],
  issues: ValidationIssue[],
  catalog: DiveSiteCatalog | null,
): ValidationReport {
  const errorCount = issues.filter(({ level }) => level === "error").length;
  const warningCount = issues.length - errorCount;
  return {
    ok: errorCount === 0,
    siteCount,
    validSiteCount: validSites.length,
    errorCount,
    warningCount,
    issues,
    catalog,
  };
}
