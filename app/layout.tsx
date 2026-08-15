import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppI18nProvider } from "./AppI18nProvider";
import { BetaNotice } from "./BetaNotice";
import { PwaManager } from "./PwaInstall";
import { ThemeProvider } from "./ThemeProvider";
import { AppRouteProvider } from "./AppRouteProvider";

const THEME_BOOTSTRAP = `(function(){try{var r=document.documentElement,t=localStorage.getItem("diveframe-color-theme");if(t!=="light"&&t!=="dark")t="dark";r.setAttribute("data-theme",t);r.style.colorScheme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",t==="light"?"#eef6f4":"#071820");["top","right","bottom","left"].forEach(function(k){var v=localStorage.getItem("diveframe-native-safe-area-"+k);if(v)r.style.setProperty("--safe-area-inset-"+k,v);});}catch(e){}})();`;

const CANONICAL_ORIGIN = "https://divelog.fishese.cc";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DiveFrame — Dive log companion",
  description:
    "A private visual companion for merged dive logs, maps, photos, and share images.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/diveframe-icon.svg", type: "image/svg+xml" },
      { url: "/icons/diveframe-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/diveframe-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      {
        url: "/icons/diveframe-apple-touch.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "DiveFrame",
  },
  openGraph: {
    title: "DiveFrame",
    description: "Your logs, enhanced.",
    images: [{ url: `${CANONICAL_ORIGIN}/og.png`, width: 1732, height: 909 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "DiveFrame",
    description: "Your logs, enhanced.",
    images: [`${CANONICAL_ORIGIN}/og.png`],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const routeSuffix =
    process.env.DIVEFRAME_NATIVE_STATIC === "1" ? ".html" : "";

  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#071820" />
        <meta name="mobile-web-app-capable" content="yes" />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AppRouteProvider routeSuffix={routeSuffix}>
          <AppI18nProvider>
            <ThemeProvider>
              <PwaManager />
              <div className="app-safe-top" aria-hidden="true" />
              <BetaNotice />
              {children}
            </ThemeProvider>
          </AppI18nProvider>
        </AppRouteProvider>
      </body>
    </html>
  );
}
