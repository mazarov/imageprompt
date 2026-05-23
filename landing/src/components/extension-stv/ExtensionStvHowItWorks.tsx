import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { LANDING_BORDER_CARD } from "@/lib/landing-design-tokens";
import { PAIN_REFERENCE_IMAGE_SRC } from "./stv-mock-shared";
import {
  STV_SECTION_BG_MUTED,
  STV_SECTION_CONTAINER,
  STV_SECTION_PY,
  STV_SECTION_SUBTITLE,
  STV_SECTION_TITLE,
  STV_VISUAL_SHELL,
} from "./stv-marketing-shared";

export async function ExtensionStvHowItWorks() {
  const t = await getTranslations("Marketing.how");
  const steps = [t("step1"), t("step2"), t("step3"), t("step4"), t("step5")];
  const promptSnippet = t("promptSnippet");

  return (
    <section
      className={`${STV_SECTION_BG_MUTED} ${STV_SECTION_PY}`}
      aria-labelledby="extension-stv-how-heading"
    >
      <div className={STV_SECTION_CONTAINER}>
        <h2 id="extension-stv-how-heading" className={STV_SECTION_TITLE}>
          {t("title")}
        </h2>
        <p className={STV_SECTION_SUBTITLE}>{t("subtitleP1")}</p>

        <div className={`mt-10 sm:mt-12 ${STV_VISUAL_SHELL}`}>
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <div className="relative mx-auto w-full max-w-md lg:mx-0">
              <div className={`relative overflow-hidden rounded-2xl ${LANDING_BORDER_CARD} bg-zinc-950/50 shadow-lg`}>
                <div className="relative aspect-[4/5] w-full">
                  <Image
                    src={PAIN_REFERENCE_IMAGE_SRC}
                    alt="Reference photo used in the how-to example"
                    fill
                    unoptimized
                    className="object-cover object-center"
                    sizes="(max-width: 1024px) 100vw, 400px"
                    quality={60}
                  />
                </div>
              </div>

              <div className="relative z-[1] -mt-2 flex justify-center sm:-mt-3" aria-hidden>
                <svg
                  width="120"
                  height="48"
                  viewBox="0 0 120 48"
                  fill="none"
                  className="text-indigo-400"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M60 4C60 4 24 8 20 28C16 44 32 44 60 44"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    fill="none"
                    opacity="0.9"
                  />
                  <path
                    d="M52 38L60 44L68 38"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              <div className="relative z-[2] -mt-2 rounded-2xl border-2 border-indigo-400/45 bg-zinc-950/95 p-4 shadow-[0_12px_40px_-16px_rgba(99,102,241,0.45)] sm:p-5">
                <p className="text-[11px] font-medium italic tracking-wide text-indigo-300/90">prompt</p>
                <p className="mt-2 text-left text-pretty text-sm leading-relaxed text-zinc-300">{promptSnippet}</p>
              </div>
            </div>

            <ol className="list-none space-y-6 p-0">
              {steps.map((text, i) => (
                <li key={`how-step-${i}`} className="flex gap-4">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-sm font-bold text-white shadow-md shadow-indigo-500/25"
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-base font-semibold leading-relaxed tracking-tight text-zinc-100">{text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
