import type { PublicInvitation, RsvpResult } from "@dawah/api-contract";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PublicInvitationClient } from "../components/public-invitation";
import arSA from "../i18n/dictionaries/ar-SA";
import en from "../i18n/dictionaries/en";

const meta = {
  title: "Guest/Public invitation",
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const token = "storybook-private-invitation-capability-000001";
const firstMemberId = "10000000-0000-4000-8000-000000000001";
const secondMemberId = "10000000-0000-4000-8000-000000000002";
const thirdMemberId = "10000000-0000-4000-8000-000000000003";

export const NamedFamilyArabic: Story = {
  globals: { locale: "ar-SA" },
  parameters: { viewport: { defaultViewport: "mobile" } },
  render: () => {
    const invitation = namedFamilyInvitation();
    return (
      <PublicInvitationClient
        copy={arSA.publicInvitation}
        initialInvitation={invitation}
        loadInvitation={async () => invitation}
        locale="ar-SA"
        submitRsvp={unavailableSubmission}
        token={token}
      />
    );
  },
};

export const CompanionsEnglish: Story = {
  globals: { locale: "en" },
  parameters: { viewport: { defaultViewport: "mobile" } },
  render: () => {
    const invitation = companionInvitation();
    return (
      <PublicInvitationClient
        copy={en.publicInvitation}
        initialInvitation={invitation}
        loadInvitation={async () => invitation}
        locale="en"
        submitRsvp={unavailableSubmission}
        token={token}
      />
    );
  },
};

function namedFamilyInvitation(): PublicInvitation {
  return {
    currentRsvp: null,
    event: {
      city: "الرياض",
      endTime: "23:00",
      eventDate: "2026-10-10",
      eventType: "WEDDING",
      mapUrl: "https://maps.example.test/venue",
      name: "زواج محمد ونورة",
      rsvpDeadline: "2026-10-01",
      startTime: "20:30",
      timezone: "Asia/Riyadh",
      venueName: "قاعة الماسة",
    },
    invitation: {
      displayName: "عائلة الدوسري",
      invitationType: "NAMED_GROUP",
      maxCompanions: 0,
      members: [
        { id: firstMemberId, isPrimary: true, name: "عبدالله", position: 1 },
        { id: secondMemberId, isPrimary: false, name: "منيرة", position: 2 },
        { id: thirdMemberId, isPrimary: false, name: "ريم", position: 3 },
      ],
    },
    locale: "ar-SA",
    policy: {
      canEdit: false,
      canRespond: true,
      lifecycleState: "OPEN",
      reason: "INITIAL_RESPONSE_AVAILABLE",
    },
  };
}

function companionInvitation(): PublicInvitation {
  return {
    currentRsvp: null,
    event: {
      city: "Riyadh",
      endTime: "11:00",
      eventDate: "2026-12-06",
      eventType: "GRADUATION",
      mapUrl: "https://maps.example.test/venue",
      name: "Noura's graduation",
      rsvpDeadline: "2026-11-28",
      startTime: "09:30",
      timezone: "Asia/Riyadh",
      venueName: "The Palm Garden",
    },
    invitation: {
      displayName: "Sarah Al-Qahtani",
      invitationType: "PRIMARY_WITH_COMPANIONS",
      maxCompanions: 2,
      members: [
        { id: firstMemberId, isPrimary: true, name: "Sarah", position: 1 },
      ],
    },
    locale: "en",
    policy: {
      canEdit: false,
      canRespond: true,
      lifecycleState: "OPEN",
      reason: "INITIAL_RESPONSE_AVAILABLE",
    },
  };
}

async function unavailableSubmission(): Promise<RsvpResult> {
  throw new Error("This static story does not submit RSVP data.");
}
