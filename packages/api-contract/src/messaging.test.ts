import { describe, expect, it } from "vitest";
import {
  createSendBatchSchema,
  idempotencyKeySchema,
  resendReadinessResponseSchema,
  sendBatchSchema,
  sendReadinessResponseSchema,
} from "./messaging";

const eventId = "10000000-0000-4000-8000-000000000001";
const templateId = "20000000-0000-4000-8000-000000000001";

describe("Stage 6 messaging contracts", () => {
  it("bounds a send selection and requires a server confirmation token", () => {
    expect(
      createSendBatchSchema.parse({
        templateId,
        invitationIds: [eventId],
        confirmationToken: "a".repeat(64),
      }),
    ).toMatchObject({ templateId });
    expect(
      createSendBatchSchema.safeParse({
        templateId,
        invitationIds: Array.from({ length: 5_001 }, () => eventId),
        confirmationToken: "a".repeat(64),
      }).success,
    ).toBe(false);
  });

  it("accepts opaque idempotency keys but not whitespace or short keys", () => {
    expect(idempotencyKeySchema.parse("launch-2026-09-09:01")).toBe(
      "launch-2026-09-09:01",
    );
    expect(idempotencyKeySchema.safeParse("short").success).toBe(false);
    expect(idempotencyKeySchema.safeParse("contains space").success).toBe(
      false,
    );
  });

  it("keeps delivery progress separate from invitation readiness", () => {
    expect(
      sendReadinessResponseSchema.parse({
        templateId,
        confirmationToken: "b".repeat(64),
        expiresAt: "2026-09-09T10:05:00.000Z",
        summary: {
          selectedInvitations: 2,
          readyInvitations: 1,
          alreadySentInvitations: 0,
          blockedInvitations: 1,
          estimatedCreditUnits: 1,
        },
        blocked: [{ invitationId: eventId, issues: [] }],
        alreadySentInvitationIds: [],
      }).summary,
    ).toMatchObject({ readyInvitations: 1, estimatedCreditUnits: 1 });

    expect(
      sendBatchSchema.parse({
        id: eventId,
        eventId,
        status: "IN_PROGRESS",
        messageType: "INVITATION",
        totalMessages: 1,
        estimatedCreditUnits: 1,
        progress: {
          queued: 0,
          sending: 0,
          sent: 0,
          delivered: 0,
          read: 1,
          responded: 0,
          failed: 0,
          cancelled: 0,
          completed: 1,
        },
        queuedAt: "2026-09-09T10:00:00.000Z",
        startedAt: "2026-09-09T10:00:01.000Z",
        completedAt: null,
        createdAt: "2026-09-09T10:00:00.000Z",
      }).progress.read,
    ).toBe(1);
  });

  it("exposes stable nullable resend ineligibility codes", () => {
    expect(
      resendReadinessResponseSchema.parse({
        messageId: eventId,
        invitationGroupId: templateId,
        eligible: false,
        estimatedCreditUnits: 0,
        confirmationToken: null,
        expiresAt: null,
        reasonCode: "AMBIGUOUS_OUTCOME",
        reason: "The provider outcome is uncertain.",
      }).reasonCode,
    ).toBe("AMBIGUOUS_OUTCOME");
    expect(
      resendReadinessResponseSchema.parse({
        messageId: eventId,
        invitationGroupId: templateId,
        eligible: true,
        estimatedCreditUnits: 1,
        confirmationToken: "c".repeat(64),
        expiresAt: "2026-09-09T10:05:00.000Z",
        reasonCode: null,
        reason: null,
      }).reasonCode,
    ).toBeNull();
    expect(
      resendReadinessResponseSchema.safeParse({
        messageId: eventId,
        invitationGroupId: templateId,
        eligible: false,
        estimatedCreditUnits: 0,
        confirmationToken: null,
        expiresAt: null,
        reasonCode: "UNKNOWN_REASON",
        reason: "Unknown.",
      }).success,
    ).toBe(false);
  });
});
