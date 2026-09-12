"use client";

import type { PublicInvitation } from "@dawah/api-contract";
import type { AppLocale } from "../i18n/config";
import type { Dictionary } from "../i18n/dictionaries";
import { getPublicInvitation, submitPublicRsvp } from "../lib/api";
import { PublicInvitationClient } from "./public-invitation";

export interface PublicInvitationRouteClientProps {
  copy: Dictionary["publicInvitation"];
  initialInvitation: PublicInvitation;
  locale: AppLocale;
  token: string;
}

export function PublicInvitationRouteClient(
  props: PublicInvitationRouteClientProps,
) {
  return (
    <PublicInvitationClient
      {...props}
      loadInvitation={getPublicInvitation}
      submitRsvp={submitPublicRsvp}
    />
  );
}
