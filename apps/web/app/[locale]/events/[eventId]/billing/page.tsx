import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventWorkspaceClient } from "@/components/event-workspace-client";
import { isAppLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

interface EventBillingPageProps {
  params: Promise<{ locale: string; eventId: string }>;
}

export async function generateMetadata({
  params,
}: EventBillingPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isAppLocale(locale)) return {};
  return { title: (await getDictionary(locale)).billing.metadataTitle };
}

export default async function EventBillingPage({
  params,
}: EventBillingPageProps) {
  const { locale, eventId } = await params;
  if (!isAppLocale(locale)) notFound();
  const dictionary = await getDictionary(locale);
  return (
    <EventWorkspaceClient
      billingCopy={dictionary.billing}
      checkInCopy={dictionary.checkIn}
      common={dictionary.common}
      copy={dictionary.workspace}
      eventId={eventId}
      eventsCopy={dictionary.events}
      guestsCopy={dictionary.guests}
      locale={locale}
      notificationsCopy={dictionary.notifications}
      preparationCopy={dictionary.preparation}
      remindersCopy={dictionary.reminders}
      reportsCopy={dictionary.reports}
      section="billing"
      sendingCopy={dictionary.sending}
      shellCopy={dictionary.shell}
      teamCopy={dictionary.team}
    />
  );
}
