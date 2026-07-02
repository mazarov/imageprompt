import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Inter } from "next/font/google";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { type AppLocale, routing } from "@/i18n/routing";
import { DebugProvider } from "@/components/DebugFAB";
import { AuthProvider } from "@/context/AuthContext";
import { GenerationProvider } from "@/context/GenerationContext";
import { STV_APP_SHELL_CLASS } from "@/lib/stv-app-theme";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://imageprompt.tools";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Meta" });
  return {
    metadataBase: new URL(SITE_URL),
    title: {
      template: "%s · image to prompt",
      default: t("hubTitleAbsolute"),
    },
    description: t("hubDescription"),
    manifest: "/site.webmanifest",
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      type: "website",
      siteName: "ImagePrompt",
      images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "ImagePrompt — AI image tools" }],
    },
    twitter: {
      card: "summary_large_image",
      images: ["/og-image.png"],
    },
    icons: {
      icon: [{ url: "/favicon.png", type: "image/png", sizes: "128x128" }],
      apple: [{ url: "/favicon.png", type: "image/png", sizes: "128x128" }],
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as AppLocale)) {
    notFound();
  }
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html lang={locale} className={inter.className} suppressHydrationWarning>
      <body className={STV_APP_SHELL_CLASS}>
        <NextIntlClientProvider messages={messages}>
          <AuthProvider>
            <DebugProvider>
              <GenerationProvider>{children}</GenerationProvider>
            </DebugProvider>
          </AuthProvider>
        </NextIntlClientProvider>

        <Script id="yandex-metrika" strategy="lazyOnload">{`
          (function(m,e,t,r,i,k,a){
            m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
            m[i].l=1*new Date();
            for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}
            k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
          })(window,document,'script','https://mc.yandex.ru/metrika/tag.js?id=110332919','ym');
          ym(110332919,'init',{ssr:true,webvisor:true,clickmap:true,ecommerce:"dataLayer",referrer:document.referrer,url:location.href,accurateTrackBounce:true,trackLinks:true});
        `}</Script>
        <noscript>
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="https://mc.yandex.ru/watch/110332919" style={{ position: "absolute", left: "-9999px" }} alt="" />
          </div>
        </noscript>
      </body>
    </html>
  );
}
