"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Database,
  Download,
  FileJson,
  Image as ImageIcon,
  Languages,
  LoaderCircle,
  Palette,
  Upload,
  Waves,
} from "lucide-react";
import {
  type ChangeEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import bundledCatalog from "@/data/dive-sites.json";
import {
  listLocalSiteContributions,
  type LocalSiteContribution,
} from "@/lib/indexed-db";

type CatalogSite = {
  id: string;
  name: string;
  aliases: string[];
  coordinates: { latitude: number; longitude: number };
  place: {
    countryCode: string | null;
    country: string | null;
    region: string | null;
    locality: string | null;
  };
  source: { kind: string; reference: string | null };
  notes?: string;
  status: string;
  updatedAt: string;
};

type DiveSiteCatalog = {
  schemaVersion: number;
  sites: CatalogSite[];
};

const BUILT_IN_CATALOG = bundledCatalog as DiveSiteCatalog;

export function SettingsApp() {
  const [contributions, setContributions] = useState<LocalSiteContribution[]>([]);
  const [catalog, setCatalog] = useState<DiveSiteCatalog>(BUILT_IN_CATALOG);
  const [catalogLabel, setCatalogLabel] = useState("Catalog included with this app");
  const [status, setStatus] = useState("Loading device-local settings…");
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    listLocalSiteContributions()
      .then((items) => {
        setContributions(items);
        setStatus(
          items.length
            ? `${items.length} manually added site${items.length === 1 ? "" : "s"} ready`
            : "No manually added sites on this device",
        );
      })
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : "Could not read site additions.");
      })
      .finally(() => setBusy(false));
  }, []);

  const mergePreview = useMemo(
    () => mergeContributions(catalog, contributions),
    [catalog, contributions],
  );

  function exportAddedSiteLog() {
    const payload = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      description:
        "Dive sites typed into DiveFrame. Review before adding them to data/dive-sites.json.",
      sites: contributions.map(contributionForExport),
    };
    downloadJson(payload, "diveframe-added-sites.json");
    setStatus(`Exported ${contributions.length} added site${contributions.length === 1 ? "" : "s"}`);
  }

  function downloadMergedCatalog() {
    downloadJson(mergePreview.catalog, "dive-sites.json");
    setStatus(
      `Downloaded catalog with ${mergePreview.added} new site${mergePreview.added === 1 ? "" : "s"} (${mergePreview.skipped} duplicate${mergePreview.skipped === 1 ? "" : "s"} skipped)`,
    );
  }

  async function chooseCatalog(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const validated = validateCatalog(parsed);
      setCatalog(validated);
      setCatalogLabel(file.name);
      setStatus(`Using ${file.name} with ${validated.sites.length} sites`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not read this catalog.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="settings-page">
      <header className="topbar settings-topbar">
        <Link href="/" className="brand settings-brand" aria-label="Back to DiveFrame">
          <span className="brand-mark">
            <Waves size={19} strokeWidth={2.4} />
          </span>
          <span>
            <strong>DiveFrame</strong>
            <small>Settings</small>
          </span>
        </Link>
        <Link href="/" className="button button-quiet">
          <ArrowLeft size={16} /> Back to dives
        </Link>
      </header>

      <div className="settings-shell">
        <section className="settings-hero">
          <p className="eyebrow">Device-local preferences</p>
          <h1>Settings & data tools</h1>
          <p>
            Manage the site catalog used by this browser. Future overlay branding,
            styles, and language preferences will live here too.
          </p>
        </section>

        <section className="settings-card catalog-settings">
          <div className="settings-card-heading">
            <span className="settings-icon"><Database size={21} /></span>
            <div>
              <p className="eyebrow">Dive-site catalog</p>
              <h2>Review and publish added sites</h2>
            </div>
          </div>

          <div className="catalog-summary">
            <div>
              <strong>{catalog.sites.length}</strong>
              <span>catalog sites</span>
            </div>
            <div>
              <strong>{contributions.length}</strong>
              <span>device additions</span>
            </div>
            <div>
              <strong>{mergePreview.added}</strong>
              <span>new after merge</span>
            </div>
          </div>

          <div className="catalog-source">
            <div>
              <FileJson size={18} />
              <span>
                <strong>{catalogLabel}</strong>
                <small>
                  Use the included catalog, or choose a newer `dive-sites.json`
                  before merging.
                </small>
              </span>
            </div>
            <label className="button button-secondary">
              <Upload size={16} /> Choose catalog
              <input
                type="file"
                accept=".json,application/json"
                onChange={chooseCatalog}
                className="visually-hidden"
                disabled={busy}
              />
            </label>
          </div>

          <div className="settings-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={exportAddedSiteLog}
              disabled={busy || contributions.length === 0}
            >
              <Download size={16} /> Export addition log
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={downloadMergedCatalog}
              disabled={busy || contributions.length === 0}
            >
              <Download size={16} /> Download merged dive-sites.json
            </button>
          </div>

          <p className="settings-note">
            The merge skips an addition when the same name already exists within
            250 metres. New entries are marked active and retain a reference to the
            dive that supplied their coordinates. Review the downloaded file, then
            replace <code>data/dive-sites.json</code> in GitHub.
          </p>
        </section>

        <section className="future-settings" aria-label="Planned settings">
          <FutureSetting
            icon={<ImageIcon size={20} />}
            title="Overlay branding"
            description="Logo and attribution used on shared dive images."
          />
          <FutureSetting
            icon={<Palette size={20} />}
            title="Overlay styles"
            description="Reusable layouts, typography, and color treatments."
          />
          <FutureSetting
            icon={<Languages size={20} />}
            title="Language & region"
            description="Interface language, units, and local formatting."
          />
        </section>

        <div className="settings-status" role="status">
          {busy && <LoaderCircle size={15} className="spin" />}
          {status}
        </div>
      </div>
    </main>
  );
}

function FutureSetting({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <article className="settings-card future-card">
      <span className="settings-icon">{icon}</span>
      <small>Planned</small>
      <h2>{title}</h2>
      <p>{description}</p>
    </article>
  );
}

function contributionForExport(site: LocalSiteContribution) {
  return {
    name: site.name,
    coordinates: {
      latitude: site.latitude,
      longitude: site.longitude,
    },
    linkedDive: {
      diveId: site.diveId,
      diveDate: site.diveDate,
      shearwaterDiveNumber: site.shearwaterDiveNumber,
      subsurfaceDiveNumber: site.subsurfaceDiveNumber,
    },
    source: {
      kind: "diveframe_manual",
      reference: `diveframe-dive:${site.diveId}`,
    },
    status: "candidate",
    createdAt: site.createdAt,
    updatedAt: site.updatedAt,
  };
}

function mergeContributions(
  base: DiveSiteCatalog,
  contributions: LocalSiteContribution[],
) {
  const sites = base.sites.map((site) => structuredClone(site));
  const usedIds = new Set(sites.map((site) => site.id));
  let added = 0;
  let skipped = 0;

  for (const contribution of contributions) {
    const normalized = normalizeName(contribution.name);
    const duplicate = sites.some((site) => {
      const names = [site.name, ...(site.aliases ?? [])].map(normalizeName);
      return (
        names.includes(normalized) &&
        distanceKm(
          site.coordinates.latitude,
          site.coordinates.longitude,
          contribution.latitude,
          contribution.longitude,
        ) <= 0.25
      );
    });
    if (duplicate) {
      skipped += 1;
      continue;
    }

    const id = uniqueCatalogId(contribution, usedIds);
    usedIds.add(id);
    sites.push({
      id,
      name: contribution.name,
      aliases: [],
      coordinates: {
        latitude: contribution.latitude,
        longitude: contribution.longitude,
      },
      place: {
        countryCode: null,
        country: null,
        region: null,
        locality: null,
      },
      source: {
        kind: "diveframe_manual",
        reference: `diveframe-dive:${contribution.diveId}`,
      },
      notes: `Added from DiveFrame${contribution.diveDate ? ` for a dive on ${contribution.diveDate}` : ""}. Review place metadata before publishing.`,
      status: "active",
      updatedAt: contribution.updatedAt,
    });
    added += 1;
  }

  return {
    catalog: {
      schemaVersion: base.schemaVersion,
      sites: sites.sort((a, b) => a.id.localeCompare(b.id)),
    },
    added,
    skipped,
  };
}

function validateCatalog(value: unknown): DiveSiteCatalog {
  if (!value || typeof value !== "object") {
    throw new Error("This is not a dive-site catalog.");
  }
  const candidate = value as { schemaVersion?: unknown; sites?: unknown };
  if (
    typeof candidate.schemaVersion !== "number" ||
    !Array.isArray(candidate.sites) ||
    !candidate.sites.every(isCatalogSite)
  ) {
    throw new Error("The catalog must contain schemaVersion and a valid sites array.");
  }
  return candidate as DiveSiteCatalog;
}

function isCatalogSite(value: unknown): value is CatalogSite {
  if (!value || typeof value !== "object") return false;
  const site = value as Partial<CatalogSite>;
  return (
    typeof site.id === "string" &&
    typeof site.name === "string" &&
    Array.isArray(site.aliases) &&
    Boolean(site.coordinates) &&
    Number.isFinite(site.coordinates?.latitude) &&
    Number.isFinite(site.coordinates?.longitude)
  );
}

function uniqueCatalogId(
  contribution: LocalSiteContribution,
  usedIds: Set<string>,
) {
  const slug =
    contribution.name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "unnamed-site";
  const coordinateKey = `${Math.abs(contribution.latitude).toFixed(3).replace(".", "")}-${Math.abs(contribution.longitude).toFixed(3).replace(".", "")}`;
  const base = `user-${slug}-${coordinateKey}`;
  let id = base;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  return id;
}

function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase("en").replace(/\s+/g, " ");
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

function downloadJson(value: unknown, fileName: string) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
