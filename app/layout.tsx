import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { AppI18nProvider } from "./AppI18nProvider";
import { BetaNotice } from "./BetaNotice";
import { PwaManager } from "./PwaInstall";

const CANONICAL_ORIGIN = "https://divelog.fishese.cc";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host?.startsWith("localhost") ? "http" : "https");
  const origin = host ? `${protocol}://${host}` : CANONICAL_ORIGIN;

  return {
    title: "DiveFrame — Dive log companion",
    description:
      "A private visual companion for merged dive logs, maps, photos, and share images.",
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [
        { url: "/icons/diveframe-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icons/diveframe-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [
        { url: "/icons/diveframe-apple-touch.png", sizes: "180x180", type: "image/png" },
      ],
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "DiveFrame",
    },
    openGraph: {
      title: "DiveFrame",
      description: "Your dives, enhanced.",
      images: [{ url: `${origin}/og.png`, width: 1732, height: 909 }],
    },
    twitter: {
      card: "summary_large_image",
      title: "DiveFrame",
      description: "Your dives, enhanced.",
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#071820" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AppI18nProvider>
          <PwaManager />
          <BetaNotice />
          {children}
        </AppI18nProvider>
      </body>
    </html>
  );
}
