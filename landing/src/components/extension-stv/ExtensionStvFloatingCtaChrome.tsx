"use client";

import { ExtensionStvChromeMark } from "./ExtensionStvChromeMark";
import { STV_CHROME_STORE_URL, STV_FOCUS_RING, STV_SECTION_CONTAINER } from "./stv-marketing-shared";

/**
 * Плавающий CTA по ширине колонки контента.
 * Подсветка — узкий сектор на конусе один раз обходит только «бордер» (слой между padding и кнопкой), затем исчезает;
 * текст и вид кнопки не изменяются.
 */
export function ExtensionStvFloatingCtaChrome({ label }: { label: string }) {
  return (
    <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-[60] lg:left-60 lg:right-0">
      <div
        className={`${STV_SECTION_CONTAINER} pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:pb-[max(2rem,env(safe-area-inset-bottom))]`}
      >
        <div className="flex justify-center">
          <div className="relative inline-flex overflow-hidden rounded-full p-[2.5px] shadow-[0_14px_48px_-14px_rgba(0,0,0,0.78)]">
            <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]" aria-hidden>
              <span
                className="animate-landing-chrome-border-once absolute left-1/2 top-1/2 aspect-square min-h-[230%] min-w-[230%] rounded-full bg-[conic-gradient(from_0deg_at_50%_50%,transparent_0deg,transparent_302deg,rgba(76,61,217,0.95)_317deg,rgba(99,102,241,1)_331deg,rgba(76,61,217,0.85)_348deg,transparent_360deg)]"
              />
            </span>

            <a
              href={STV_CHROME_STORE_URL}
              className={`pointer-events-auto relative z-[1] inline-flex items-center justify-center gap-2 rounded-full border border-white/[0.1] bg-[#09090b]/93 px-6 py-2.5 text-sm font-semibold text-zinc-100 backdrop-blur-md transition-colors duration-200 hover:border-white/[0.16] hover:bg-[#09090b]/96 ${STV_FOCUS_RING}`}
            >
              <ExtensionStvChromeMark className="h-5 w-5 shrink-0" />
              <span>{label}</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
