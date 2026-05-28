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
            {/* Left column: full photo with the real extension-lite FAB (hover state) attached to its right edge */}
            <div className="relative mx-auto w-full max-w-md lg:mx-0">
              <style>{`
                @keyframes liteBorderRun { to { stroke-dashoffset: -100; } }
              `}</style>
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

              {/* Exact extension-lite FAB artifact (hover state), placed over the image.
                  The flat right side is aligned to the photo edge; the rounded side sits on top of the photo. */}
              <div
                className="absolute z-10"
                style={{ right: "-1px", top: "22%", width: 32, height: 40 }}
                aria-hidden
              >
                <div
                  className="relative h-full w-full overflow-hidden rounded-l-[12px] border border-black/10 bg-white shadow-[0_2px_10px_rgba(0,0,0,0.1),0_0_0_1px_rgba(255,255,255,0.8)]"
                  style={{ borderRightWidth: 0 }}
                >
                  <svg className="absolute inset-0 h-full w-full" viewBox="0 0 32 40" aria-hidden>
                    <defs>
                      <linearGradient id="demoFabBorder" x1="4" y1="4" x2="30" y2="36" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#6366f1" />
                        <stop offset="1" stopColor="#8b5cf6" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M32 0 H12 A12 12 0 0 0 0 12 V28 A12 12 0 0 0 12 40 H32 V0"
                      fill="none"
                      stroke="url(#demoFabBorder)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray="11 89"
                      pathLength="100"
                      style={{ animation: "liteBorderRun 1.15s linear infinite" }}
                    />
                  </svg>
                  <div className="absolute inset-0 grid place-items-center">
                    <Image
                      src="/icons/icon-widget-star.png"
                      alt=""
                      width={18}
                      height={18}
                      unoptimized
                      className="h-[18px] w-[18px] translate-x-[1px] object-contain"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Right column: prompt block (next to the artifact) above the 1-5 steps */}
            <div className="flex flex-col gap-6">
              <div className="rounded-2xl border border-indigo-400/40 bg-zinc-950/95 p-4 shadow-sm sm:p-5">
                <p className="text-[11px] font-medium italic tracking-wide text-indigo-300/90">prompt</p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-200">{promptSnippet}</p>
              </div>

              <ol className="list-none space-y-6 p-0">
                {steps.map((text, i) => (
                  <li key={`how-step-${i}`} className="flex gap-4">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-sm font-bold text-white shadow-md shadow-indigo-500/25" aria-hidden>
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
      </div>
    </section>
  );
}
