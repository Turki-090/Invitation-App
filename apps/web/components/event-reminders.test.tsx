import "../test/setup";
import type {
  InvitationTemplate,
  ListReminderRunsResponse,
  ReminderReadinessResponse,
  ReminderRun,
} from "@dawah/api-contract";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "../i18n/dictionaries/en";
import { EventReminders } from "./event-reminders";

const eventId = "11111111-1111-4111-8111-111111111111";
const templateId = "22222222-2222-4222-8222-222222222222";
const invitationId = "33333333-3333-4333-8333-333333333333";

const api = vi.hoisted(() => ({
  approveInvitationTemplate: vi.fn(),
  createInvitationTemplate: vi.fn(),
  createPreparationSnapshots: vi.fn(),
  createReminderRule: vi.fn(),
  getReminderReadiness: vi.fn(),
  listInvitationTemplates: vi.fn(),
  listReminderRules: vi.fn(),
  listReminderRuns: vi.fn(),
  sendReminders: vi.fn(),
  updateReminderRule: vi.fn(),
}));

vi.mock("../lib/api", () => api);

const template: InvitationTemplate = {
  approvedAt: "2026-09-13T08:00:00.000Z",
  archivedAt: null,
  assetChecksumSha256: null,
  assetId: null,
  body: "Hello {{guest_name}}",
  createdAt: "2026-09-13T07:00:00.000Z",
  eventId,
  extraMessage: null,
  id: templateId,
  locale: "en",
  name: "Pending RSVP reminder",
  purpose: "REMINDER",
  providerTemplateName: "pending_rsvp_reminder",
  status: "APPROVED",
  updatedAt: "2026-09-13T08:00:00.000Z",
  variableKeys: ["guest_name"],
  version: 1,
};

const draftTemplate: InvitationTemplate = {
  ...template,
  approvedAt: null,
  name: "Gentle reminder",
  status: "DRAFT",
};

const readiness: ReminderReadinessResponse = {
  audience: "ALL_PENDING",
  confirmationToken: "a".repeat(64),
  cooldownHours: 72,
  eligibleInvitationIds: [invitationId, crypto.randomUUID()],
  excluded: [
    {
      invitationId: crypto.randomUUID(),
      nextEligibleAt: "2026-09-16T08:00:00.000Z",
      reasonCodes: ["COOLDOWN_ACTIVE"],
    },
  ],
  expiresAt: "2026-09-13T08:05:00.000Z",
  summary: {
    selectedInvitations: 3,
    eligibleInvitations: 2,
    excludedInvitations: 1,
    recentlyRemindedInvitations: 1,
    estimatedCreditUnits: 2,
  },
  template: { id: templateId, displayName: template.name, locale: "en" },
};

const run: ReminderRun = {
  completedAt: null,
  cooldownHours: 72,
  createdAt: "2026-09-13T08:01:00.000Z",
  eligibleCount: 2,
  evaluatedAt: "2026-09-13T08:01:00.000Z",
  eventId,
  excludedCount: 1,
  id: "44444444-4444-4444-8444-444444444444",
  progress: {
    cancelled: 0,
    completed: 0,
    delivered: 0,
    failed: 0,
    queued: 2,
    read: 0,
    responded: 0,
    sending: 0,
    sent: 0,
  },
  ruleId: null,
  selectedCount: 3,
  sendBatchId: "55555555-5555-4555-8555-555555555555",
  source: "MANUAL",
  status: "QUEUED",
};

const runs: ListReminderRunsResponse = {
  items: [],
  pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
};

function renderReminders() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <EventReminders
        common={en.common}
        copy={en.reminders}
        eventId={eventId}
        locale="en"
        supabase={null}
      />
    </QueryClientProvider>,
  );
}

describe("event reminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listInvitationTemplates.mockResolvedValue([template]);
    api.getReminderReadiness.mockResolvedValue(readiness);
    api.listReminderRules.mockResolvedValue([]);
    api.listReminderRuns.mockResolvedValue(runs);
    api.sendReminders.mockResolvedValue(run);
    api.createInvitationTemplate.mockResolvedValue(draftTemplate);
    api.approveInvitationTemplate.mockResolvedValue(template);
    api.createPreparationSnapshots.mockResolvedValue({
      blockedCount: 0,
      blockedInvitationIds: [],
      createdCount: 2,
      reusedCount: 1,
      snapshotIds: [crypto.randomUUID(), crypto.randomUUID()],
      templateId,
    });
  });

  it("shows explainable cooldown exclusions and confirms an idempotent send", async () => {
    const user = userEvent.setup();
    renderReminders();

    expect(
      await screen.findByText("Recently reminded and excluded: 1"),
    ).toBeTruthy();
    expect(screen.getByText(en.reminders.reasonCooldownActive)).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: en.reminders.reviewSend }),
    );
    expect(
      await screen.findByRole("heading", {
        name: "Confirm reminder batch (2 eligible)?",
      }),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: en.reminders.sendAction }),
    );

    await waitFor(() => expect(api.sendReminders).toHaveBeenCalledOnce());
    expect(api.sendReminders.mock.calls[0]?.slice(0, 3)).toEqual([
      null,
      eventId,
      {
        audience: "ALL_PENDING",
        confirmationToken: readiness.confirmationToken,
        cooldownHours: 72,
        templateId,
      },
    ]);
    expect(api.sendReminders.mock.calls[0]?.[3]).toEqual(expect.any(String));
    expect(
      await screen.findByText("Reminder batch queued · 2 eligible"),
    ).toBeTruthy();
  });

  it("creates, approves, and prepares a reminder template from an empty state", async () => {
    api.listInvitationTemplates
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([draftTemplate])
      .mockResolvedValue([template]);
    const user = userEvent.setup();
    renderReminders();

    expect(await screen.findByText(en.reminders.noTemplateTitle)).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: en.reminders.newTemplate }),
    );
    await user.type(
      screen.getByRole("textbox", {
        name: new RegExp(en.reminders.templateName),
      }),
      "Gentle reminder",
    );
    await user.type(
      screen.getByRole("textbox", {
        name: new RegExp(en.reminders.providerTemplateName),
      }),
      "wedding_rsvp_reminder",
    );
    await user.click(
      screen.getByRole("button", { name: en.reminders.createTemplate }),
    );

    await waitFor(() =>
      expect(api.createInvitationTemplate).toHaveBeenCalledWith(
        null,
        eventId,
        expect.objectContaining({
          name: "Gentle reminder",
          providerTemplateName: "wedding_rsvp_reminder",
          purpose: "REMINDER",
        }),
      ),
    );
    await user.click(
      await screen.findByRole("button", {
        name: en.reminders.approveTemplate,
      }),
    );
    await waitFor(() =>
      expect(api.approveInvitationTemplate).toHaveBeenCalledWith(
        null,
        eventId,
        draftTemplate.id,
        draftTemplate.version,
      ),
    );
    await user.click(
      await screen.findByRole("button", {
        name: en.reminders.prepareTemplate,
      }),
    );
    await waitFor(() =>
      expect(api.createPreparationSnapshots).toHaveBeenCalledWith(
        null,
        eventId,
        { templateId },
      ),
    );
    expect(
      await screen.findByText("Current reminder content prepared for 3 groups"),
    ).toBeTruthy();
  });
});
