import Image from "next/image";

/** Публичный марк бренда в шапке (тот же файл, что favicon). */
export const SITE_LOGO_MARK_SRC = "/favicon.png";

type SiteLogoMarkProps = {
  size: number;
  className?: string;
};

export function SiteLogoMark({ size, className }: SiteLogoMarkProps) {
  return (
    <Image
      src={SITE_LOGO_MARK_SRC}
      alt=""
      width={size}
      height={size}
      unoptimized
      className={className}
    />
  );
}
