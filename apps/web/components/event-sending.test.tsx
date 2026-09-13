import "../test/setup";
import type {
  InvitationTemplate,
  ListSendBatchesResponse,
  SendBatchDetail,
  SendReadinessResponse,
} from "@dawah/api-contract";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ar from "../i18n/dictionaries/ar-SA";
import en from "../i18n/dictionaries/en";
import { EventSending } from "./event-sending";

const eventId = "11111111-1111-4111-8111-111111111111";
const templateId = "22222222-2222-4222-8222-222222222222";
const batchId = "33333333-3333-4333-8333-333333333333";
const messageId = "44444444-4444-4444-8444-444444444444";
const invitationId = "55555555-5555-4555-8555-555555555555";

const api = vi.hoisted(() => ({
  createSendBatch: vi.fn(),
  getResendReadiness: vi.fn(),
  getSendBatch: vi.fn(),
  getSendReadiness: vi.fn(),
  listInvitationTemplates: vi.fn(),
  listSendBatches: vi.fn(),
  resendMessage: vi.fn(),
}));

vi.mock("../lib/api", () => api);

const template: InvitationTemplate = {
  approvedAt: "2026-09-09T10:00:00.000Z",
  archivedAt: null,
  assetChecksumSha256: null,
  assetId: null,
  body: "Hello {{guest_name}}",
  createdAt: "2026-09-09T09:00:00.000Z",
  eventId,
  extraMessage: null,
  id: templateId,
  locale: "en",
  name: "Approved invitation",
  purpose: "INVITATION",
  providerTemplateName: "wedding_invitation_en",
  status: "APPROVED",
  updatedAt: "2026-09-09T10:00:00.000Z",
  variableKeys: ["guest_name"],
  version: 2,
};

const readiness: SendReadinessResponse = {
  alreadySentInvitationIds: [],
  blocked: [
    {
      invitationId: "66666666-6666-4666-8666-666666666666",
      issues: [
        {
          code: "SNAPSHOT_MISSING",
          field: "snapshot",
          message: "Create a current invitation snapshot.",
        },
      ],
    },
  ],
  confirmationToken: "a".repeat(64),
  expiresAt: "2026-09-09T10:05:00.000Z",
  summary: {
    alreadySentInvitations: 0,
    blockedInvitations: 1,
    estimatedCreditUnits: 2,
    readyInvitations: 2,
    selectedInvitations: 3,
  },
  templateId,
};

const batch = {
  completedAt: "2026-09-09T10:01:00.000Z",
  createdAt: "2026-09-09T10:00:00.000Z",
  estimatedCreditUnits: 2,
  eventId,
  id: batchId,
  messageType: "INVITATION" as const,
  progress: {
    cancelled: 0,
    completed: 2,
    delivered: 0,
    failed: 1,
    queued: 0,
    read: 1,
    responded: 0,
    sending: 0,
    sent: 0,
  },
  queuedAt: "2026-09-09T10:00:00.000Z",
  startedAt: "2026-09-09T10:00:01.000Z",
  status: "PARTIALLY_FAILED" as const,
  totalMessages: 2,
};

const batches: ListSendBatchesResponse = {
  items: [batch],
  pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
};

const detail: SendBatchDetail = {
  batch,
  messages: [
    {
      attemptCount: 1,
      canResend: true,
      deliveredAt: null,
      failedAt: "2026-09-09T10:00:05.000Z",
      failureClass: "PERMANENT",
      failureCode: "131026",
      failureReason: "Recipient is not reachable on WhatsApp.",
      id: messageId,
      invitationDisplayName: "Omar family",
      invitationGroupId: invitationId,
      locale: "en",
      maskedPhone: "+966••••••1234",
      providerMessageId: null,
      queuedAt: "2026-09-09T10:00:00.000Z",
      readAt: null,
      sentAt: null,
      status: "FAILED",
    },
  ],
  pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
};

function renderSending(
  dictionary: typeof en = en,
  locale: "ar-SA" | "en" = "en",
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <EventSending
        common={dictionary.common}
        copy={dictionary.sending}
        eventId={eventId}
        locale={locale}
        supabase={null}
      />
    </QueryClientProvider>,
  );
}

describe("event sending center", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listInvitationTemplates.mockResolvedValue([template]);
    api.getSendReadiness.mockResolvedValue(readiness);
    api.listSendBatches.mockResolvedValue(batches);
    api.getSendBatch.mockResolvedValue(detail);
    api.createSendBatch.mockResolvedValue(batch);
    api.getResendReadiness.mockResolvedValue({
      confirmationToken: "b".repeat(64),
      eligible: true,
      estimatedCreditUnits: 1,
      expiresAt: "2026-09-09T10:05:00.000Z",
      invitationGroupId: invitationId,
      messageId,
      reasonCode: null,
      reason: null,
    });
    api.resendMessage.mockResolvedValue({
      ...batch,
      id: "77777777-7777-4777-8777-777777777777",
      status: "QUEUED",
    });
  });

  it("confirms the server readiness summary with an idempotency key", async () => {
    const user = userEvent.setup();
    renderSending();

    const creditLabel = await screen.findByText(en.sending.estimatedCredits);
    const creditCard = creditLabel.closest(".dawah-stat-card");
    expect(creditCard).toBeTruthy();
    expect(within(creditCard as HTMLElement).getByText("2")).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: en.sending.reviewAndSend }),
    );
    await user.click(
      screen.getByRole("button", { name: en.sending.confirmSend }),
    );

    await waitFor(() => expect(api.createSendBatch).toHaveBeenCalledOnce());
    expect(api.createSendBatch.mock.calls[0]?.slice(0, 3)).toEqual([
      null,
      eventId,
      {
        confirmationToken: readiness.confirmationToken,
        templateId,
      },
    ]);
    expect(api.createSendBatch.mock.calls[0]?.[3]).toMatch(/^initial-send:/);
  });

  it("shows actionable failures and revalidates before a one-credit resend", async () => {
    const user = userEvent.setup();
    renderSending();

    const failureActions = await screen.findAllByRole("button", {
      name: "Open failure details for Omar family",
    });
    await user.click(failureActions[0]!);
    expect(
      screen.getAllByText(en.sending.failureReasonRecipientUnavailable).length,
    ).toBeGreaterThan(0);

    await user.click(
      screen.getByRole("button", { name: en.sending.reviewResend }),
    );
    await user.click(
      await screen.findByRole("button", { name: en.sending.confirmResend }),
    );

    await waitFor(() => expect(api.resendMessage).toHaveBeenCalledOnce());
    expect(api.getResendReadiness).toHaveBeenCalledWith(
      null,
      eventId,
      messageId,
    );
    expect(api.resendMessage.mock.calls[0]?.slice(0, 4)).toEqual([
      null,
      eventId,
      messageId,
      { confirmationToken: "b".repeat(64) },
    ]);
    expect(api.resendMessage.mock.calls[0]?.[4]).toMatch(/^resend-/);
  });

  it("pages through every failed message instead of stopping at the first 100", async () => {
    const user = userEvent.setup();
    const secondPageMessage = {
      ...detail.messages[0]!,
      id: "88888888-8888-4888-8888-888888888888",
      invitationDisplayName: "Last failed family",
    };
    api.getSendBatch.mockImplementation(
      (
        _supabase: unknown,
        _eventId: string,
        _batchId: string,
        query: { page: number },
      ) =>
        Promise.resolve({
          ...detail,
          messages: query.page === 2 ? [secondPageMessage] : detail.messages,
          pagination: {
            page: query.page,
            pageSize: 100,
            totalItems: 101,
            totalPages: 2,
          },
        }),
    );

    renderSending();
    await screen.findAllByText("Omar family");
    await user.click(
      screen.getByRole("button", { name: en.sending.failureNextPage }),
    );

    expect(await screen.findAllByText("Last failed family")).toHaveLength(2);
    expect(api.getSendBatch).toHaveBeenLastCalledWith(null, eventId, batchId, {
      page: 2,
      pageSize: 100,
      status: "FAILED",
    });
  });

  it("ignores a stale resend review after its failure drawer closes", async () => {
    const user = userEvent.setup();
    let resolveReview: ((value: unknown) => void) | undefined;
    api.getResendReadiness.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveReview = resolve;
        }),
    );

    renderSending();
    const failureActions = await screen.findAllByRole("button", {
      name: "Open failure details for Omar family",
    });
    await user.click(failureActions[0]!);
    const drawer = screen.getByRole("dialog", { name: "Omar family" });
    await user.click(
      within(drawer).getByRole("button", { name: en.common.close }),
    );

    await act(async () => {
      resolveReview?.({
        confirmationToken: "b".repeat(64),
        eligible: true,
        estimatedCreditUnits: 1,
        expiresAt: "2026-09-09T10:05:00.000Z",
        invitationGroupId: invitationId,
        messageId,
        reasonCode: null,
        reason: null,
      });
    });

    expect(
      screen.queryByRole("button", { name: en.sending.confirmResend }),
    ).toBeNull();
  });

  it("includes cancelled messages in both progress representations", async () => {
    const cancelledBatch = {
      ...batch,
      progress: { ...batch.progress, cancelled: 1 },
      totalMessages: 3,
    };
    api.listSendBatches.mockResolvedValue({
      ...batches,
      items: [cancelledBatch],
    });
    api.getSendBatch.mockResolvedValue({
      ...detail,
      batch: cancelledBatch,
    });

    const { container } = renderSending();
    await screen.findByText(en.sending.progressTitle);

    expect(
      container.querySelector(".dawah-progress__legend")?.textContent,
    ).toMatch(/Cancelled\d+%\(1\)/);
    expect(
      container.querySelector(".sending-progress-counts")?.textContent,
    ).toContain(`${en.sending.cancelled}: 1`);
  });

  it("replaces an earlier send notice with the resend result", async () => {
    const user = userEvent.setup();
    renderSending();

    await screen.findByText(en.sending.estimatedCredits);
    await user.click(
      screen.getByRole("button", { name: en.sending.reviewAndSend }),
    );
    await user.click(
      screen.getByRole("button", { name: en.sending.confirmSend }),
    );
    expect(await screen.findByText(en.sending.batchQueued)).toBeTruthy();

    const failureActions = await screen.findAllByRole("button", {
      name: "Open failure details for Omar family",
    });
    await user.click(failureActions[0]!);
    await user.click(
      screen.getByRole("button", { name: en.sending.reviewResend }),
    );
    await user.click(
      await screen.findByRole("button", { name: en.sending.confirmResend }),
    );

    expect(await screen.findByText(en.sending.resendQueued)).toBeTruthy();
    expect(screen.queryByText(en.sending.batchQueued)).toBeNull();
  });

  it("maps provider and resend reason codes to Arabic-safe copy", async () => {
    const user = userEvent.setup();
    api.getResendReadiness.mockResolvedValue({
      confirmationToken: null,
      eligible: false,
      estimatedCreditUnits: 0,
      expiresAt: null,
      invitationGroupId: invitationId,
      messageId,
      reasonCode: "AMBIGUOUS_OUTCOME",
      reason: "The provider outcome is uncertain.",
    });

    renderSending(ar, "ar-SA");
    await user.click(
      (
        await screen.findAllByRole("button", {
          name: `فتح تفاصيل إخفاق Omar family`,
        })
      )[0]!,
    );
    expect(
      screen.getAllByText(ar.sending.failureReasonRecipientUnavailable).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByText("Recipient is not reachable on WhatsApp."),
    ).toBeNull();

    await user.click(
      screen.getByRole("button", { name: ar.sending.reviewResend }),
    );
    expect(
      await screen.findByText(ar.sending.resendAmbiguousOutcome),
    ).toBeTruthy();
    expect(screen.queryByText("The provider outcome is uncertain.")).toBeNull();
  });
});
