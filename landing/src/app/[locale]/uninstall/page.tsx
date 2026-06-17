import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageLayout } from "@/components/PageLayout";
import { routing } from "@/i18n/routing";
import { absoluteUrl } from "@/lib/locale-path";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://imageprompt.tools";
const UNINSTALL_LOCALE = routing.defaultLocale;
const DEFAULT_FORM_EMBED_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSceBSXkfJvq77UN9UXBdRp8760JeKempzBeekAxcYmfdsxIoA/viewform?embedded=true";

type Props = { params: Promise<{ locale: string }> };

function resolveFormEmbedUrl(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (!url.hostname.endsWith("google.com")) return null;
    url.searchParams.set("embedded", "true");
    return url.toString();
  } catch {
    return null;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: UNINSTALL_LOCALE, namespace: "Meta" });
  const canonical = absoluteUrl(SITE_URL, "/uninstall", UNINSTALL_LOCALE);
  return {
    title: t("uninstallPageTitle"),
    description: t("uninstallPageDescription"),
    robots: "noindex, nofollow",
    alternates: {
      canonical,
    },
  };
}

export default async function UninstallPage({ params }: Props) {
  const { locale } = await params;
  if (locale !== UNINSTALL_LOCALE) {
    redirect("/uninstall");
  }

  setRequestLocale(UNINSTALL_LOCALE);

  const t = await getTranslations({ locale: UNINSTALL_LOCALE, namespace: "Uninstall" });
  const formEmbedUrl =
    resolveFormEmbedUrl(process.env.NEXT_PUBLIC_UNINSTALL_FORM_EMBED_URL) ??
    resolveFormEmbedUrl(DEFAULT_FORM_EMBED_URL);

  return (
    <PageLayout>
      <article className="mx-auto max-w-3xl px-5 py-14 sm:py-20">
        <header className="text-center sm:text-left">
          <h1 className="text-balance text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">
            {t("title")}
          </h1>
          <p className="mt-4 text-lg text-zinc-400">{t("subtitle")}</p>
        </header>

        <section className="mt-10">
          {formEmbedUrl ? (
            <iframe
              src={formEmbedUrl}
              title={t("formTitle")}
              width="100%"
              height={720}
              className="min-h-[480px] rounded-xl border border-white/[0.08] bg-zinc-900/40"
              loading="lazy"
            />
          ) : (
            <p className="rounded-xl border border-white/[0.08] bg-zinc-900/40 px-5 py-8 text-center text-zinc-400">
              {t("formUnavailable")}
            </p>
          )}
        </section>
      </article>
    </PageLayout>
  );
}
