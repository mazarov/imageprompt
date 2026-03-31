import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

const FAQ_KEYS = [
  { q: "q1", a: "a1" },
  { q: "q2", a: "a2" },
  { q: "q3", a: "a3" },
  { q: "q4", a: "a4" },
  { q: "q5", a: "a5" },
  { q: "q6", a: "a6" },
  { q: "q7", a: "a7" },
  { q: "q8", a: "a8" },
  { q: "q9", a: "a9" },
  { q: "q10", a: "a10" },
] as const;

export async function ExtensionStvFaq() {
  const t = await getTranslations("Marketing.faq");

  return (
    <section className="py-12 sm:py-14" aria-labelledby="extension-stv-faq-heading">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <h2
          id="extension-stv-faq-heading"
          className="text-center text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl"
        >
          {t("title")}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-sm text-zinc-500">{t("subtitle")}</p>

        <div className="mt-8 space-y-3">
          {FAQ_KEYS.map((item) => (
            <details
              key={item.q}
              className="group rounded-xl border border-white/[0.08] bg-[rgb(24_24_27/0.35)] transition-colors open:border-indigo-500/25 open:bg-[rgb(24_24_27/0.5)] open:ring-1 open:ring-indigo-500/15"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-left text-sm font-medium text-zinc-100 sm:text-[15px] [&::-webkit-details-marker]:hidden">
                <span>{t(item.q)}</span>
                <span
                  className="shrink-0 text-zinc-500 transition-transform duration-200 group-open:rotate-180"
                  aria-hidden
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="stroke-current">
                    <path d="M6 9l6 6 6-6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </summary>
              <div className="px-5 pb-4 pt-0 text-sm leading-relaxed text-zinc-400 [&_a]:text-indigo-300 [&_a]:underline-offset-2 [&_a]:hover:underline">
                <div className="pt-2">
                  {item.a === "a9" ? (
                    t.rich("a9", {
                      privacy: (chunks) => (
                        <Link href="/privacy" className="text-indigo-300 underline-offset-2 hover:underline">
                          {chunks}
                        </Link>
                      ),
                    })
                  ) : (
                    t(item.a)
                  )}
                </div>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
