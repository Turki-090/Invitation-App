import type { AppLocale } from "../i18n/config";

const relativeOrigin = "https://dawah.invalid";

function includesControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
}

export function safeRelativeRedirect(
  value: string | null | undefined,
  locale: AppLocale,
  fallback = `/${locale}/events`,
): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    includesControlCharacter(value)
  ) {
    return fallback;
  }

  try {
    const parsed = new URL(value, relativeOrigin);
    const localeRoot = `/${locale}`;
    if (
      parsed.origin !== relativeOrigin ||
      (parsed.pathname !== localeRoot &&
        !parsed.pathname.startsWith(`${localeRoot}/`))
    ) {
      return fallback;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
