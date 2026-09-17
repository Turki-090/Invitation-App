import type { CheckInDashboard } from "@dawah/api-contract";
import { EmptyState } from "@dawah/ui";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { EventCheckIn } from "../components/event-check-in";
import type { AppLocale } from "../i18n/config";
import arSA from "../i18n/dictionaries/ar-SA";
import en from "../i18n/dictionaries/en";

const meta = {
  title: "Host/Event-day check-in",
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const eventId = "20000000-0000-4000-8000-000000000001";
const firstGroupId = "20000000-0000-4000-8000-000000000002";
const secondGroupId = "20000000-0000-4000-8000-000000000003";

export const Arabic: Story = {
  globals: { locale: "ar-SA" },
  render: () => <CheckInSurface locale="ar-SA" />,
};

export const English: Story = {
  globals: { locale: "en" },
  render: () => <CheckInSurface locale="en" />,
};

export const NotEnabled: Story = {
  globals: { locale: "ar-SA" },
  // What the surface renders when the API reports that entry passes are off for
  // this environment or this event.
  render: () => (
    <EmptyState
      description={arSA.checkIn.disabledDescription}
      icon="lock"
      title={arSA.checkIn.disabledTitle}
    />
  ),
};

export const PermissionDenied: Story = {
  globals: { locale: "en" },
  // The workspace shell renders this state in place of the surface whenever the
  // server-computed check-in capability is false.
  render: () => (
    <EmptyState
      description={en.checkIn.permissionDeniedDescription}
      icon="circle-alert"
      title={en.checkIn.permissionDeniedTitle}
    />
  ),
};

function CheckInSurface({ locale }: { locale: AppLocale }) {
  const [client] = useState(() => seededClient(locale));
  const dictionary = locale === "ar-SA" ? arSA : en;
  return (
    <QueryClientProvider client={client}>
      <EventCheckIn
        common={dictionary.common}
        copy={dictionary.checkIn}
        eventId={eventId}
        locale={locale}
        supabase={null}
      />
    </QueryClientProvider>
  );
}

function seededClient(locale: AppLocale): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: {
        refetchOnMount: false,
        refetchOnReconnect: false,
        refetchOnWindowFocus: false,
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
      },
    },
  });
  client.setQueryData(
    ["events", eventId, "check-ins", "dashboard"],
    dashboard(locale),
  );
  return client;
}

function dashboard(locale: AppLocale): CheckInDashboard {
  const arabic = locale === "ar-SA";
  return {
    eventId,
    expectedAttendance: 497,
    checkedInAttendance: 318,
    remainingAttendance: 179,
    checkInPercentage: 64,
    invitationGroups: 120,
    fullyCheckedInGroups: 72,
    partiallyCheckedInGroups: 11,
    notArrivedGroups: 37,
    duplicateAttempts: 4,
    recentArrivals: [
      {
        recordId: "20000000-0000-4000-8000-000000000010",
        invitationGroupId: firstGroupId,
        displayName: arabic ? "عائلة القحطاني" : "Al-Qahtani family",
        attendeeCount: 4,
        checkedInAttendance: 4,
        confirmedAttendance: 4,
        source: "QR",
        checkedInAt: "2026-09-17T18:05:00.000Z",
        checkedInBy: arabic ? "نورة" : "Noura",
        deviceId: null,
      },
      {
        recordId: "20000000-0000-4000-8000-000000000011",
        invitationGroupId: secondGroupId,
        displayName: arabic ? "عائلة العمري" : "Al-Omari family",
        attendeeCount: 2,
        checkedInAttendance: 3,
        confirmedAttendance: 5,
        source: "MANUAL",
        checkedInAt: "2026-09-17T18:02:00.000Z",
        checkedInBy: arabic ? "خالد" : "Khalid",
        deviceId: null,
      },
    ],
    calculatedAt: "2026-09-17T18:06:00.000Z",
  };
}
