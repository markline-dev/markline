import type { MarklineConfig } from "./config";

/**
 * The page's `<html lang>`: `lang` from markline.json, else the default
 * (first) locale's id, else "en".
 */
export function htmlLang(config: Pick<MarklineConfig, "lang" | "i18n">): string {
  return config.lang?.trim() || config.i18n?.locales?.[0]?.id || "en";
}
