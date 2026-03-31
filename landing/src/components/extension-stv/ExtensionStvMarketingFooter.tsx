import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { STV_CHROME_STORE_URL, STV_FOCUS_RING } from "./stv-marketing-shared";

export async function ExtensionStvMarketingFooter() {
  const t = await getTranslations("Marketing.marketingFooter");
  const tc = await getTranslations("Common");

  return (
    <footer className="bg-[#09090b] py-8">
      <div className="mx-auto max-w-6xl px-4 text-center sm:px-6">
        <p className="text-sm font-semibold text-zinc-50">{t("title")}</p>
        <p className="mx-auto mt-2 max-w-md text-xs text-zinc-500">{t("subtitle")}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-4 text-xs text-zinc-500">
          <Link href="/" className={`hover:text-zinc-300 ${STV_FOCUS_RING} rounded-sm`}>
            {t("home")}
          </Link>
          <Link href="/extension-stv/pricing" className={`hover:text-zinc-300 ${STV_FOCUS_RING} rounded-sm`}>
            {t("pricing")}
          </Link>
          <a href={STV_CHROME_STORE_URL} className={`hover:text-zinc-300 ${STV_FOCUS_RING} rounded-sm`}>
            {tc("chromeWebStore")}
          </a>
          <Link href="/privacy" className={`hover:text-zinc-300 ${STV_FOCUS_RING} rounded-sm`}>
            {t("privacy")}
          </Link>
        </div>
      </div>
    </footer>
  );
}
