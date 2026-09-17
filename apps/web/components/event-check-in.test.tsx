import "../test/setup";
import type {
  CheckInDashboard,
  CheckInParty,
  CheckInResult,
} from "@dawah/api-contract";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "../i18n/dictionaries/en";
import { EventCheckIn } from "./event-check-in";

const eventId = "11111111-1111-4111-8111-111111111111";
const invitationGroupId = "22222222-2222-4222-8222-222222222222";
const recordId = "33333333-3333-4333-8333-333333333333";
const token = `ep1.${"a".repeat(22)}.${"b".repeat(43)}`;

const api = vi.hoisted(() => {
  class ApiClientError extends Error {
    public constructor(
      public readonly code: string,
      message: string,
      public readonly status: number,
    ) {
      super(message);
    }
  }
  return {
    ApiClientError,
    createCheckIn: vi.fn(),
    getCheckInDashboard: vi.fn(),
    resolveEntryPass: vi.fn(),
    searchCheckInParties: vi.fn(),
  };
});

vi.mock("../lib/api", () => api);

const party: CheckInParty = {
  invitationGroupId,
  displayName: "Al Shammari family",
  phoneDisplay: "+966••••••1111",
  phoneMasked: true,
  confirmedAttendance: 4,
  checkedInAttendance: 1,
  remainingAttendance: 3,
  status: "PARTIALLY_CHECKED_IN",
  firstCheckedInAt: "2026-09-16T18:05:00.000Z",
  lastCheckedInAt: "2026-09-16T18:05:00.000Z",
  lastCheckedInBy: "Host",
  lastDeviceId: null,
};

const dashboard: CheckInDashboard = {
  eventId,
  expectedAttendance: 20,
  checkedInAttendance: 8,
  remainingAttendance: 12,
  checkInPercentage: 40,
  invitationGroups: 6,
  fullyCheckedInGroups: 2,
  partiallyCheckedInGroups: 1,
  notArrivedGroups: 3,
  duplicateAttempts: 1,
  recentArrivals: [
    {
      recordId,
      invitationGroupId,
      displayName: "Al Shammari family",
      attendeeCount: 1,
      checkedInAttendance: 1,
      confirmedAttendance: 4,
      source: "QR",
      checkedInAt: "2026-09-16T18:05:00.000Z",
      checkedInBy: "Host",
      deviceId: null,
    },
  ],
  calculatedAt: "2026-09-16T18:10:00.000Z",
};

const partialResult: CheckInResult = {
  outcome: "PARTIALLY_CHECKED_IN",
  invitationGroupId,
  displayName: "Al Shammari family",
  confirmedAttendance: 4,
  previousCheckedInAttendance: 1,
  checkedInAttendance: 3,
  remainingAttendance: 1,
  incrementedBy: 2,
  checkedInAt: "2026-09-16T18:11:00.000Z",
  checkedInBy: "Host",
  deviceId: null,
  recordId,
  idempotentReplay: false,
};

function renderCheckIn() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <EventCheckIn
        common={en.common}
        copy={en.checkIn}
        eventId={eventId}
        locale="en"
        supabase={null}
      />
    </QueryClientProvider>,
  );
}

describe("event check-in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getCheckInDashboard.mockResolvedValue(dashboard);
    api.searchCheckInParties.mockResolvedValue({ items: [party] });
    api.resolveEntryPass.mockResolvedValue({
      ...party,
      resolvedAt: "2026-09-16T18:10:30.000Z",
    });
    api.createCheckIn.mockResolvedValue(partialResult);
  });

  it("shows arrival totals and recent arrivals from the server", async () => {
    renderCheckIn();

    expect(await screen.findByText(en.checkIn.arrived)).toBeTruthy();
    expect(screen.getByText("8")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("Al Shammari family")).toBeTruthy();
  });

  it("explains that check-in is unavailable instead of showing an empty board", async () => {
    api.getCheckInDashboard.mockRejectedValue(
      new api.ApiClientError("CHECK_IN_EVENT_NOT_ACTIVE", "not event day", 409),
    );
    renderCheckIn();

    expect(await screen.findByText(en.checkIn.disabledTitle)).toBeTruthy();
    expect(screen.queryByText(en.checkIn.scanTitle)).toBeNull();
  });

  it("falls back to manual token entry when no barcode reader exists", async () => {
    const user = userEvent.setup();
    renderCheckIn();

    expect(await screen.findByText(en.checkIn.cameraUnavailable)).toBeTruthy();
    await user.type(screen.getByLabelText(en.checkIn.tokenLabel), token);
    await user.click(screen.getByRole("button", { name: en.checkIn.resolve }));

    await waitFor(() => expect(api.resolveEntryPass).toHaveBeenCalledOnce());
    expect(api.resolveEntryPass).toHaveBeenCalledWith(null, eventId, { token });
  });

  it("confirms an arrival bounded by the remaining attendance", async () => {
    const user = userEvent.setup();
    renderCheckIn();

    await user.type(screen.getByLabelText(en.checkIn.searchLabel), "Shammari");
    await user.click(screen.getByRole("button", { name: en.checkIn.search }));
    await user.click(
      await screen.findByRole("button", {
        name: en.checkIn.selectParty.replace("{name}", party.displayName),
      }),
    );

    const attendees = await screen.findByLabelText(en.checkIn.attendeeCount);
    // The form opens on the remaining attendance and never offers more.
    expect(attendees.getAttribute("value")).toBe("3");
    await user.type(attendees, "9");
    expect(attendees.getAttribute("value")).toBe("3");
    await user.click(
      screen.getByRole("button", { name: en.checkIn.confirmAction }),
    );

    await waitFor(() => expect(api.createCheckIn).toHaveBeenCalledOnce());
    expect(api.createCheckIn).toHaveBeenCalledWith(
      null,
      eventId,
      { attendeeCount: 3, invitationGroupId, source: "MANUAL" },
      expect.stringContaining("check-in-"),
    );
    expect(await screen.findByText(en.checkIn.partialSuccess)).toBeTruthy();
  });

  it("reports a duplicate scan without claiming new attendance", async () => {
    api.createCheckIn.mockResolvedValue({
      ...partialResult,
      outcome: "ALREADY_CHECKED_IN",
      previousCheckedInAttendance: 4,
      checkedInAttendance: 4,
      remainingAttendance: 0,
      incrementedBy: 0,
      recordId: null,
    });
    const user = userEvent.setup();
    renderCheckIn();

    await user.type(screen.getByLabelText(en.checkIn.searchLabel), "Shammari");
    await user.click(screen.getByRole("button", { name: en.checkIn.search }));
    await user.click(
      await screen.findByRole("button", {
        name: en.checkIn.selectParty.replace("{name}", party.displayName),
      }),
    );
    await user.click(
      screen.getByRole("button", { name: en.checkIn.confirmAction }),
    );

    expect(await screen.findByText(en.checkIn.alreadyCheckedIn)).toBeTruthy();
  });

  it("surfaces a failed check-in instead of assuming success", async () => {
    api.createCheckIn.mockRejectedValue(new Error("conflict"));
    const user = userEvent.setup();
    renderCheckIn();

    await user.type(screen.getByLabelText(en.checkIn.searchLabel), "Shammari");
    await user.click(screen.getByRole("button", { name: en.checkIn.search }));
    await user.click(
      await screen.findByRole("button", {
        name: en.checkIn.selectParty.replace("{name}", party.displayName),
      }),
    );
    await user.click(
      screen.getByRole("button", { name: en.checkIn.confirmAction }),
    );

    expect(await screen.findByText(en.checkIn.checkInError)).toBeTruthy();
    expect(screen.queryByText(en.checkIn.completeSuccess)).toBeNull();
  });
});
