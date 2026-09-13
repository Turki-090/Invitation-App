"use client";

import { Button, GuestShell, Icon } from "@dawah/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import React from "react";
import type { AppLocale } from "../i18n/config";
import type { Dictionary } from "../i18n/dictionaries";
import { acceptTeamInvitation, developmentAuthBypassEnabled } from "../lib/api";
import { getSupabaseClient } from "../lib/supabase";
import { LocaleSwitcher } from "./locale-switcher";

interface TeamInvitationAcceptanceProps {
  common: Dictionary["common"];
  copy: Dictionary["teamInvitation"];
  locale: AppLocale;
  token: string;
}

export function TeamInvitationAcceptance({
  common,
  copy,
  locale,
  token,
}: TeamInvitationAcceptanceProps) {
  const queryClient = useQueryClient();
  const supabase = getSupabaseClient();
  const session = useQuery({
    enabled: Boolean(supabase) && !developmentAuthBypassEnabled,
    queryFn: async () => {
      if (!supabase) return null;
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      return data.session;
    },
    queryKey: ["auth", "session"],
    retry: false,
  });
  const accept = useMutation({
    mutationFn: () => acceptTeamInvitation(supabase, token),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["events"] }),
        queryClient.invalidateQueries({
          queryKey: ["events", result.eventId],
        }),
      ]);
    },
  });
  const checkingSession =
    !developmentAuthBypassEnabled && Boolean(supabase) && session.isLoading;
  const signedIn =
    developmentAuthBypassEnabled || Boolean(supabase && session.data);
  const invitationPath = `/${locale}/team-invitations/${token}`;
  const signInHref = `/${locale}?next=${encodeURIComponent(invitationPath)}`;

  return (
    <GuestShell
      className="team-invitation-page"
      eyebrow={copy.eyebrow}
      footer={
        <LocaleSwitcher
          arabicLabel={common.arabic}
          englishLabel={common.english}
          label={common.language}
          locale={locale}
        />
      }
      subtitle={copy.description}
      title={copy.title}
    >
      {checkingSession ? (
        <div
          aria-busy="true"
          aria-label={copy.checkingSession}
          className="team-invitation-state"
          role="status"
        >
          <Icon className="dawah-spin" name="loader-circle" size={28} />
          <p>{copy.checkingSession}</p>
        </div>
      ) : accept.data ? (
        <div className="team-invitation-state">
          <Icon name="badge-check" size={34} />
          <h2>{copy.acceptedTitle}</h2>
          <p>
            {accept.data.alreadyAccepted
              ? copy.alreadyAccepted
              : copy.acceptedDescription}
          </p>
          <Link
            className="dawah-button dawah-button--guest-primary dawah-button--guest"
            href={`/${locale}/events/${accept.data.eventId}`}
          >
            <span>{copy.openEvent}</span>
          </Link>
        </div>
      ) : !signedIn ? (
        <div className="team-invitation-state">
          <Icon name="lock" size={30} />
          <h2>{copy.signInTitle}</h2>
          <p>{copy.signInDescription}</p>
          <Link
            className="dawah-button dawah-button--guest-primary dawah-button--guest"
            href={signInHref}
          >
            <span>{copy.signInAction}</span>
          </Link>
        </div>
      ) : accept.isError ? (
        <div className="team-invitation-state team-invitation-state--error">
          <Icon name="circle-alert" size={32} />
          <h2>{copy.errorTitle}</h2>
          <p>{copy.errorDescription}</p>
          <Button
            onClick={() => accept.reset()}
            size="guest"
            variant="guest-secondary"
          >
            {copy.tryAgain}
          </Button>
        </div>
      ) : (
        <div className="team-invitation-state">
          <Icon name="users" size={32} />
          <h2>{copy.readyTitle}</h2>
          <p>{copy.readyDescription}</p>
          <Button
            loading={accept.isPending}
            onClick={() => accept.mutate()}
            size="guest"
            variant="guest-primary"
          >
            {accept.isPending ? copy.accepting : copy.accept}
          </Button>
        </div>
      )}
    </GuestShell>
  );
}
