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
      <HeaderClient />
      <div className="flex min-h-[calc(100vh-3.5rem)]">
        {sidebar ?? null}
        <div className={`flex min-w-0 flex-1 flex-col ${LANDING_BG_CANVAS}`}>
          {children}
          <Footer />
        </div>
      </div>
    </>
  );
}
