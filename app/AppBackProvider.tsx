"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { appBackHrefForLocation, appBackParent } from "@/lib/app-back";
import { useAppRouteHref } from "./AppRouteProvider";

type BackHandler = () => boolean;

const AppBackRegisterContext = createContext<
  (handler: BackHandler) => () => void
>(() => () => undefined);

export function AppBackProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const handlersRef = useRef<BackHandler[]>([]);
  const [handlerCount, setHandlerCount] = useState(0);

  const runStack = useCallback((): boolean => {
    const list = handlersRef.current;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      try {
        if (list[i]()) return true;
      } catch {
        /* fall through to URL parent */
      }
    }
    const parent = appBackParent(
      window.location.pathname,
      window.location.search,
    );
    if (parent === null) return false;
    window.location.replace(
      appBackHrefForLocation(parent, window.location.pathname),
    );
    return true;
  }, []);

  const register = useCallback((handler: BackHandler) => {
    handlersRef.current = [...handlersRef.current, handler];
    setHandlerCount(handlersRef.current.length);
    return () => {
      handlersRef.current = handlersRef.current.filter(
        (item) => item !== handler,
      );
      setHandlerCount(handlersRef.current.length);
    };
  }, []);

  useEffect(() => {
    const back = window.__diveFrameBack ?? { handle: runStack };
    const previous = back.handle;
    back.handle = runStack;
    window.__diveFrameBack = back;
    window.__diveFrameHandleBack = () => {
      try {
        return Boolean(window.__diveFrameBack?.handle?.());
      } catch {
        return false;
      }
    };
    return () => {
      if (window.__diveFrameBack) window.__diveFrameBack.handle = previous;
    };
  }, [runStack]);

  useEffect(() => {
    const parent = appBackParent(
      window.location.pathname,
      window.location.search,
    );
    if (parent === null && handlerCount === 0) return;
    const state = window.history.state as { __diveframeBack?: number } | null;
    if (state?.__diveframeBack) return;
    window.history.pushState(
      { ...(typeof state === "object" && state ? state : {}), __diveframeBack: 1 },
      "",
      window.location.href,
    );
  }, [pathname, handlerCount]);

  return (
    <AppBackRegisterContext.Provider value={register}>
      {children}
    </AppBackRegisterContext.Provider>
  );
}

export function useAppBackHandler(handler: BackHandler, active = true) {
  const register = useContext(AppBackRegisterContext);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!active) return;
    return register(() => handlerRef.current());
  }, [active, register]);
}

export function useAppBackParent(href: string) {
  const router = useRouter();
  const appRouteHref = useAppRouteHref();
  const target = appRouteHref(href);
  useAppBackHandler(() => {
    router.replace(target);
    return true;
  }, true);
}
