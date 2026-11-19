"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface InstallPrompt extends Event {
  prompt(): Promise<unknown>;
}

export function PwaControls() {
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [dismissed, setDismissed] = useState<ServiceWorker | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const chosenWorker = useRef<ServiceWorker | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const workers = navigator.serviceWorker;
    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    let installing: ServiceWorker | null = null;

    const syncWaiting = () => {
      if (!disposed) setWaiting(workers.controller ? registration?.waiting ?? null : null);
    };
    const watchInstall = () => {
      installing?.removeEventListener("statechange", syncWaiting);
      installing = registration?.installing ?? null;
      installing?.addEventListener("statechange", syncWaiting);
      syncWaiting();
    };
    const controlled = () => {
      if (chosenWorker.current && workers.controller === chosenWorker.current) window.location.reload();
      syncWaiting();
    };
    const check = () => {
      if (document.visibilityState === "visible") void registration?.update().catch(() => undefined);
    };
    const offerInstall = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallPrompt);
    };
    const installed = () => setInstall(null);

    workers.addEventListener("controllerchange", controlled);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("online", check);
    window.addEventListener("beforeinstallprompt", offerInstall);
    window.addEventListener("appinstalled", installed);
    void workers.register("/sw.js", { updateViaCache: "none" }).then((result) => {
      if (disposed) return;
      registration = result;
      registration.addEventListener("updatefound", watchInstall);
      watchInstall();
      check();
    }).catch(() => undefined);

    return () => {
      disposed = true;
      registration?.removeEventListener("updatefound", watchInstall);
      installing?.removeEventListener("statechange", syncWaiting);
      workers.removeEventListener("controllerchange", controlled);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("online", check);
      window.removeEventListener("beforeinstallprompt", offerInstall);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  useEffect(() => {
    if (!refreshing) return;
    const timer = window.setTimeout(() => {
      chosenWorker.current = null;
      setRefreshing(false);
    }, 10_000);
    return () => window.clearTimeout(timer);
  }, [refreshing]);

  return (
    <>
      {install && (
        <Button variant="outline" size="sm" onClick={() => {
          setInstall(null);
          void install.prompt().catch(() => undefined);
        }}>安装应用</Button>
      )}
      {waiting && waiting !== dismissed && (
        <aside className="fixed inset-x-3 bottom-4 z-50 mx-auto w-auto max-w-sm rounded-xl border border-line bg-cream p-4 text-ink shadow-lg sm:left-auto sm:right-5 sm:mx-0" aria-label="站点更新">
          <p className="text-sm font-semibold" role="status">站点已更新</p>
          <p className="mt-1 text-xs text-graphite">请先保存正在编辑的内容，再刷新页面。</p>
          <div className="mt-3 flex justify-end gap-2">
            <Button size="sm" variant="outline" disabled={refreshing} onClick={() => setDismissed(waiting)}>稍后</Button>
            <Button size="sm" disabled={refreshing} onClick={() => {
              chosenWorker.current = waiting;
              setRefreshing(true);
              waiting.postMessage("ACTIVATE_XUNGEN_UPDATE");
            }}>{refreshing ? "正在刷新…" : "刷新页面"}</Button>
          </div>
        </aside>
      )}
    </>
  );
}
