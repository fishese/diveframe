"use client";

import { ChevronDown, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAppI18n } from "../AppI18nProvider";
import {
  nearbySessionCatalogSites,
  type DiveSiteCatalog,
} from "@/lib/dive-site-catalog";
import {
  nearbySiteCatalogId,
  nearbySiteSelection,
  type NearbySite,
  type SiteSelection,
} from "@/lib/dive-site-suggestions";
import { diveFrameApiUrl } from "@/lib/diveframe-api";

export function DiveSiteSuggestions({
  coordinates,
  catalog,
  selectedName,
  selectedCatalogId,
  busy = false,
  onSelect,
}: {
  coordinates: { latitude: number; longitude: number } | null;
  catalog: DiveSiteCatalog;
  selectedName?: string | null;
  selectedCatalogId?: string | null;
  busy?: boolean;
  onSelect: (selection: SiteSelection) => void | Promise<void>;
}) {
  const { t } = useAppI18n();
  const [remote, setRemote] = useState<{
    coordinateKey: string;
    sites: NearbySite[];
  } | null>(null);
  const [expandedAliasSiteId, setExpandedAliasSiteId] = useState<string | null>(
    null,
  );
  const latitude = coordinates?.latitude ?? null;
  const longitude = coordinates?.longitude ?? null;
  const coordinateKey = latitude !== null && longitude !== null
    ? `${latitude},${longitude}`
    : null;
  const localSites = useMemo(
    () =>
      latitude !== null && longitude !== null
        ? nearbySessionCatalogSites(
            catalog,
            latitude,
            longitude,
          )
        : [],
    [catalog, latitude, longitude],
  );
  const sites = localSites.length
    ? localSites
    : remote?.coordinateKey === coordinateKey
      ? remote.sites
      : [];
  const loading = Boolean(
    coordinateKey &&
      localSites.length === 0 &&
      remote?.coordinateKey !== coordinateKey,
  );

  useEffect(() => {
    if (
      latitude === null ||
      longitude === null ||
      !coordinateKey ||
      localSites.length
    ) return;
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    fetch(
      diveFrameApiUrl(
        `/api/nearby-sites?lat=${encodeURIComponent(String(latitude))}&lng=${encodeURIComponent(String(longitude))}`,
      ),
      { signal: controller.signal },
    )
      .then(async (response) => {
        const payload = (await response.json()) as {
          sites?: NearbySite[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "Nearby sites unavailable.");
        }
        return payload.sites ?? [];
      })
      .then((next) => {
        if (active) setRemote({ coordinateKey, sites: next });
      })
      .catch(() => {
        if (active) setRemote({ coordinateKey, sites: [] });
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [coordinateKey, latitude, localSites.length, longitude]);

  if (!coordinates) return <p className="site-empty">{t("noNearbySites")}</p>;
  if (loading) {
    return (
      <div className="site-loading">
        <LoaderCircle size={18} className="spin" /> {t("lookingForSites")}
      </div>
    );
  }
  if (!sites.length) return <p className="site-empty">{t("noNearbySites")}</p>;

  return (
    <div className="site-suggestions">
      {sites.map((site) => {
        const catalogId = nearbySiteCatalogId(site);
        const aliasesExpanded = expandedAliasSiteId === site.id;
        return (
          <div className="site-suggestion-item" key={site.id}>
            <div className="site-suggestion-main">
              <button
                type="button"
                className="site-suggestion-name"
                onClick={() => void onSelect(nearbySiteSelection(site, site.name))}
                disabled={busy}
                aria-pressed={selectedCatalogId === catalogId}
              >
                <span>{site.name}</span>
                {site.aliases?.length ? <em>{site.aliases.join(" / ")}</em> : null}
                <small>
                  {formatDistance(site.distanceKm)}
                  {" · "}
                  {site.source === "catalog" ? t("catalogSource") : t("mapFallback")}
                </small>
              </button>
              {site.aliases?.length ? (
                <button
                  type="button"
                  className="site-alias-expand"
                  onClick={() =>
                    setExpandedAliasSiteId((current) =>
                      current === site.id ? null : site.id,
                    )
                  }
                  disabled={busy}
                  aria-expanded={aliasesExpanded}
                  aria-label={
                    aliasesExpanded ? t("hideSiteAliases") : t("showSiteAliases")
                  }
                >
                  <ChevronDown size={16} />
                </button>
              ) : null}
            </div>
            {aliasesExpanded && site.aliases?.length ? (
              <div className="site-alias-chips">
                {site.aliases.map((alias) => (
                  <button
                    type="button"
                    key={alias}
                    className="site-alias-chip"
                    onClick={() => void onSelect(nearbySiteSelection(site, alias))}
                    disabled={busy}
                    aria-pressed={
                      selectedCatalogId === catalogId && selectedName === alias
                    }
                    title={t("chooseSiteAlias", { name: alias })}
                  >
                    {alias}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function formatDistance(distanceKm: number) {
  return distanceKm < 1
    ? `${Math.round(distanceKm * 1000)} m`
    : `${distanceKm.toFixed(1)} km`;
}
