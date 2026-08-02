import type { LocalDive } from "./indexed-db";
import type { Dive } from "./dive-model";

export function toNormalizedDive(dive: LocalDive): Dive {
  return {
    id: dive.id,
    number: dive.diveNumber,
    startDateTime: dive.diveDate,
    durationSeconds: dive.durationSeconds,
    category: dive.category,
    categorySource: dive.categorySource,
    site: {
      id: dive.userSiteCatalogId,
      originalName:
        dive.sourceSiteNames.shearwater ??
        dive.sourceSiteNames.subsurface ??
        dive.sourceSiteNames.uddf ??
        dive.sourceSiteNames.fit ??
        dive.site ??
        dive.location,
      userName: dive.userSite,
      latitude: dive.gpsEntryLat,
      longitude: dive.gpsEntryLng,
    },
    maxDepthM: dive.maxDepthM,
    averageDepthM: dive.averageDepth,
    waterTemperatureC: dive.waterTemperatureC,
    surfaceTemperatureC: dive.surfaceTemperatureC ?? null,
    atmosphericPressureBar: dive.atmosphericPressureBar ?? null,
    salinity: dive.salinity ?? null,
    decompressionModel: dive.decompressionModel ?? null,
    diveMode: dive.diveMode ?? null,
    gasMixes: dive.gasMixes,
    tanks: dive.tanks ?? [],
    computerModel: dive.computerModel,
    samples: dive.samples,
    tankPressuresStartBar: dive.tankPressuresStartBar,
    tankPressuresEndBar: dive.tankPressuresEndBar,
    sourceMetadata: {
      sources: dive.sources,
      sourceDiveNumbers: dive.sourceDiveNumbers,
      sourceSiteNames: dive.sourceSiteNames,
      serialNumber: dive.serialNumber,
    },
  };
}
