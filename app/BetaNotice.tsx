"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useAppI18n } from "./AppI18nProvider";

export function BetaNotice() {
  const { t } = useAppI18n();

  return (
    <aside className="beta-notice" aria-label={t("betaNoticeLabel")}>
      <AlertTriangle size={16} aria-hidden="true" />
      <p>
        <strong>{t("betaNoticeLabel")}</strong>
        <span>{t("betaNoticeText")}</span>
        <Link href="/settings">{t("betaNoticeBackup")}</Link>
      </p>
    </aside>
  );
}
