import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicInvitationRouteClient } from "@/components/public-invitation-route-client";
import { isAppLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import {
  ApiClientError,
  getPublicInvitation,
  isPublicInvitationToken,
} from "@/lib/api";

interface PublicInvitationPageProps {
  params: Promise<{ locale: string; token: string }>;
}

export async function generateMetadata({
  params,
}: PublicInvitationPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isAppLocale(locale)) return privateMetadata("Private invitation");
  const dictionary = await getDictionary(locale);
  return privateMetadata(dictionary.publicInvitation.metadataTitle);
}

export default async function PublicInvitationPage({
  params,
}: PublicInvitationPageProps) {
  const { locale, token } = await params;
  if (!isAppLocale(locale) || !isPublicInvitationToken(token)) notFound();

  const dictionaryPromise = getDictionary(locale);
  let invitation;
  try {
    invitation = await getPublicInvitation(token, locale);
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) notFound();
    throw error;
  }
  const dictionary = await dictionaryPromise;

  return (
    <PublicInvitationRouteClient
      copy={dictionary.publicInvitation}
      initialInvitation={invitation}
      locale={locale}
      token={token}
    />
  );
}

function privateMetadata(title: string): Metadata {
  const robots = {
    follow: false,
    index: false,
    noarchive: true,
    nocache: true,
  } as const;
  return {
    description: title,
    formatDetection: { address: false, email: false, telephone: false },
    referrer: "no-referrer",
    robots: { ...robots, googleBot: robots },
    title: { absolute: title },
  };
}
