import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventWorkspaceClient } from "@/components/event-workspace-client";
import { isAppLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

interface EventGuestsPageProps {
  params: Promise<{ locale: string; eventId: string }>;
}

export async function generateMetadata({
  params,
}: EventGuestsPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isAppLocale(locale)) return {};
  return { title: (await getDictionary(locale)).guests.metadataTitle };
}

export default async function EventGuestsPage({
  params,
}: EventGuestsPageProps) {
  const { locale, eventId } = await params;
  if (!isAppLocale(locale)) notFound();
  const dictionary = await getDictionary(locale);
  return (
    <EventWorkspaceClient
      common={dictionary.common}
      copy={dictionary.workspace}
      eventId={eventId}
      eventsCopy={dictionary.events}
      guestsCopy={dictionary.guests}
      locale={locale}
      section="guests"
      shellCopy={dictionary.shell}
    />
  );
}
