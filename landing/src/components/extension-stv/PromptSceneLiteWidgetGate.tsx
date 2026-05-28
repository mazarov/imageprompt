"use client";

import dynamic from "next/dynamic";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  LANDING_BORDER_CARD,
  LANDING_RING_INSET_SOFT,
  LANDING_SURFACE_WIDGET_OUTER,
  LANDING_SURFACE_WIDGET_TAB_ROW,
} from "@/lib/landing-design-tokens";

/** Static placeholder while the widget chunk loads or section is off-screen. */
export function PromptSceneLiteSkeleton() {
  return (
    <div
      className={`mx-auto w-full max-w-3xl rounded-2xl ${LANDING_BORDER_CARD} ${LANDING_SURFACE_WIDGET_OUTER} p-4 shadow-xl shadow-black/30 backdrop-blur-sm sm:p-5`}
      aria-hidden
    >
      <div className="space-y-4">
        <div className="h-3 w-24 rounded bg-zinc-800/90" />
        <div
          className={`h-10 w-full max-w-xs rounded-lg ${LANDING_SURFACE_WIDGET_TAB_ROW} p-1 ${LANDING_RING_INSET_SOFT}`}
          aria-hidden
        >
          <div className="flex h-full gap-0.5">
            <div className="flex-1 rounded-md bg-indigo-600/70" />
            <div className="flex-1 rounded-md bg-zinc-800/50" />
          </div>
        </div>
        <div className="h-36 w-full rounded-xl bg-zinc-800/70" />
        <div className="h-11 w-full rounded-lg bg-zinc-800/80 sm:max-w-[12rem]" />
      </div>
    </div>
  );
}

const PromptSceneLiteWidget = dynamic(
  () => import("./PromptSceneLiteWidget").then((m) => ({ default: m.PromptSceneLiteWidget })),
  { ssr: false, loading: () => <PromptSceneLiteSkeleton /> },
);

function shouldActivateFromHash(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hash === "#stv-problem";
}

/**
 * Defers mounting the heavy client widget until the section is near the viewport
 * (or immediately when the URL hash targets #stv-problem), so initial JS stays smaller.
 */
export function PromptSceneLiteWidgetGate() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [mountWidget, setMountWidget] = useState(false);

  useLayoutEffect(() => {
    if (shouldActivateFromHash()) setMountWidget(true);
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      if (shouldActivateFromHash()) setMountWidget(true);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (mountWidget) return;
    const el = hostRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setMountWidget(true);
      },
      { root: null, rootMargin: "240px 0px 240px 0px", threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [mountWidget]);

  return (
    <div ref={hostRef} className="mx-auto w-full max-w-3xl">
      {mountWidget ? <PromptSceneLiteWidget /> : <PromptSceneLiteSkeleton />}
    </div>
  );
}
