import type { ReactNode } from "react";
import { LANDING_BG_CANVAS } from "@/lib/landing-design-tokens";
import { HeaderClient } from "./HeaderClient";
import { Footer } from "./Footer";

type PageLayoutProps = {
  children: ReactNode;
  /** Optional left column (e.g. anchor nav on home). */
  sidebar?: ReactNode;
};

export async function PageLayout({ children, sidebar }: PageLayoutProps) {
  return (
    <>
      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 z-[100] rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white focus:not-sr-only focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
      >
        Skip to content
      </a>
      <HeaderClient />
      <div className="flex min-h-[calc(100vh-3.5rem)]">
        {sidebar ?? null}
        <div className={`flex min-w-0 flex-1 flex-col ${LANDING_BG_CANVAS}`}>
          <main id="main-content" tabIndex={-1}>
            {children}
          </main>
          <Footer />
        </div>
      </div>
    </>
  );
}
