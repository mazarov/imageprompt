import { getTranslations } from "next-intl/server";
import { ExtensionStvFloatingCtaChrome } from "./ExtensionStvFloatingCtaChrome";

export async function ExtensionStvFloatingCta() {
  const t = await getTranslations("Marketing");
  return <ExtensionStvFloatingCtaChrome label={t("floatingCta")} />;
}
