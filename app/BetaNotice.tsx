"use client";

import Link from "next/link";
import { AlertTriangle, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { getLocalAppPreferences, saveLocalAppPreferences } from "@/lib/indexed-db";
import { fetchWhatsNewDocument, type WhatsNewDocument } from "@/lib/whats-new";
import { useAppI18n } from "./AppI18nProvider";

export function BetaNotice() {
  const { t } = useAppI18n();
  const [whatsNew, setWhatsNew] = useState<WhatsNewDocument | null>(null);
  const [lastSeenVersion, setLastSeenVersion] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void getLocalAppPreferences()
      .then((preferences) => {
        if (!active) return;
        setWhatsNew(preferences?.whatsNewCache ?? null);
        setLastSeenVersion(preferences?.lastSeenWhatsNewVersion ?? null);
      })
      .catch(() => undefined);

    if (navigator.onLine) {
      void fetchWhatsNewDocument()
        .then(async (document) => {
          if (!active) return;
          setWhatsNew(document);
          await saveLocalAppPreferences({
            whatsNewCache: document,
            whatsNewFetchedAt: new Date().toISOString(),
          });
        })
        .catch(() => undefined);
    }

    function handleSeen(event: Event) {
      const version = (event as CustomEvent<{ version?: string }>).detail?.version;
      if (version) setLastSeenVersion(version);
    }

    window.addEventListener("diveframe-whats-new-seen", handleSeen);
    return () => {
      active = false;
      window.removeEventListener("diveframe-whats-new-seen", handleSeen);
    };
  }, []);

  const unread = whatsNew !== null && whatsNew.version !== lastSeenVersion;
  const latestEntry = whatsNew?.entries[0] ?? null;

  return (
    <aside
      className={`beta-notice ${unread ? "whats-new-notice" : ""}`}
      aria-label={unread ? t("whatsNew") : t("betaNoticeLabel")}
    >
      {unread ? (
        <Sparkles size={16} aria-hidden="true" />
      ) : (
        <AlertTriangle size={16} aria-hidden="true" />
      )}
      <p>
        <strong>{unread ? t("whatsNew") : t("betaNoticeLabel")}</strong>
        {unread ? (
          <>
            <span>{latestEntry?.title ?? `v${whatsNew.version}`}</span>
            <Link href="/settings">v{whatsNew.version}</Link>
          </>
        ) : (
          <span>{t("betaNoticeShort")}</span>
        )}
      </p>
    </aside>
  );
}
