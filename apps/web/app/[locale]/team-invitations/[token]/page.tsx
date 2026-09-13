import { acceptTeamInvitationSchema } from "@dawah/api-contract";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TeamInvitationAcceptance } from "@/components/team-invitation-acceptance";
import { isAppLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

interface TeamInvitationPageProps {
  params: Promise<{ locale: string; token: string }>;
}

export async function generateMetadata({
  params,
}: TeamInvitationPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isAppLocale(locale)) return {};
  return { title: (await getDictionary(locale)).teamInvitation.metadataTitle };
}

export default async function TeamInvitationPage({
  params,
}: TeamInvitationPageProps) {
  const { locale, token } = await params;
  if (!isAppLocale(locale)) notFound();
  const parsed = acceptTeamInvitationSchema.safeParse({ token });
  if (!parsed.success) notFound();
  const dictionary = await getDictionary(locale);

  return (
    <TeamInvitationAcceptance
      common={dictionary.common}
      copy={dictionary.teamInvitation}
      locale={locale}
      token={parsed.data.token}
    />
  );
}
