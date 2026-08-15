"use client";

import { ChevronDown, Download, LoaderCircle, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import bundledDiveSiteCatalog from "@/data/dive-sites.json";
import { AppTopbar } from "../components/AppTopbar";
import { useAppI18n } from "../AppI18nProvider";
import {
  catalogSitePlace,
  groupDiveSiteCatalog,
} from "@/lib/dive-site-catalog-browser";
import {
  deviceSiteCatalogFromContributions,
  type DiveSiteCatalog,
} from "@/lib/dive-site-catalog";
import {
  getLocalSupplementaryCatalog,
  listLocalSiteContributions,
} from "@/lib/indexed-db";
import { subscribeLocalDataChanges } from "@/lib/cross-tab-sync";
import { saveExportFile, savedFileNotice } from "@/lib/file-export";
import type { AppTranslate } from "@/lib/app-i18n";

const BUNDLED_CATALOG = bundledDiveSiteCatalog as DiveSiteCatalog;
const EMPTY_CATALOG: DiveSiteCatalog = {
  schemaVersion: BUNDLED_CATALOG.schemaVersion,
  sites: [],
};

export type CatalogViewSource = "built-in" | "device" | "supplement";

export function CatalogApp({ source = "built-in" }: { source?: CatalogViewSource }) {
  const { t } = useAppI18n();
  const [catalog, setCatalog] = useState<DiveSiteCatalog>(
    source === "built-in" ? BUNDLED_CATALOG : EMPTY_CATALOG,
  );
  const [catalogLabel, setCatalogLabel] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(source !== "built-in");
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
  const [groupOpenState, setGroupOpenState] = useState<Record<string, boolean>>(
    {},
  );

  useEffect(() => {
    if (source === "built-in") return;

    let active = true;
    let refreshVersion = 0;
    const refresh = async () => {
      const version = ++refreshVersion;
      setLoading(true);
      try {
        if (source === "device") {
          const contributions = await listLocalSiteContributions();
          if (!active || version !== refreshVersion) return;
          setCatalog(
            deviceSiteCatalogFromContributions(
              contributions,
              BUNDLED_CATALOG.schemaVersion,
            ),
          );
          setCatalogLabel(null);
        } else {
          const saved = await getLocalSupplementaryCatalog();
          if (!active || version !== refreshVersion) return;
          setCatalog(saved?.catalog ?? EMPTY_CATALOG);
          setCatalogLabel(saved?.label ?? null);
        }
      } catch {
        if (active && version === refreshVersion) {
          setCatalog(EMPTY_CATALOG);
          setCatalogLabel(null);
        }
      } finally {
        if (active && version === refreshVersion) setLoading(false);
      }
    };
    void refresh();
    const unsubscribe = subscribeLocalDataChanges(() => void refresh());
    return () => {
      active = false;
      unsubscribe();
    };
  }, [source]);

  const unknownGroup =
    source === "device" ? t("deviceAdditions") : t("catalogUnknownRegion");
  const groups = useMemo(
    () => groupDiveSiteCatalog(catalog, query, unknownGroup),
    [catalog, query, unknownGroup],
  );
  const resultCount = groups.reduce(
    (count, group) => count + group.sites.length,
    0,
  );
  const hasQuery = query.trim().length > 0;
  const copy = catalogViewCopy(source, t);

  async function downloadCatalog() {
    setDownloadBusy(true);
    setDownloadStatus(null);
    try {
      const exportCatalog =
        source === "device"
          ? deviceSiteCatalogFromContributions(
              await listLocalSiteContributions(),
              BUNDLED_CATALOG.schemaVersion,
            )
          : (await getLocalSupplementaryCatalog())?.catalog ?? EMPTY_CATALOG;
      const saved = await saveExportFile(
        new Blob([`${JSON.stringify(exportCatalog, null, 2)}\n`], {
          type: "application/json;charset=utf-8",
        }),
        source === "device"
          ? "diveframe-device-additions.json"
          : "diveframe-supplementary-sites.json",
        "application/json",
      );
      const notice = savedFileNotice(saved, t);
      setDownloadStatus(
        notice ? `${t("catalogDownloadSaved")} ${notice}` : t("catalogDownloadSaved"),
      );
    } catch (error) {
      setDownloadStatus(
        error instanceof Error && error.message
          ? `${t("catalogDownloadFailed")} ${error.message}`
          : t("catalogDownloadFailed"),
      );
    } finally {
      setDownloadBusy(false);
    }
  }

  return (
    <main className="app-shell catalog-page">
      <AppTopbar
        subtitle={copy.subtitle}
        brand={{ mode: "link", href: "/" }}
        showHome
      />
      <div className="catalog-shell">
        <header className="catalog-hero">
          <div>
            <p className="eyebrow">{copy.eyebrow}</p>
            <h1>{copy.title}</h1>
            <p>{copy.description}</p>
            {catalogLabel ? (
              <small className="catalog-file-label">
                {t("supplementCatalogFile", { name: catalogLabel })}
              </small>
            ) : null}
          </div>
          <div className="catalog-hero-actions">
            <div className="catalog-browser-count">
              <strong>{catalog.sites.length}</strong>
              <span>{copy.countLabel}</span>
            </div>
            {source !== "built-in" ? (
              <button
                type="button"
                className="button button-primary"
                onClick={() => void downloadCatalog()}
                disabled={downloadBusy || loading}
              >
                {downloadBusy ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <Download size={16} />
                )}
                {t("downloadCatalogJson")}
              </button>
            ) : null}
          </div>
        </header>

        {downloadStatus ? (
          <p className="catalog-download-status" role="status">
            {downloadStatus}
          </p>
        ) : null}

        <section className="catalog-browser" aria-label={copy.eyebrow}>
          <div className="catalog-search-row">
            <label className="catalog-search">
              <span className="visually-hidden">{t("catalogSearchLabel")}</span>
              <Search size={18} aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("catalogSearchPlaceholder")}
                aria-label={t("catalogSearchLabel")}
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label={t("clearSearch")}
                  title={t("clearSearch")}
                >
                  <X size={16} />
                </button>
              ) : null}
            </label>
            <p aria-live="polite">
              {loading
                ? t("catalogLoading")
                : hasQuery
                  ? t("catalogSearchResults", { count: resultCount })
                  : t("catalogBrowserSummary", {
                      sites: catalog.sites.length,
                      regions: groups.length,
                    })}
            </p>
          </div>

          <div className="catalog-table">
            <div className="catalog-table-head" aria-hidden="true">
              <span>{t("catalogPlaceColumn")}</span>
              <span>{t("catalogNameColumn")}</span>
              <span>{t("catalogAliasesColumn")}</span>
              <span>{t("catalogCoordinatesColumn")}</span>
            </div>
            {loading ? (
              <div className="catalog-no-results">
                <LoaderCircle size={22} className="spin" />
                <p>{t("catalogLoading")}</p>
              </div>
            ) : groups.length ? (
              groups.map((group) => (
                <details
                  className="catalog-country"
                  key={group.country}
                  open={
                    hasQuery ||
                    (groupOpenState[group.country] ?? source !== "built-in") ||
                    undefined
                  }
                  onToggle={(event) => {
                    if (hasQuery) return;
                    const open = event.currentTarget.open;
                    setGroupOpenState((current) =>
                      current[group.country] === open
                        ? current
                        : { ...current, [group.country]: open },
                    );
                  }}
                >
                  <summary>
                    <ChevronDown size={18} aria-hidden="true" />
                    <strong>{group.country}</strong>
                    <span>{group.sites.length}</span>
                  </summary>
                  <div className="catalog-country-sites">
                    {group.sites.map((site) => (
                      <article className="catalog-site-row" key={site.id}>
                        <div data-label={t("catalogPlaceColumn")}>
                          {catalogSitePlace(site) || copy.unknownPlace}
                        </div>
                        <div data-label={t("catalogNameColumn")}>
                          <strong>{site.name}</strong>
                          <code>{site.id}</code>
                          <small>
                            {site.source.kind}
                            {site.source.reference
                              ? ` · ${site.source.reference}`
                              : ""}
                          </small>
                        </div>
                        <div data-label={t("catalogAliasesColumn")}>
                          {site.aliases.length
                            ? site.aliases.join(", ")
                            : t("catalogNoAliases")}
                        </div>
                        <div data-label={t("catalogCoordinatesColumn")}>
                          <code>
                            {site.coordinates.latitude.toFixed(5)}, {site.coordinates.longitude.toFixed(5)}
                          </code>
                        </div>
                      </article>
                    ))}
                  </div>
                </details>
              ))
            ) : (
              <div className="catalog-no-results">
                <Search size={22} />
                <p>{hasQuery ? t("catalogNoResults") : copy.empty}</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function catalogViewCopy(source: CatalogViewSource, t: AppTranslate) {
  if (source === "device") {
    return {
      subtitle: t("deviceCatalogSubtitle"),
      eyebrow: t("deviceAdditions"),
      title: t("deviceCatalogTitle"),
      description: t("deviceCatalogDescription"),
      countLabel: t("deviceAdditions"),
      unknownPlace: t("deviceCatalogUnknownPlace"),
      empty: t("deviceCatalogEmpty"),
    };
  }
  if (source === "supplement") {
    return {
      subtitle: t("supplementCatalogSubtitle"),
      eyebrow: t("fromSupplement"),
      title: t("supplementCatalogTitle"),
      description: t("supplementCatalogDescription"),
      countLabel: t("fromSupplement"),
      unknownPlace: t("catalogUnknownRegion"),
      empty: t("supplementCatalogEmpty"),
    };
  }
  return {
    subtitle: t("catalogBrowserSubtitle"),
    eyebrow: t("catalogBrowserEyebrow"),
    title: t("catalogBrowserTitle"),
    description: t("catalogBrowserDescription"),
    countLabel: t("catalogSites"),
    unknownPlace: t("catalogUnknownRegion"),
    empty: t("catalogNoResults"),
  };
}
