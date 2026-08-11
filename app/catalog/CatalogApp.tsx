"use client";

import { ChevronDown, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import bundledDiveSiteCatalog from "@/data/dive-sites.json";
import { AppTopbar } from "../components/AppTopbar";
import { useAppI18n } from "../AppI18nProvider";
import {
  catalogSitePlace,
  groupDiveSiteCatalog,
} from "@/lib/dive-site-catalog-browser";
import {
  resolveActiveDiveSiteCatalog,
  type DiveSiteCatalog,
} from "@/lib/dive-site-catalog";
import { getLocalSupplementaryCatalog } from "@/lib/indexed-db";
import { subscribeLocalDataChanges } from "@/lib/cross-tab-sync";

const BUNDLED_CATALOG = bundledDiveSiteCatalog as DiveSiteCatalog;

export function CatalogApp() {
  const { t } = useAppI18n();
  const [catalog, setCatalog] = useState<DiveSiteCatalog>(BUNDLED_CATALOG);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    let refreshVersion = 0;
    const refresh = async () => {
      const version = ++refreshVersion;
      try {
        const saved = await getLocalSupplementaryCatalog();
        if (!active || version !== refreshVersion) return;
        setCatalog(
          resolveActiveDiveSiteCatalog(
            BUNDLED_CATALOG,
            saved?.catalog ?? null,
          ),
        );
      } catch {
        if (active && version === refreshVersion) {
          setCatalog(BUNDLED_CATALOG);
        }
      }
    };
    void refresh();
    const unsubscribe = subscribeLocalDataChanges(() => void refresh());
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const groups = useMemo(
    () => groupDiveSiteCatalog(catalog, query, t("catalogUnknownRegion")),
    [catalog, query, t],
  );
  const resultCount = groups.reduce(
    (count, group) => count + group.sites.length,
    0,
  );
  const hasQuery = query.trim().length > 0;

  return (
    <main className="app-shell catalog-page">
      <AppTopbar
        subtitle={t("catalogBrowserSubtitle")}
        brand={{ mode: "link", href: "/" }}
        showHome
      />
      <div className="catalog-shell">
        <header className="catalog-hero">
          <div>
            <p className="eyebrow">{t("catalogBrowserEyebrow")}</p>
            <h1>{t("catalogBrowserTitle")}</h1>
            <p>{t("catalogBrowserDescription")}</p>
          </div>
          <div className="catalog-browser-count">
            <strong>{catalog.sites.length}</strong>
            <span>{t("catalogSites")}</span>
          </div>
        </header>

        <section className="catalog-browser" aria-label={t("diveSiteCatalog")}>
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
              {hasQuery
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
            </div>
            {groups.length ? (
              groups.map((group) => (
                <details
                  className="catalog-country"
                  key={group.country}
                  open={hasQuery || undefined}
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
                          {catalogSitePlace(site) || t("catalogUnknownRegion")}
                        </div>
                        <div data-label={t("catalogNameColumn")}>
                          <strong>{site.name}</strong>
                        </div>
                        <div data-label={t("catalogAliasesColumn")}>
                          {site.aliases.length
                            ? site.aliases.join(", ")
                            : t("catalogNoAliases")}
                        </div>
                      </article>
                    ))}
                  </div>
                </details>
              ))
            ) : (
              <div className="catalog-no-results">
                <Search size={22} />
                <p>{t("catalogNoResults")}</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
