"use client";

import { usePathname } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";
import {
  getLocalAppPreferences,
  saveLocalAppPreferences,
} from "@/lib/indexed-db";
import { fetchWhatsNewDocument } from "@/lib/whats-new";
import { getNativeAppInfo } from "@/lib/update-channel";
import { useAppI18n } from "./AppI18nProvider";

let automaticCheckStartedThisSession = false;

export function BetaNotice() {
  const { t } = useAppI18n();
  const pathname = usePathname();
  const showNotice = pathname === "/" || pathname === "/settings" || pathname.startsWith("/settings/");

  useEffect(() => {
    if (!showNotice || automaticCheckStartedThisSession || !getNativeAppInfo()) {
      return;
    }

    let active = true;
    void (async () => {
      try {
        const preferences = await getLocalAppPreferences();
        if (
          !active ||
          !preferences?.automaticUpdateChecks ||
          !navigator.onLine
        ) {
          return;
        }
        automaticCheckStartedThisSession = true;
        const document = await fetchWhatsNewDocument();
        if (!active) return;
        await saveLocalAppPreferences({
          whatsNewCache: document,
          whatsNewFetchedAt: new Date().toISOString(),
        });
      } catch {
        // Automatic checks are best-effort; Settings keeps the saved copy and
        // exposes a manual retry without changing the user's opt-in.
      }
    })();

    return () => {
      active = false;
    };
  }, [showNotice]);

  if (!showNotice) return null;

  return (
    <aside className="beta-notice" aria-label={t("betaNoticeLabel")}>
      <AlertTriangle size={16} aria-hidden="true" />
      <p>
        <strong>{t("betaNoticeLabel")}</strong>
        <span>{t("betaNoticeShort")}</span>
      </p>
    </aside>
  );
}
