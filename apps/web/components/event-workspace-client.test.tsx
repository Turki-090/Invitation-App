import "../test/setup";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventDetail, EventSummary } from "@dawah/api-contract";
import en from "../i18n/dictionaries/en";
import { EventWorkspaceClient } from "./event-workspace-client";

const eventId = "11111111-1111-4111-8111-111111111111";
const secondEventId = "22222222-2222-4222-8222-222222222222";

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

const api = vi.hoisted(() => ({
  archiveEvent: vi.fn(),
  getEvent: vi.fn(),
  getEventDashboard: vi.fn(),
  listEvents: vi.fn(),
  transitionEventStatus: vi.fn(),
  updateEvent: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => `/en/events/${eventId}`,
  useRouter: () => router,
}));

vi.mock("next/link", async () => {
  const react = await import("react");
  return {
    default: ({
      children,
      href,
      ...props
    }: {
      children: React.ReactNode;
      href: string;
      [key: string]: unknown;
    }) => react.createElement("a", { ...props, href }, children),
  };
});

vi.mock("./locale-switcher", () => ({
  LocaleSwitcher: () => null,
}));

vi.mock("../lib/supabase", () => ({
  getSupabaseClient: () => null,
}));

vi.mock("../lib/api", () => ({
  ...api,
  developmentAuthBypassEnabled: true,
}));

const event: EventDetail = {
  id: eventId,
  nameAr: "زواج خالد ونورة",
  nameEn: "Khalid & Nora Wedding",
  eventType: "WEDDING",
  eventDate: "2027-04-18",
  startTime: "20:00",
  endTime: "23:30",
  timezone: "Asia/Riyadh",
  venueNameAr: "قاعة الماسة",
  venueNameEn: "Al Masa Hall",
  city: "Riyadh",
  latitude: null,
  longitude: null,
  mapUrl: "https://maps.app.goo.gl/example",
  rsvpDeadline: "2027-04-10",
  allowRsvpEdits: true,
  qrEnabled: false,
  status: "DRAFT",
  role: "OWNER",
  availableTransitions: ["ACTIVE"],
  createdAt: "2026-09-07T00:00:00.000Z",
  updatedAt: "2026-09-07T00:00:00.000Z",
  archivedAt: null,
};

const secondEvent: EventSummary = {
  id: secondEventId,
  nameAr: "حفل التخرج",
  nameEn: "Graduation",
  eventType: "GRADUATION",
  eventDate: "2027-06-01",
  timezone: "Asia/Riyadh",
  venueNameAr: "قاعة الجامعة",
  venueNameEn: "University Hall",
  city: "Riyadh",
  status: "ACTIVE",
  role: "OWNER",
};

function renderWorkspace(section: "overview" | "settings") {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <EventWorkspaceClient
        common={en.common}
        copy={en.workspace}
        eventId={eventId}
        eventsCopy={en.events}
        locale="en"
        section={section}
        shellCopy={en.shell}
      />
    </QueryClientProvider>,
  );
}

describe("event workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getEvent.mockResolvedValue(event);
    api.getEventDashboard.mockResolvedValue({
      eventId,
      invitationGroups: 12,
      namedGuests: 19,
      expectedAttendees: 24,
      rsvp: {
        acceptedGroups: 5,
        partialGroups: 2,
        declinedGroups: 1,
        pendingGroups: 4,
      },
    });
    api.listEvents.mockResolvedValue([event, secondEvent]);
    api.transitionEventStatus.mockResolvedValue({
      ...event,
      status: "ACTIVE",
      availableTransitions: ["RSVP_OPEN", "EVENT_DAY", "COMPLETED"],
    });
    api.updateEvent.mockResolvedValue(event);
    api.archiveEvent.mockResolvedValue({
      ...event,
      status: "ARCHIVED",
      availableTransitions: [],
      archivedAt: "2026-09-07T01:00:00.000Z",
    });
  });

  it("renders real aggregates, localized details, event switching, and lifecycle actions", async () => {
    const user = userEvent.setup();
    renderWorkspace("overview");

    expect(
      await screen.findByRole("heading", { name: event.nameEn ?? "" }),
    ).toBeTruthy();
    expect(screen.getByText(en.workspace.invitationGroups)).toBeTruthy();
    expect(screen.getByText(en.workspace.namedGuests)).toBeTruthy();
    expect(screen.getByText(en.workspace.expectedAttendees)).toBeTruthy();
    expect(screen.getAllByText(/Al Masa Hall, Riyadh/).length).toBeGreaterThan(
      0,
    );
    expect(
      screen
        .getByRole("link", { name: en.workspace.openMap })
        .getAttribute("href"),
    ).toBe(event.mapUrl);

    await user.selectOptions(
      screen.getByLabelText(en.workspace.switchEvent),
      secondEventId,
    );
    expect(router.push).toHaveBeenCalledWith(`/en/events/${secondEventId}`);

    await user.click(
      screen.getByRole("button", { name: en.events.statusActive }),
    );
    await waitFor(() =>
      expect(api.transitionEventStatus).toHaveBeenCalledWith(
        null,
        eventId,
        "ACTIVE",
      ),
    );
  });

  it("saves settings and archives through confirmed owner actions", async () => {
    const user = userEvent.setup();
    renderWorkspace("settings");

    const name = await screen.findByLabelText(new RegExp(en.events.nameAr));
    await user.clear(name);
    await user.type(name, "زواج خالد ونورة المحدث");
    await user.click(
      screen.getByRole("button", { name: en.workspace.saveChanges }),
    );

    await waitFor(() => expect(api.updateEvent).toHaveBeenCalledOnce());
    expect(api.updateEvent.mock.calls[0]?.[1]).toBe(eventId);
    expect(api.updateEvent.mock.calls[0]?.[2]).toMatchObject({
      nameAr: "زواج خالد ونورة المحدث",
      venueNameEn: "Al Masa Hall",
      allowRsvpEdits: true,
      qrEnabled: false,
    });
    expect(await screen.findByText(en.workspace.saved)).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: en.workspace.archive }),
    );
    await user.click(
      await screen.findByRole("button", {
        name: en.workspace.archiveConfirm,
      }),
    );

    await waitFor(() =>
      expect(api.archiveEvent).toHaveBeenCalledWith(null, eventId),
    );
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith("/en/events"),
    );
  });
});
