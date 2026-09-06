import { defaultLocale, isAppLocale, type AppLocale } from "./config";

export function preferredLocale(acceptLanguage: string | null): AppLocale {
  if (!acceptLanguage) return defaultLocale;
  const preferences = acceptLanguage
    .split(",")
    .map((part) => {
      const [language = "", quality = "q=1"] = part.trim().split(";");
      return {
        language: language.toLowerCase(),
        quality: Number.parseFloat(quality.replace(/^q=/, "")) || 0,
      };
    })
    .sort((left, right) => right.quality - left.quality);

  for (const preference of preferences) {
    if (preference.quality <= 0) continue;
    if (preference.language === "en" || preference.language.startsWith("en-")) {
      return "en";
    }
    if (preference.language === "ar" || preference.language.startsWith("ar-")) {
      return "ar-SA";
    }
  }
  return defaultLocale;
}

export function pathnameLocale(pathname: string): AppLocale | null {
  const segment = pathname.split("/")[1];
  return segment && isAppLocale(segment) ? segment : null;
}

export function localizePathname(pathname: string, locale: AppLocale): string {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return normalized === "/" ? `/${locale}` : `/${locale}${normalized}`;
}

export function replacePathnameLocale(
  pathname: string,
  locale: AppLocale,
): string {
  const current = pathnameLocale(pathname);
  if (!current) return localizePathname(pathname, locale);
  return pathname.replace(`/${current}`, `/${locale}`);
}
