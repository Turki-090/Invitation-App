import "../test/setup";
import type {
  EventReport,
  ExportJob,
  ListExportJobsResponse,
} from "@dawah/api-contract";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "../i18n/dictionaries/en";
import { EventReports } from "./event-reports";

const eventId = "11111111-1111-4111-8111-111111111111";
const exportJobId = "22222222-2222-4222-8222-222222222222";

const api = vi.hoisted(() => ({
  createExportJob: vi.fn(),
  downloadExportJob: vi.fn(),
  getEventReport: vi.fn(),
  listExportJobs: vi.fn(),
}));

vi.mock("../lib/api", () => api);

const report: EventReport = {
  eventId,
  generatedAt: "2026-09-16T09:00:00.000Z",
  invitationGroups: {
    active: 12,
    cancelled: 1,
    withInitialInvitation: 9,
    withoutInitialInvitation: 3,
  },
  namedGuests: 28,
  expectedAttendance: 34,
  rsvp: {
    acceptedGroups: 6,
    partiallyAcceptedGroups: 2,
    declinedGroups: 1,
    pendingGroups: 3,
  },
  invitationTypes: {
    singleGroups: 5,
    namedGroupGroups: 4,
    primaryWithCompanionsGroups: 3,
  },
  delivery: {
    latestInvitationMessages: 9,
    notSentGroups: 3,
    byStatus: {
      queued: 0,
      sending: 0,
      sent: 1,
      delivered: 5,
      read: 2,
      responded: 1,
      failed: 0,
      cancelled: 0,
    },
  },
  checkIn: {
    checkedInGroups: 4,
    checkedInAttendees: 11,
    notArrivedAttendees: 23,
    noShowAttendees: null,
  },
};

const completedExport: ExportJob = {
  id: exportJobId,
  eventId,
  format: "XLSX",
  preset: "FULL_GUEST_LIST",
  status: "COMPLETED",
  rowCount: 34,
  output: {
    filename: "guest-export.xlsx",
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    byteSize: 2048,
    sha256: "a".repeat(64),
    downloadUrl: `/api/v1/events/${eventId}/exports/${exportJobId}/download?expires=1&signature=${"b".repeat(64)}`,
  },
  failureCode: null,
  failureMessage: null,
  requestedAt: "2026-09-16T09:01:00.000Z",
  processingAt: "2026-09-16T09:01:05.000Z",
  completedAt: "2026-09-16T09:01:30.000Z",
  failedAt: null,
  expiresAt: "2026-09-23T09:01:30.000Z",
};

function exportList(items: ExportJob[]): ListExportJobsResponse {
  return {
    items,
    pagination: {
      page: 1,
      pageSize: 20,
      totalItems: items.length,
      totalPages: 1,
    },
  };
}

function renderReports() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <EventReports
        common={en.common}
        copy={en.reports}
        eventId={eventId}
        locale="en"
        supabase={null}
      />
    </QueryClientProvider>,
  );
}

describe("event reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getEventReport.mockResolvedValue(report);
    api.listExportJobs.mockResolvedValue(exportList([]));
    api.createExportJob.mockResolvedValue({
      ...completedExport,
      status: "QUEUED",
      output: null,
      rowCount: null,
    });
  });

  it("shows reconciled server totals and keeps no-shows pending before completion", async () => {
    renderReports();

    expect(await screen.findByText(en.reports.invitationGroups)).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("28")).toBeTruthy();
    expect(screen.getByText(en.reports.noShowPending)).toBeTruthy();
  });

  it("requests a background export with the chosen scope and format", async () => {
    const user = userEvent.setup();
    renderReports();

    await screen.findByText(en.reports.exportsTitle);
    await user.selectOptions(
      screen.getByLabelText(en.reports.preset),
      "CHECK_IN_LIST",
    );
    await user.selectOptions(screen.getByLabelText(en.reports.format), "CSV");
    await user.click(
      screen.getByRole("button", { name: en.reports.createExport }),
    );

    await waitFor(() => expect(api.createExportJob).toHaveBeenCalledOnce());
    expect(api.createExportJob).toHaveBeenCalledWith(null, eventId, {
      format: "CSV",
      preset: "CHECK_IN_LIST",
    });
    expect(await screen.findByText(en.reports.exportQueued)).toBeTruthy();
  });

  it("offers a secure download only for a completed file", async () => {
    api.listExportJobs.mockResolvedValue(
      exportList([
        completedExport,
        {
          ...completedExport,
          id: "33333333-3333-4333-8333-333333333333",
          status: "PROCESSING",
          output: null,
          rowCount: null,
          completedAt: null,
        },
      ]),
    );
    api.downloadExportJob.mockResolvedValue(new Blob(["rows"]));
    const user = userEvent.setup();
    renderReports();

    const downloads = await screen.findAllByRole("button", {
      name: en.reports.download,
    });
    expect(downloads).toHaveLength(1);
    expect(screen.getByText(en.reports.statusProcessing)).toBeTruthy();

    await user.click(downloads[0]!);
    await waitFor(() => expect(api.downloadExportJob).toHaveBeenCalledOnce());
    expect(api.downloadExportJob).toHaveBeenCalledWith(
      null,
      completedExport.output!.downloadUrl,
    );
  });

  it("explains an expired or failed download instead of failing silently", async () => {
    api.listExportJobs.mockResolvedValue(exportList([completedExport]));
    api.downloadExportJob.mockRejectedValue(new Error("expired"));
    const user = userEvent.setup();
    renderReports();

    await user.click(
      await screen.findByRole("button", { name: en.reports.download }),
    );

    expect(await screen.findByText(en.reports.downloadError)).toBeTruthy();
  });

  it("shows an empty state until the first file is requested", async () => {
    renderReports();

    expect(await screen.findByText(en.reports.noExportsTitle)).toBeTruthy();
  });
});
