"use client";

import {
  createContext,
  useCallback,
  useContext,
  type ReactNode,
} from "react";

const AppRouteSuffixContext = createContext("");

export function AppRouteProvider({
  children,
  routeSuffix,
}: {
  children: ReactNode;
  routeSuffix: string;
}) {
  return (
    <AppRouteSuffixContext.Provider value={routeSuffix}>
      {children}
    </AppRouteSuffixContext.Provider>
  );
}

export function useAppRouteHref() {
  const routeSuffix = useContext(AppRouteSuffixContext);
  return useCallback(
    (href: string) => appendAppRouteSuffix(href, routeSuffix),
    [routeSuffix],
  );
}

export function appendAppRouteSuffix(href: string, routeSuffix: string) {
  if (!routeSuffix || !href.startsWith("/") || href.startsWith("//")) {
    return href;
  }

  const suffixStart = href.search(/[?#]/);
  const pathname = suffixStart === -1 ? href : href.slice(0, suffixStart);
  const queryOrHash = suffixStart === -1 ? "" : href.slice(suffixStart);

  if (
    pathname === "/" ||
    pathname.endsWith("/") ||
    pathname.endsWith(routeSuffix) ||
    /\/[^/]+\.[^/]+$/.test(pathname)
  ) {
    return href;
  }

  return `${pathname}${routeSuffix}${queryOrHash}`;
}
