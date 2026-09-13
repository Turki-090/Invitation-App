import "../test/setup";
import type {
  TeamInvitationCredential,
  TeamOverview,
} from "@dawah/api-contract";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "../i18n/dictionaries/en";
import { EventTeam } from "./event-team";

const eventId = "11111111-1111-4111-8111-111111111111";
const ownerId = "22222222-2222-4222-8222-222222222222";
const invitationId = "33333333-3333-4333-8333-333333333333";
const token = "a".repeat(43);

const api = vi.hoisted(() => ({
  createTeamInvitation: vi.fn(),
  getTeamOverview: vi.fn(),
  resendTeamInvitation: vi.fn(),
  revokeTeamInvitation: vi.fn(),
  revokeTeamMember: vi.fn(),
  updateTeamMember: vi.fn(),
}));

vi.mock("../lib/api", () => api);

const team: TeamOverview = {
  eventId,
  invitations: [],
  members: [
    {
      acceptedAt: "2026-09-13T08:00:00.000Z",
      configuredPermissions: [],
      createdAt: "2026-09-13T08:00:00.000Z",
      displayName: "Event owner",
      effectivePermissions: [
        "event.view",
        "event.edit",
        "team.manage",
        "event.delete",
      ],
      email: "owner@example.test",
      id: "44444444-4444-4444-8444-444444444444",
      invitedByUserId: null,
      permissionMode: "DEFAULT",
      revokedAt: null,
      role: "OWNER",
      status: "ACTIVE",
      userId: ownerId,
    },
  ],
};

const credential: TeamInvitationCredential = {
  acceptanceToken: token,
  acceptedAt: null,
  configuredPermissions: [],
  createdAt: "2026-09-13T08:01:00.000Z",
  effectivePermissions: [
    "event.view",
    "guest.view",
    "guest.phone.view",
    "guest.create",
    "guest.edit",
    "invitation.send",
    "invitation.resend",
    "reminder.send",
    "rsvp.edit",
    "reports.view",
  ],
  eventId,
  expiresAt: "2026-09-20T08:01:00.000Z",
  id: invitationId,
  invitedByUserId: ownerId,
  maskedPhone: "+966••••••1111",
  permissionMode: "DEFAULT",
  phoneCountry: "SA",
  revokedAt: null,
  role: "CO_HOST",
  status: "PENDING",
  updatedAt: "2026-09-13T08:01:00.000Z",
};

function renderTeam() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <EventTeam
        common={en.common}
        copy={en.team}
        eventId={eventId}
        locale="en"
        supabase={null}
      />
    </QueryClientProvider>,
  );
}

describe("event team", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getTeamOverview.mockResolvedValue(team);
    api.createTeamInvitation.mockResolvedValue(credential);
  });

  it("creates a phone-bound invitation and exposes its one-time share link", async () => {
    const user = userEvent.setup();
    renderTeam();

    expect(await screen.findByText("Event owner")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: en.team.invite }));
    await user.type(
      screen.getByRole("textbox", { name: new RegExp(en.team.phoneNumber) }),
      "501234567",
    );
    await user.click(screen.getByRole("button", { name: en.team.sendInvite }));

    await waitFor(() =>
      expect(api.createTeamInvitation).toHaveBeenCalledOnce(),
    );
    expect(api.createTeamInvitation).toHaveBeenCalledWith(null, eventId, {
      permissionConfiguration: { mode: "DEFAULT", permissions: [] },
      phoneCountry: "SA",
      phoneNumber: "501234567",
      role: "CO_HOST",
    });
    expect(
      await screen.findByRole("heading", { name: en.team.inviteLinkTitle }),
    ).toBeTruthy();
    const link = screen.getByLabelText(en.team.inviteLinkLabel);
    expect(link.getAttribute("value")).toMatch(
      new RegExp(`/en/team-invitations/${token}$`),
    );

    await user.click(
      screen.getByRole("button", { name: en.team.copyInviteLink }),
    );
    expect(await navigator.clipboard.readText()).toMatch(
      new RegExp(`/en/team-invitations/${token}$`),
    );
  });
});
