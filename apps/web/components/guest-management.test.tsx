import "../test/setup";
import type {
  InvitationDetail,
  InvitationListResponse,
} from "@dawah/api-contract";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "../i18n/dictionaries/en";
import { GuestManagement } from "./guest-management";

const eventId = "11111111-1111-4111-8111-111111111111";
const invitationId = "22222222-2222-4222-8222-222222222222";

const api = vi.hoisted(() => ({
  bulkCancelInvitations: vi.fn(),
  cancelInvitation: vi.fn(),
  createInvitation: vi.fn(),
  getInvitation: vi.fn(),
  listInvitations: vi.fn(),
  updateInvitation: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  ...api,
  ApiClientError: class ApiClientError extends Error {},
}));

const invitation: InvitationDetail = {
  id: invitationId,
  eventId,
  displayName: "Sarah Al-Qahtani",
  contactName: "Sarah Al-Qahtani",
  phoneE164: "+966501234567",
  phoneMasked: "+966•••••4567",
  phoneCountry: "SA",
  phoneIsMasked: false,
  invitationType: "SINGLE",
  namedGuestCount: 1,
  maxCompanions: 0,
  maximumAttendees: 1,
  rsvpStatus: "PENDING",
  expectedAttendees: 0,
  internalNote: null,
  members: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      name: "Sarah Al-Qahtani",
      position: 1,
      isPrimary: true,
    },
  ],
  cancelledAt: null,
  createdAt: "2026-09-08T00:00:00.000Z",
  updatedAt: "2026-09-08T00:00:00.000Z",
};

const listResponse: InvitationListResponse = {
  items: [invitation],
  totals: {
    invitationGroups: 125,
    namedGuests: 180,
    expectedAttendees: 92,
  },
  pagination: { page: 1, pageSize: 25, totalItems: 125, totalPages: 5 },
};

const emptyResponse: InvitationListResponse = {
  items: [],
  totals: { invitationGroups: 0, namedGuests: 0, expectedAttendees: 0 },
  pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
};

function renderGuests() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { gcTime: 0, retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <GuestManagement
        common={en.common}
        copy={en.guests}
        eventId={eventId}
        locale="en"
        supabase={null}
      />
    </QueryClientProvider>,
  );
}

async function openCreateDrawer() {
  await userEvent
    .setup()
    .click(
      await screen.findByRole("button", { name: en.guests.addInvitation }),
    );
  return screen.findByRole("dialog", { name: en.guests.addTitle });
}

describe("guest management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listInvitations.mockResolvedValue(listResponse);
    api.getInvitation.mockResolvedValue(invitation);
    api.createInvitation.mockResolvedValue(invitation);
    api.updateInvitation.mockResolvedValue(invitation);
    api.cancelInvitation.mockResolvedValue({
      ...invitation,
      cancelledAt: "2026-09-08T01:00:00.000Z",
    });
    api.bulkCancelInvitations.mockResolvedValue({
      requestedCount: 1,
      cancelledCount: 1,
      alreadyCancelledCount: 0,
      cancelledIds: [invitationId],
      alreadyCancelledIds: [],
    });
  });

  it("queries, filters, pages, selects, and bulk-cancels invitation groups", async () => {
    const user = userEvent.setup();
    renderGuests();

    expect(await screen.findAllByText("Sarah Al-Qahtani")).not.toHaveLength(0);
    expect(screen.getByText("125")).toBeTruthy();
    expect(api.listInvitations).toHaveBeenCalledWith(
      null,
      eventId,
      expect.objectContaining({
        page: 1,
        pageSize: 25,
        cancellationStatus: "ACTIVE",
        sortBy: "CREATED_AT",
        sortOrder: "DESC",
      }),
    );

    await user.type(
      screen.getByRole("textbox", { name: en.guests.searchLabel }),
      "Sarah",
    );
    await user.click(
      screen.getByRole("button", { name: en.guests.searchAction }),
    );
    await waitFor(() =>
      expect(api.listInvitations).toHaveBeenLastCalledWith(
        null,
        eventId,
        expect.objectContaining({ search: "Sarah" }),
      ),
    );

    await user.selectOptions(
      screen.getByLabelText(en.guests.filterType),
      "SINGLE",
    );
    await user.click(screen.getByRole("tab", { name: en.guests.accepted }));
    await user.selectOptions(
      screen.getByLabelText(en.guests.sortLabel),
      "EXPECTED",
    );
    await waitFor(() =>
      expect(api.listInvitations).toHaveBeenLastCalledWith(
        null,
        eventId,
        expect.objectContaining({
          invitationType: "SINGLE",
          rsvpStatus: "ACCEPTED",
          sortBy: "EXPECTED_ATTENDEES",
          sortOrder: "DESC",
        }),
      ),
    );

    await user.click(
      screen.getAllByLabelText("Select invitation for Sarah Al-Qahtani")[0]!,
    );
    await user.click(
      screen.getByRole("button", { name: en.guests.cancelSelected }),
    );
    await user.click(
      await screen.findByRole("button", { name: en.guests.confirmCancel }),
    );

    await waitFor(() =>
      expect(api.bulkCancelInvitations).toHaveBeenCalledWith(null, eventId, {
        invitationIds: [invitationId],
      }),
    );
  });

  it("requires every visible named member and submits named-group and companion structures", async () => {
    const user = userEvent.setup();
    renderGuests();
    await openCreateDrawer();

    await user.click(
      screen.getByRole("radio", { name: /Named group \/ family/ }),
    );
    await user.type(
      screen.getByLabelText(new RegExp(en.guests.displayName)),
      "Al-Dosari family",
    );
    await user.type(
      screen.getByLabelText(new RegExp(en.guests.contactName)),
      "Maha Al-Dosari",
    );
    await user.type(
      screen.getByPlaceholderText(en.guests.phonePlaceholder),
      "501234567",
    );
    await user.type(screen.getByLabelText("Member 1 name"), "Maha Al-Dosari");
    await user.click(screen.getByRole("button", { name: en.guests.addMember }));
    await user.click(screen.getByRole("button", { name: en.guests.create }));

    expect(
      await screen.findAllByText(en.guests.memberRequiredError),
    ).toHaveLength(1);
    expect(api.createInvitation).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Member 2 name"), "Layan Al-Dosari");
    await user.click(screen.getByRole("button", { name: en.guests.create }));
    await waitFor(() => expect(api.createInvitation).toHaveBeenCalledOnce());
    expect(api.createInvitation.mock.calls[0]?.[2]).toMatchObject({
      displayName: "Al-Dosari family",
      contactName: "Maha Al-Dosari",
      invitationType: "NAMED_GROUP",
      maxCompanions: 0,
      members: [
        { name: "Maha Al-Dosari", isPrimary: false },
        { name: "Layan Al-Dosari", isPrimary: false },
      ],
    });

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: en.guests.addTitle }),
      ).toBeNull(),
    );
    await user.click(
      screen.getByRole("button", { name: en.guests.addInvitation }),
    );
    await user.click(
      screen.getByRole("radio", { name: /Person \+ companions/ }),
    );
    await user.type(
      screen.getByLabelText(new RegExp(en.guests.displayName)),
      "Omar Al-Harbi",
    );
    await user.type(
      screen.getByPlaceholderText(en.guests.phonePlaceholder),
      "551234567",
    );
    await user.click(
      screen.getByRole("button", { name: en.guests.stepperIncrease }),
    );
    await user.click(
      screen.getByRole("button", { name: en.guests.stepperIncrease }),
    );
    await user.click(screen.getByRole("button", { name: en.guests.create }));

    await waitFor(() => expect(api.createInvitation).toHaveBeenCalledTimes(2));
    expect(api.createInvitation.mock.calls[1]?.[2]).toMatchObject({
      displayName: "Omar Al-Harbi",
      contactName: "Omar Al-Harbi",
      invitationType: "PRIMARY_WITH_COMPANIONS",
      maxCompanions: 2,
      members: [{ name: "Omar Al-Harbi", isPrimary: true }],
    });
  });

  it("requires an explicit duplicate override before creating a separate invitation", async () => {
    const user = userEvent.setup();
    api.createInvitation
      .mockRejectedValueOnce({
        code: "DUPLICATE_PHONE_REQUIRES_OVERRIDE",
        details: {
          duplicateCount: 1,
          duplicates: [
            {
              id: invitationId,
              displayName: invitation.displayName,
              phoneMasked: invitation.phoneMasked,
            },
          ],
          overrideRequired: true,
        },
      })
      .mockResolvedValueOnce(invitation);
    renderGuests();
    await openCreateDrawer();

    await user.type(
      screen.getByLabelText(new RegExp(en.guests.displayName)),
      "Noura Al-Otaibi",
    );
    await user.type(
      screen.getByPlaceholderText(en.guests.phonePlaceholder),
      "501234567",
    );
    await user.click(screen.getByRole("button", { name: en.guests.create }));

    expect(await screen.findByText(en.guests.duplicateTitle)).toBeTruthy();
    expect(screen.getAllByText(/Sarah Al-Qahtani/)).not.toHaveLength(0);
    await user.click(
      screen.getByRole("button", { name: en.guests.duplicateOverride }),
    );

    await waitFor(() => expect(api.createInvitation).toHaveBeenCalledTimes(2));
    expect(api.createInvitation.mock.calls[0]?.[2]).toMatchObject({
      duplicateOverride: false,
    });
    expect(api.createInvitation.mock.calls[1]?.[2]).toMatchObject({
      duplicateOverride: true,
    });
  });

  it("opens detail, saves a note-only edit, and cancels through the single endpoint", async () => {
    const user = userEvent.setup();
    const international = {
      ...invitation,
      phoneE164: "+12025550123",
      phoneMasked: "+1••••••0123",
      phoneCountry: "US",
    } satisfies InvitationDetail;
    api.getInvitation.mockResolvedValue(international);
    api.updateInvitation.mockResolvedValue(international);
    renderGuests();

    await user.click(
      (
        await screen.findAllByRole("button", {
          name: "Open invitation details for Sarah Al-Qahtani",
        })
      )[0]!,
    );
    await user.click(
      await screen.findByRole("button", { name: en.guests.edit }),
    );
    await user.type(screen.getByLabelText(en.guests.internalNote), "VIP table");
    await user.click(screen.getByRole("button", { name: en.guests.update }));

    await waitFor(() => expect(api.updateInvitation).toHaveBeenCalledOnce());
    expect(api.updateInvitation.mock.calls[0]?.[2]).toBe(invitationId);
    expect(api.updateInvitation.mock.calls[0]?.[3]).toEqual({
      duplicateOverride: false,
      internalNote: "VIP table",
    });

    await user.click(
      screen.getAllByRole("button", {
        name: "Open invitation details for Sarah Al-Qahtani",
      })[0]!,
    );
    await user.click(
      await screen.findByRole("button", { name: en.guests.cancelInvitation }),
    );
    await user.click(
      await screen.findByRole("button", { name: en.guests.confirmCancel }),
    );
    await waitFor(() =>
      expect(api.cancelInvitation).toHaveBeenCalledWith(
        null,
        eventId,
        invitationId,
      ),
    );
  });

  it("renders recoverable error and empty list states", async () => {
    api.listInvitations.mockRejectedValue(new Error("offline"));
    renderGuests();

    expect(await screen.findByText(en.guests.loadErrorTitle)).toBeTruthy();
    expect(
      await screen.findByRole("button", { name: en.guests.retry }),
    ).toBeTruthy();

    api.listInvitations.mockReset();
    api.listInvitations.mockResolvedValue(emptyResponse);
    renderGuests();
    expect(await screen.findAllByText(en.guests.emptyTitle)).not.toHaveLength(
      0,
    );
  });
});
