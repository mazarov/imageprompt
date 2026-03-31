import type { TagEntry } from "./tag-registry";
import { routing } from "@/i18n/routing";

/** Visible label for a catalog tag (menu uses the same registry). */
export function tagDisplayLabel(tag: TagEntry, locale: string): string {
  return locale === routing.defaultLocale ? tag.labelEn : tag.labelRu;
}
