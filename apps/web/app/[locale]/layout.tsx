import "@dawah/ui/styles.css";
import "../globals.css";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { isAppLocale, localeDirection, locales } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { Providers } from "../providers";

interface LocaleLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: LocaleLayoutProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isAppLocale(locale)) return {};
  const dictionary = await getDictionary(locale);
  return {
    title: {
      default: dictionary.metadata.title,
      template: `%s | ${dictionary.metadata.title}`,
    },
    description: dictionary.metadata.description,
  };
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  return (
    <html dir={localeDirection(locale)} lang={locale}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
