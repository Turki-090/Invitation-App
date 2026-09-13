import "../test/setup";
import type { AcceptTeamInvitationResult } from "@dawah/api-contract";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import en from "../i18n/dictionaries/en";
import { TeamInvitationAcceptance } from "./team-invitation-acceptance";

const eventId = "11111111-1111-4111-8111-111111111111";
const token = "a".repeat(43);

const api = vi.hoisted(() => ({
  acceptTeamInvitation: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  ...api,
  developmentAuthBypassEnabled: true,
}));
vi.mock("../lib/supabase", () => ({ getSupabaseClient: () => null }));
vi.mock("./locale-switcher", () => ({ LocaleSwitcher: () => null }));

const accepted: AcceptTeamInvitationResult = {
  alreadyAccepted: false,
  eventId,
  membership: {
    acceptedAt: "2026-09-13T08:00:00.000Z",
    configuredPermissions: ["event.view", "reminder.send"],
    createdAt: "2026-09-13T08:00:00.000Z",
    displayName: "Co-host",
    effectivePermissions: ["event.view", "reminder.send"],
    email: null,
    id: "22222222-2222-4222-8222-222222222222",
    invitedByUserId: "33333333-3333-4333-8333-333333333333",
    permissionMode: "CUSTOM",
    revokedAt: null,
    role: "CO_HOST",
    status: "ACTIVE",
    userId: "44444444-4444-4444-8444-444444444444",
  },
};

describe("team invitation acceptance", () => {
  it("accepts the opaque token and opens the event returned by the server", async () => {
    api.acceptTeamInvitation.mockResolvedValueOnce(accepted);
    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <TeamInvitationAcceptance
          common={en.common}
          copy={en.teamInvitation}
          locale="en"
          token={token}
        />
      </QueryClientProvider>,
    );

    await user.click(
      screen.getByRole("button", { name: en.teamInvitation.accept }),
    );
    await waitFor(() =>
      expect(api.acceptTeamInvitation).toHaveBeenCalledWith(null, token),
    );
    expect(
      await screen.findByRole("heading", {
        name: en.teamInvitation.acceptedTitle,
      }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: en.teamInvitation.openEvent })
        .getAttribute("href"),
    ).toBe(`/en/events/${eventId}`);
  });
});
