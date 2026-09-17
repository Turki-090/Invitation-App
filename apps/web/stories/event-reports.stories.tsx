import type { EventReport, ListExportJobsResponse } from "@dawah/api-contract";
import { EmptyState } from "@dawah/ui";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { EventReports } from "../components/event-reports";
import type { AppLocale } from "../i18n/config";
import arSA from "../i18n/dictionaries/ar-SA";
import en from "../i18n/dictionaries/en";

const meta = {
  title: "Host/Reports and exports",
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const eventId = "10000000-0000-4000-8000-000000000001";
const completedJobId = "10000000-0000-4000-8000-000000000002";
const processingJobId = "10000000-0000-4000-8000-000000000003";

export const Arabic: Story = {
  globals: { locale: "ar-SA" },
  render: () => <ReportsSurface locale="ar-SA" />,
};

export const English: Story = {
  globals: { locale: "en" },
  render: () => <ReportsSurface locale="en" />,
};

export const PermissionDenied: Story = {
  globals: { locale: "ar-SA" },
  // The workspace shell renders this state in place of the surface whenever the
  // server-computed reports capability is false.
  render: () => (
    <EmptyState
      description={arSA.reports.permissionDeniedDescription}
      icon="circle-alert"
      title={arSA.reports.permissionDeniedTitle}
    />
  ),
};

function ReportsSurface({ locale }: { locale: AppLocale }) {
  const [client] = useState(() => seededClient());
  const dictionary = locale === "ar-SA" ? arSA : en;
  return (
    <QueryClientProvider client={client}>
      <EventReports
        common={dictionary.common}
        copy={dictionary.reports}
        eventId={eventId}
        locale={locale}
        supabase={null}
      />
    </QueryClientProvider>
  );
}

function seededClient(): QueryClient {
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
  client.setQueryData(["events", eventId, "reports"], report());
  client.setQueryData(["events", eventId, "exports"], exportJobs());
  return client;
}

function report(): EventReport {
  return {
    eventId,
    generatedAt: "2026-09-17T09:00:00.000Z",
    invitationGroups: {
      active: 120,
      cancelled: 3,
      withInitialInvitation: 112,
      withoutInitialInvitation: 8,
    },
    namedGuests: 184,
    expectedAttendance: 497,
    rsvp: {
      acceptedGroups: 70,
      partiallyAcceptedGroups: 12,
      declinedGroups: 8,
      pendingGroups: 30,
    },
    invitationTypes: {
      singleGroups: 40,
      namedGroupGroups: 60,
      primaryWithCompanionsGroups: 20,
    },
    delivery: {
      latestInvitationMessages: 112,
      notSentGroups: 8,
      byStatus: {
        queued: 2,
        sending: 1,
        sent: 9,
        delivered: 40,
        read: 35,
        responded: 22,
        failed: 3,
        cancelled: 0,
      },
    },
    checkIn: {
      checkedInGroups: 18,
      checkedInAttendees: 64,
      notArrivedAttendees: 433,
      noShowAttendees: null,
    },
  };
}

function exportJobs(): ListExportJobsResponse {
  return {
    items: [
      {
        id: completedJobId,
        eventId,
        format: "XLSX",
        preset: "FULL_GUEST_LIST",
        status: "COMPLETED",
        rowCount: 184,
        output: {
          filename: "full-guest-list.xlsx",
          contentType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          byteSize: 20_480,
          sha256: "a".repeat(64),
          downloadUrl: `/api/v1/events/${eventId}/exports/${completedJobId}/download?expires=1&signature=${"b".repeat(64)}`,
        },
        failureCode: null,
        failureMessage: null,
        requestedAt: "2026-09-17T08:00:00.000Z",
        processingAt: "2026-09-17T08:00:10.000Z",
        completedAt: "2026-09-17T08:00:30.000Z",
        failedAt: null,
        expiresAt: "2026-09-18T08:00:30.000Z",
      },
      {
        id: processingJobId,
        eventId,
        format: "CSV",
        preset: "CHECK_IN_LIST",
        status: "EXPIRED",
        rowCount: 120,
        output: null,
        failureCode: null,
        failureMessage: null,
        requestedAt: "2026-09-15T08:00:00.000Z",
        processingAt: "2026-09-15T08:00:10.000Z",
        completedAt: "2026-09-15T08:00:25.000Z",
        failedAt: null,
        expiresAt: "2026-09-16T08:00:25.000Z",
      },
    ],
    pagination: { page: 1, pageSize: 20, totalItems: 2, totalPages: 1 },
  };
}
