export const locales = ["ar-SA", "en"] as const;
export type AppLocale = (typeof locales)[number];

export const defaultLocale: AppLocale = "ar-SA";

export function isAppLocale(value: string): value is AppLocale {
  return locales.includes(value as AppLocale);
}

export function localeDirection(locale: AppLocale): "rtl" | "ltr" {
  return locale === "ar-SA" ? "rtl" : "ltr";
}
