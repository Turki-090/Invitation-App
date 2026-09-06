"use client";

import { Icon } from "@dawah/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AppLocale } from "@/i18n/config";
import { locales } from "@/i18n/config";
import { replacePathnameLocale } from "@/i18n/routing";

export interface LocaleSwitcherProps {
  locale: AppLocale;
  label: string;
  arabicLabel: string;
  englishLabel: string;
}

export function LocaleSwitcher({
  locale,
  label,
  arabicLabel,
  englishLabel,
}: LocaleSwitcherProps) {
  const pathname = usePathname();
  const labels: Record<AppLocale, string> = {
    "ar-SA": arabicLabel,
    en: englishLabel,
  };
  return (
    <nav aria-label={label} className="locale-switcher">
      <Icon name="languages" size={16} />
      {locales.map((targetLocale) => (
        <Link
          aria-current={targetLocale === locale ? "page" : undefined}
          href={replacePathnameLocale(pathname, targetLocale)}
          hrefLang={targetLocale}
          key={targetLocale}
          lang={targetLocale}
        >
          {labels[targetLocale]}
        </Link>
      ))}
    </nav>
  );
}
