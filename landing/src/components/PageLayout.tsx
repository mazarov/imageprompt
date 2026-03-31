import type { ReactNode } from "react";
import { getLocale } from "next-intl/server";
import { applyCountsToMenu } from "@/lib/menu";
import { HeaderClient } from "./HeaderClient";
import { SidebarNav } from "./SidebarNav";
import { Footer } from "./Footer";

type PageLayoutProps = {
  children: ReactNode;
  /** Замена левого меню (например якоря на главной). По умолчанию — каталог. */
  sidebar?: ReactNode;
};

export async function PageLayout({ children, sidebar }: PageLayoutProps) {
  const locale = await getLocale();
  const loc = locale === "ru" ? "ru" : "en";
  const menuStructure = applyCountsToMenu({}, loc);

  return (
    <>
      <HeaderClient />
      <div className="flex min-h-[calc(100vh-3.5rem)]">
        {sidebar ?? <SidebarNav menu={menuStructure} />}
        <div className="flex min-w-0 flex-1 flex-col bg-[#09090b]">
          {children}
          <Footer />
        </div>
      </div>
    </>
  );
}
