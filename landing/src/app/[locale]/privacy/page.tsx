import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PageLayout } from "@/components/PageLayout";
import { absoluteUrl } from "@/lib/locale-path";

const SITE = "ImagePrompt";
const DOMAIN = "imageprompt.tools";
const EMAIL = `hello@${DOMAIN}`;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || `https://${DOMAIN}`;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Meta" });
  const canonical = absoluteUrl(SITE_URL, "/privacy", locale);
  const enUrl = absoluteUrl(SITE_URL, "/privacy", "en");
  const ruUrl = absoluteUrl(SITE_URL, "/privacy", "ru");
  return {
    title: t("privacyPageTitle"),
    description: t("privacyPageDescription"),
    robots: "noindex, follow",
    alternates: {
      canonical,
      languages: { en: enUrl, ru: ruUrl },
    },
  };
}

export default async function PrivacyPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Privacy" });
  const draft = t("draftNote");

  const rich = {
    bold: (chunks: ReactNode) => <strong>{chunks}</strong>,
    mail: (chunks: ReactNode) => (
      <a href={`mailto:${EMAIL}`} className="text-indigo-400 underline hover:text-indigo-300">
        {chunks}
      </a>
    ),
    privacyLink: (chunks: ReactNode) => (
      <Link href="/privacy" className="text-indigo-400 underline hover:text-indigo-300">
        {chunks}
      </Link>
    ),
  };

  return (
    <PageLayout>
      <article className="mx-auto max-w-3xl px-5 py-16">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-50">{t("title")}</h1>
        <p className="mt-2 text-sm text-zinc-400">{t("effective")}</p>
        {draft ? (
          <p className="mt-3 text-sm text-amber-300/90">{draft}</p>
        ) : null}

        <div className="mt-10 space-y-8 text-[15px] leading-relaxed text-zinc-300">
          <section>
            <h2 className="text-lg font-semibold text-zinc-100">{t("s1h")}</h2>
            <p className="mt-2">{t("s1p1", { domain: DOMAIN, site: SITE })}</p>
            <p className="mt-2">{t("s1p2")}</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-100">{t("s2h")}</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>{t.rich("s2li1", rich)}</li>
              <li>{t.rich("s2li2", rich)}</li>
              <li>{t.rich("s2li3", rich)}</li>
              <li>{t.rich("s2li4", rich)}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-100">{t("s3h")}</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>{t("s3li1")}</li>
              <li>{t("s3li2")}</li>
              <li>{t("s3li3")}</li>
              <li>{t("s3li4")}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-100">{t("s4h")}</h2>
            <p className="mt-2">{t("s4p1")}</p>
            <p className="mt-2">{t("s4p2")}</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-100">{t("s5h")}</h2>
            <p className="mt-2">{t("s5intro")}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>{t.rich("s5li1", rich)}</li>
              <li>{t.rich("s5li2", rich)}</li>
              <li>{t.rich("s5li3", rich)}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-100">{t("s6h")}</h2>
            <p className="mt-2">{t("s6intro")}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>{t("s6li1")}</li>
              <li>{t("s6li2")}</li>
              <li>{t("s6li3")}</li>
              <li>{t("s6li4")}</li>
            </ul>
            <p className="mt-2">
              {t.rich("s6contact", { ...rich, emailAddress: EMAIL })}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-100">{t("s7h")}</h2>
            <p className="mt-2">
              {t.rich("s7p1", { ...rich, privacyUrl: `${DOMAIN}/privacy` })}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-100">{t("s8h")}</h2>
            <p className="mt-2">{t.rich("s8p1", { ...rich, emailAddress: EMAIL })}</p>
          </section>
        </div>
      </article>
    </PageLayout>
  );
}
