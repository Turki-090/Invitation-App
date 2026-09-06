import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventsClient } from "@/components/events-client";
import { isAppLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

interface EventsPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: EventsPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isAppLocale(locale)) return {};
  return { title: (await getDictionary(locale)).events.metadataTitle };
}

export default async function EventsPage({ params }: EventsPageProps) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  const dictionary = await getDictionary(locale);
  return (
    <EventsClient
      common={dictionary.common}
      copy={dictionary.events}
      locale={locale}
      shellCopy={dictionary.shell}
    />
  );
}
