"use client";

import { useEffect, useRef, type ReactNode } from "react";

type Props = Readonly<{
  /** Stagger segments (applied before the activate rAF burst). */
  delayMs?: number;
  children: ReactNode;
}>;

/**
 * Triggers keyframe reveal only after mount so /welcome visibly animates in the browser,
 * works on client navigations, and skips activation when prefers-reduced-motion is on.
 */
export function WelcomeReveal({ delayMs = 0, children }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let canceled = false;
    let raf1 = 0;
    let raf2 = 0;

    const activate = () => {
      if (canceled || !el.isConnected) return;
      el.dataset.animate = "true";
    };

    const arm = () => {
      if (canceled || !el.isConnected) return;
      raf1 = window.requestAnimationFrame(() => {
        raf2 = window.requestAnimationFrame(activate);
      });
    };

    const timeoutId = window.setTimeout(() => arm(), delayMs);

    return () => {
      canceled = true;
      window.clearTimeout(timeoutId);
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
    };
  }, [delayMs]);

  return (
    <div ref={rootRef} className="welcome-motion">
      {children}
    </div>
  );
}
