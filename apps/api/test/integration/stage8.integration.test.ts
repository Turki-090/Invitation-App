import { createHash, randomUUID } from "node:crypto";
import { Permission } from "@dawah/domain";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PrismaMessagingRepository } from "../../../worker/src/prisma-messaging-repository";
import { PrismaReminderRepository } from "../../../worker/src/prisma-reminder-repository";
import { EventAccessService } from "../../src/events/event-access.service";
import type { MessagingQueueService } from "../../src/messaging/messaging-queue.service";
import { MessagingService } from "../../src/messaging/messaging.service";
import { NotificationsService } from "../../src/notifications/notifications.service";
import { PreparationService } from "../../src/preparation/preparation.service";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { RemindersService } from "../../src/reminders/reminders.service";
import { RsvpService } from "../../src/rsvp/rsvp.service";
import { TeamService } from "../../src/team/team.service";
import { TestDatabase } from "./database";
import {
  createEventFixture,
  createUserFixture,
  resetFactorySequence,
} from "./factories";

const database = new TestDatabase();
const prisma = database.prisma;
const prismaService = prisma as unknown as PrismaService;
const access = new EventAccessService(prismaService);

describe("Stage 8 PostgreSQL collaboration and reminders integration", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await database.clean();
    resetFactorySequence();
  });

  afterAll(async () => {
    await database.clean();
    await prisma.$disconnect();
  });

  it("accepts a phone-bound custom team invitation once and revokes access without cross-tenant leakage", async () => {
    const owner = await createUserFixture(prisma, {
      authProviderId: "stage8-team-owner",
    });
    const invited = await createUserFixture(prisma, {
      authProviderId: "stage8-team-invited",
      phoneE164: "+966501111111",
    });
    const outsider = await createUserFixture(prisma, {
      authProviderId: "stage8-team-outsider",
      phoneE164: "+966502222222",
    });
    const event = await createEventFixture(prisma, owner);
    const team = new TeamService(prismaService, access);
    const ownerPrincipal = { subject: owner.authProviderId };
    const invitedPrincipal = {
      subject: invited.authProviderId,
      phone: invited.phoneE164!,
    };
    const outsiderPrincipal = {
      subject: outsider.authProviderId,
      phone: outsider.phoneE164!,
    };

    const credential = await team.createInvitation(ownerPrincipal, event.id, {
      phoneNumber: invited.phoneE164!,
      phoneCountry: "SA",
      role: "CO_HOST",
      permissionConfiguration: {
        mode: "CUSTOM",
        permissions: [Permission.REMINDER_SEND, Permission.EVENT_VIEW],
      },
    });
    const storedInvitation = await prisma.teamInvitation.findUniqueOrThrow({
      where: { id: credential.id },
    });
    expect(credential.acceptanceToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(storedInvitation.tokenHash).toBe(sha256(credential.acceptanceToken));
    expect(storedInvitation.tokenHash).not.toContain(
      credential.acceptanceToken,
    );
    expect(JSON.stringify(storedInvitation)).not.toContain(
      credential.acceptanceToken,
    );

    await expect(
      team.acceptInvitation(outsiderPrincipal, {
        token: credential.acceptanceToken,
      }),
    ).rejects.toMatchObject({
      response: { code: "TEAM_INVITATION_NOT_FOUND" },
    });
    expect(
      await prisma.teamInvitation.findUniqueOrThrow({
        where: { id: credential.id },
      }),
    ).toMatchObject({ status: "PENDING", acceptedMembershipId: null });

    const accepted = await Promise.all([
      team.acceptInvitation(invitedPrincipal, {
        token: credential.acceptanceToken,
      }),
      team.acceptInvitation(invitedPrincipal, {
        token: credential.acceptanceToken,
      }),
    ]);
    expect(
      accepted.map(({ alreadyAccepted }) => alreadyAccepted).sort(),
    ).toEqual([false, true]);
    expect(new Set(accepted.map(({ membership }) => membership.id)).size).toBe(
      1,
    );
    expect(accepted[0]!.membership).toMatchObject({
      role: "CO_HOST",
      status: "ACTIVE",
      permissionMode: "CUSTOM",
      configuredPermissions: [Permission.EVENT_VIEW, Permission.REMINDER_SEND],
      effectivePermissions: [Permission.EVENT_VIEW, Permission.REMINDER_SEND],
    });
    expect(
      await prisma.eventMembership.count({
        where: { eventId: event.id, userId: invited.id },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { eventId: event.id, action: "team.member_joined" },
      }),
    ).toBe(1);
    expect(
      await prisma.notification.findMany({
        where: { eventId: event.id, kind: "TEAM_MEMBER_JOINED" },
        orderBy: { userId: "asc" },
        select: { userId: true },
      }),
    ).toEqual([owner.id, invited.id].sort().map((userId) => ({ userId })));

    await expect(
      access.resolve(invitedPrincipal, event.id, Permission.REMINDER_SEND),
    ).resolves.toMatchObject({ membership: { status: "ACTIVE" } });
    await expect(
      access.resolve(invitedPrincipal, event.id, Permission.INVITATION_SEND),
    ).rejects.toMatchObject({
      response: { code: "EVENT_PERMISSION_DENIED" },
    });
    await team.updateMembership(
      ownerPrincipal,
      event.id,
      accepted[0]!.membership.id,
      {
        permissionConfiguration: {
          mode: "CUSTOM",
          permissions: [
            Permission.EVENT_VIEW,
            Permission.REMINDER_SEND,
            Permission.TEAM_MANAGE,
          ],
        },
      },
    );
    await expect(
      team.listTeam(invitedPrincipal, event.id),
    ).resolves.toMatchObject({
      eventId: event.id,
    });
    await expect(
      team.createInvitation(invitedPrincipal, event.id, {
        phoneNumber: outsider.phoneE164!,
        phoneCountry: "SA",
        role: "CO_HOST",
        permissionConfiguration: {
          mode: "CUSTOM",
          permissions: [Permission.EVENT_VIEW, Permission.INVITATION_SEND],
        },
      }),
    ).rejects.toMatchObject({
      response: {
        code: "PERMISSION_DELEGATION_DENIED",
        details: { permissions: [Permission.INVITATION_SEND] },
      },
    });
    await expect(
      team.listTeam(outsiderPrincipal, event.id),
    ).rejects.toMatchObject({ response: { code: "EVENT_NOT_FOUND" } });
    await expect(
      team.createInvitation(ownerPrincipal, event.id, {
        phoneNumber: outsider.phoneE164!,
        phoneCountry: "SA",
        role: "CO_HOST",
        permissionConfiguration: {
          mode: "CUSTOM",
          permissions: [Permission.EVENT_VIEW, Permission.BILLING_MANAGE],
        },
      }),
    ).rejects.toMatchObject({
      response: { code: "NON_DELEGABLE_PERMISSION" },
    });

    const expiring = await team.createInvitation(ownerPrincipal, event.id, {
      phoneNumber: outsider.phoneE164!,
      phoneCountry: "SA",
      role: "CHECK_IN_STAFF",
      permissionConfiguration: { mode: "DEFAULT", permissions: [] },
    });
    await prisma.teamInvitation.update({
      where: { id: expiring.id },
      data: {
        status: "EXPIRED",
        expiresAt: new Date("2026-09-01T00:00:00.000Z"),
      },
    });
    await expect(
      team.resendInvitation(invitedPrincipal, event.id, expiring.id),
    ).rejects.toMatchObject({
      response: {
        code: "PERMISSION_DELEGATION_DENIED",
        details: {
          permissions: [Permission.GUEST_VIEW, Permission.CHECKIN_USE],
        },
      },
    });
    const resent = await team.resendInvitation(
      ownerPrincipal,
      event.id,
      expiring.id,
    );
    expect(resent).toMatchObject({ id: expiring.id, status: "PENDING" });
    expect(resent.acceptanceToken).not.toBe(expiring.acceptanceToken);

    const membershipId = accepted[0]!.membership.id;
    const revoked = await team.revokeMembership(
      ownerPrincipal,
      event.id,
      membershipId,
    );
    expect(revoked).toMatchObject({
      id: membershipId,
      status: "REVOKED",
      revokedAt: expect.any(String),
    });
    await expect(
      team.revokeMembership(ownerPrincipal, event.id, membershipId),
    ).resolves.toMatchObject({ id: membershipId, status: "REVOKED" });
    await expect(
      access.resolve(invitedPrincipal, event.id, Permission.EVENT_VIEW),
    ).rejects.toMatchObject({ response: { code: "EVENT_NOT_FOUND" } });
    expect(
      await prisma.auditLog.count({
        where: { eventId: event.id, action: "team.membership_revoked" },
      }),
    ).toBe(1);
  });

  it("explains exclusions, deduplicates reminder sends, rechecks eligibility at claim time, and isolates invitation APIs", async () => {
    const owner = await createUserFixture(prisma, {
      authProviderId: "stage8-reminder-owner",
    });
    const cohost = await createUserFixture(prisma, {
      authProviderId: "stage8-reminder-cohost",
      phoneE164: "+966503333333",
    });
    const outsider = await createUserFixture(prisma, {
      authProviderId: "stage8-reminder-outsider",
    });
    const event = await createEventFixture(prisma, owner);
    await prisma.event.update({
      where: { id: event.id },
      data: {
        status: "RSVP_OPEN",
        rsvpDeadline: new Date("2027-01-14T00:00:00.000Z"),
        allowRsvpEdits: true,
      },
    });
    const ownerPrincipal = { subject: owner.authProviderId };
    const cohostPrincipal = {
      subject: cohost.authProviderId,
      phone: cohost.phoneE164!,
    };
    const outsiderPrincipal = { subject: outsider.authProviderId };
    const team = new TeamService(prismaService, access);
    const credential = await team.createInvitation(ownerPrincipal, event.id, {
      phoneNumber: cohost.phoneE164!,
      phoneCountry: "SA",
      role: "CO_HOST",
      permissionConfiguration: {
        mode: "CUSTOM",
        permissions: [Permission.EVENT_VIEW, Permission.REMINDER_SEND],
      },
    });
    await team.acceptInvitation(cohostPrincipal, {
      token: credential.acceptanceToken,
    });

    const invitations = {
      eligible: await createInvitation(event.id, owner.id, 1, ["Eligible"]),
      claimRace: await createInvitation(event.id, owner.id, 2, ["Race"]),
      accepted: await createInvitation(event.id, owner.id, 3, ["Accepted"]),
      partial: await createInvitation(event.id, owner.id, 4, [
        "Partial A",
        "Partial B",
      ]),
      declined: await createInvitation(event.id, owner.id, 5, ["Declined"]),
      cancelled: await createInvitation(event.id, owner.id, 6, ["Cancelled"]),
      recent: await createInvitation(event.id, owner.id, 7, ["Recent"]),
      resent: await createInvitation(event.id, owner.id, 8, ["Resent"]),
    };
    const invitationIds = Object.values(invitations).map(({ id }) => id);
    const queues = queueRecorder();
    const preparation = new PreparationService(prismaService, access);
    const messaging = new MessagingService(
      prismaService,
      access,
      queues.service,
    );
    const reminders = new RemindersService(
      prismaService,
      access,
      queues.service,
    );
    const rsvp = rsvpService(queues.service);
    const notifications = new NotificationsService(prismaService, access);
    const repository = new PrismaMessagingRepository(prisma, {
      mediaPublicApiBaseUrl: "https://api.example.test/api/v1",
      mediaSigningSecret: "stage8-media-signing-secret-123456789",
      mediaUrlTtlSeconds: 900,
    });
    const reminderOutbox = new PrismaReminderRepository(prisma);

    const invitationTemplate = await approvedTemplate(
      preparation,
      ownerPrincipal,
      event.id,
      "INVITATION",
      "stage8_initial_invitation",
    );
    await preparation.createSnapshots(ownerPrincipal, event.id, {
      templateId: invitationTemplate.id,
      invitationIds,
    });
    const initialReadiness = await messaging.readiness(
      ownerPrincipal,
      event.id,
      { templateId: invitationTemplate.id, invitationIds },
    );
    const initialBatch = await messaging.createBatch(
      ownerPrincipal,
      event.id,
      {
        templateId: invitationTemplate.id,
        invitationIds,
        confirmationToken: initialReadiness.confirmationToken,
      },
      "stage8-initial-send",
    );
    const initialMessages = await prisma.message.findMany({
      where: { sendBatchId: initialBatch.id },
      orderBy: { id: "asc" },
    });
    expect(initialMessages).toHaveLength(invitationIds.length);
    let failedInitialMessageId: string | undefined;
    for (const [index, message] of initialMessages.entries()) {
      const claim = await repository.claimMessage(message.id, 5);
      if (claim.outcome !== "SEND") {
        throw new Error(`Initial message was not claimable: ${claim.reason}`);
      }
      if (message.invitationGroupId === invitations.resent.id) {
        failedInitialMessageId = message.id;
        await repository.recordFailure(claim, {
          failureClass: "PERMANENT",
          providerCode: "STAGE8_DESTINATION_REJECTED",
          retry: false,
        });
      } else {
        await repository.recordAccepted(claim, {
          provider: "META_WHATSAPP",
          providerMessageId: `wamid.stage8.initial.${index + 1}`,
          acceptedAt: new Date("2026-09-13T08:00:00.000Z"),
        });
      }
    }
    if (!failedInitialMessageId) {
      throw new Error("Expected the resend fixture's initial message.");
    }
    const resendReadiness = await messaging.resendReadiness(
      ownerPrincipal,
      event.id,
      failedInitialMessageId,
    );
    expect(resendReadiness).toMatchObject({ eligible: true, reasonCode: null });
    const resendBatch = await messaging.resend(
      ownerPrincipal,
      event.id,
      failedInitialMessageId,
      { confirmationToken: resendReadiness.confirmationToken! },
      "stage8-successful-resend",
    );
    const resendMessage = await prisma.message.findFirstOrThrow({
      where: { sendBatchId: resendBatch.id },
    });
    expect(resendMessage).toMatchObject({
      invitationGroupId: invitations.resent.id,
      predecessorMessageId: failedInitialMessageId,
      messageType: "INVITATION",
    });
    const resendClaim = await repository.claimMessage(resendMessage.id, 5);
    if (resendClaim.outcome !== "SEND") {
      throw new Error(
        `Invitation resend was not claimable: ${resendClaim.reason}`,
      );
    }
    await repository.recordAccepted(resendClaim, {
      provider: "META_WHATSAPP",
      providerMessageId: "wamid.stage8.invitation.resend",
      acceptedAt: new Date("2026-09-13T08:01:00.000Z"),
    });

    const reminderTemplate = await approvedTemplate(
      preparation,
      cohostPrincipal,
      event.id,
      "REMINDER",
      "stage8_pending_reminder",
    );
    await preparation.createSnapshots(cohostPrincipal, event.id, {
      templateId: reminderTemplate.id,
      invitationIds,
    });
    expect(
      (await preparation.listTemplates(cohostPrincipal, event.id)).items.map(
        ({ id }) => id,
      ),
    ).toEqual([reminderTemplate.id]);

    await rsvp.submitHost(ownerPrincipal, event.id, invitations.accepted.id, {
      submissionId: randomUUID(),
      attendingMemberIds: [invitations.accepted.members[0]!.id],
      companionCount: 0,
    });
    await rsvp.submitHost(ownerPrincipal, event.id, invitations.partial.id, {
      submissionId: randomUUID(),
      attendingMemberIds: [invitations.partial.members[0]!.id],
      companionCount: 0,
    });
    await rsvp.submitHost(ownerPrincipal, event.id, invitations.declined.id, {
      submissionId: randomUUID(),
      attendingMemberIds: [],
      companionCount: 0,
    });
    await prisma.invitationGroup.update({
      where: { id: invitations.cancelled.id },
      data: { cancelledAt: new Date("2026-09-13T08:05:00.000Z") },
    });

    const recentReadiness = await reminders.readiness(
      cohostPrincipal,
      event.id,
      {
        templateId: reminderTemplate.id,
        invitationIds: [invitations.recent.id],
        audience: "ALL_PENDING",
        cooldownHours: 72,
      },
    );
    await reminders.send(
      cohostPrincipal,
      event.id,
      {
        templateId: reminderTemplate.id,
        invitationIds: [invitations.recent.id],
        audience: "ALL_PENDING",
        cooldownHours: 72,
        confirmationToken: recentReadiness.confirmationToken,
      },
      "stage8-recent-reminder",
    );

    const readinessInput = {
      templateId: reminderTemplate.id,
      invitationIds,
      audience: "ALL_PENDING" as const,
      cooldownHours: 72,
    };
    const readiness = await reminders.readiness(
      cohostPrincipal,
      event.id,
      readinessInput,
    );
    expect(readiness.summary).toEqual({
      selectedInvitations: 8,
      eligibleInvitations: 3,
      excludedInvitations: 5,
      recentlyRemindedInvitations: 1,
      estimatedCreditUnits: 3,
    });
    expect(new Set(readiness.eligibleInvitationIds)).toEqual(
      new Set([
        invitations.eligible.id,
        invitations.claimRace.id,
        invitations.resent.id,
      ]),
    );
    const exclusionByInvitation = new Map(
      readiness.excluded.map((item) => [item.invitationId, item]),
    );
    for (const invitation of [
      invitations.accepted,
      invitations.partial,
      invitations.declined,
    ]) {
      expect(exclusionByInvitation.get(invitation.id)?.reasonCodes).toContain(
        "RSVP_NOT_PENDING",
      );
    }
    expect(
      exclusionByInvitation.get(invitations.cancelled.id)?.reasonCodes,
    ).toEqual(
      expect.arrayContaining([
        "INVITATION_CANCELLED",
        "CURRENT_SNAPSHOT_REQUIRED",
      ]),
    );
    expect(exclusionByInvitation.get(invitations.recent.id)).toMatchObject({
      reasonCodes: expect.arrayContaining(["COOLDOWN_ACTIVE"]),
      nextEligibleAt: expect.any(String),
    });

    await expect(
      reminders.readiness(outsiderPrincipal, event.id, readinessInput),
    ).rejects.toMatchObject({ response: { code: "EVENT_NOT_FOUND" } });

    const sendInput = {
      ...readinessInput,
      confirmationToken: readiness.confirmationToken,
    };
    const [run, replay] = await Promise.all([
      reminders.send(
        cohostPrincipal,
        event.id,
        sendInput,
        "stage8-reminder-send",
      ),
      reminders.send(
        cohostPrincipal,
        event.id,
        sendInput,
        "stage8-reminder-send",
      ),
    ]);
    expect(replay.id).toBe(run.id);
    expect(replay.sendBatchId).toBe(run.sendBatchId);
    expect(run).toMatchObject({
      source: "MANUAL",
      selectedCount: 8,
      eligibleCount: 3,
      excludedCount: 5,
    });
    expect(run.sendBatchId).not.toBeNull();
    expect(await prisma.reminderRun.count({ where: { id: run.id } })).toBe(1);
    expect(
      await prisma.sendBatch.count({ where: { id: run.sendBatchId! } }),
    ).toBe(1);
    expect(
      await prisma.message.count({ where: { sendBatchId: run.sendBatchId! } }),
    ).toBe(3);
    expect(
      await prisma.idempotencyRecord.count({
        where: {
          sendBatchId: run.sendBatchId!,
          operation: "reminder.send",
        },
      }),
    ).toBe(1);
    expect(await reminderOutbox.listPendingReminderBatchIds()).toContain(
      run.sendBatchId,
    );

    await rsvp.submitHost(ownerPrincipal, event.id, invitations.claimRace.id, {
      submissionId: randomUUID(),
      attendingMemberIds: [invitations.claimRace.members[0]!.id],
      companionCount: 0,
    });
    const reminderMessages = await prisma.message.findMany({
      where: { sendBatchId: run.sendBatchId! },
      orderBy: { invitationGroupId: "asc" },
    });
    const cancelledAtClaim = reminderMessages.find(
      ({ invitationGroupId }) => invitationGroupId === invitations.claimRace.id,
    )!;
    const sendableMessages = reminderMessages.filter(
      ({ invitationGroupId }) =>
        invitationGroupId === invitations.eligible.id ||
        invitationGroupId === invitations.resent.id,
    );
    expect(sendableMessages).toHaveLength(2);
    await expect(
      repository.claimMessage(cancelledAtClaim.id, 5),
    ).resolves.toEqual({ outcome: "SKIP", reason: "RSVP_NOT_PENDING" });
    expect(
      await prisma.message.findUniqueOrThrow({
        where: { id: cancelledAtClaim.id },
      }),
    ).toMatchObject({ status: "CANCELLED", cancelledAt: expect.any(Date) });
    expect(
      await prisma.reminderRecipientState.findUnique({
        where: {
          eventId_invitationGroupId: {
            eventId: event.id,
            invitationGroupId: invitations.claimRace.id,
          },
        },
      }),
    ).toBeNull();

    for (const [index, message] of sendableMessages.entries()) {
      const sendableClaim = await repository.claimMessage(message.id, 5);
      if (sendableClaim.outcome !== "SEND") {
        throw new Error(
          `Reminder message was not claimable: ${sendableClaim.reason}`,
        );
      }
      expect(sendableClaim.purpose).toBe("REMINDER");
      await repository.recordAccepted(sendableClaim, {
        provider: "META_WHATSAPP",
        providerMessageId: `wamid.stage8.reminder.${index + 1}`,
        acceptedAt: new Date("2026-09-13T08:10:00.000Z"),
      });
    }
    expect(
      await prisma.sendBatch.findUniqueOrThrow({
        where: { id: run.sendBatchId! },
      }),
    ).toMatchObject({ status: "COMPLETED", completedAt: expect.any(Date) });
    expect(
      await prisma.reminderRun.findUniqueOrThrow({ where: { id: run.id } }),
    ).toMatchObject({ status: "COMPLETED", completedAt: expect.any(Date) });
    expect(await reminderOutbox.listPendingReminderBatchIds()).not.toContain(
      run.sendBatchId,
    );

    const auditActions = await prisma.auditLog.findMany({
      where: {
        eventId: event.id,
        action: {
          in: [
            "reminder_run.queued",
            "reminder_message.cancelled_before_send",
            "reminder_run.completed",
          ],
        },
      },
      select: { action: true, targetId: true, metadata: true },
    });
    expect(
      auditActions.some(
        (audit) =>
          audit.action === "reminder_run.queued" && audit.targetId === run.id,
      ),
    ).toBe(true);
    expect(
      auditActions.some(
        (audit) =>
          audit.action === "reminder_message.cancelled_before_send" &&
          audit.targetId === cancelledAtClaim.id &&
          JSON.stringify(audit.metadata).includes("RSVP_NOT_PENDING"),
      ),
    ).toBe(true);
    expect(
      auditActions.some(
        (audit) =>
          audit.action === "reminder_run.completed" &&
          audit.targetId === run.sendBatchId,
      ),
    ).toBe(true);

    const cohostNotifications = await notifications.list(cohostPrincipal, {
      eventId: event.id,
      unreadOnly: true,
      page: 1,
      pageSize: 20,
    });
    expect(cohostNotifications.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "REMINDER_BATCH_COMPLETED",
          sourceType: "SendBatch",
          sourceId: run.sendBatchId,
          data: expect.objectContaining({
            messageType: "REMINDER",
            totalMessages: 3,
            cancelledMessages: 1,
          }),
        }),
      ]),
    );
    expect(
      await prisma.notification.count({
        where: {
          eventId: event.id,
          kind: "REMINDER_BATCH_COMPLETED",
          sourceId: run.sendBatchId!,
        },
      }),
    ).toBe(2);

    const cooldown = await reminders.readiness(cohostPrincipal, event.id, {
      templateId: reminderTemplate.id,
      invitationIds: [invitations.eligible.id],
      audience: "ALL_PENDING",
      cooldownHours: 72,
    });
    expect(cooldown.summary).toMatchObject({
      eligibleInvitations: 0,
      recentlyRemindedInvitations: 1,
    });
    expect(cooldown.excluded[0]?.reasonCodes).toContain("COOLDOWN_ACTIVE");

    const invitationBatches = await messaging.listBatches(
      ownerPrincipal,
      event.id,
      { page: 1, pageSize: 20 },
    );
    expect(new Set(invitationBatches.items.map(({ id }) => id))).toEqual(
      new Set([initialBatch.id, resendBatch.id]),
    );
    await expect(
      messaging.getBatch(ownerPrincipal, event.id, run.sendBatchId!, {
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toMatchObject({
      response: { code: "SEND_BATCH_NOT_FOUND" },
    });
    await expect(
      messaging.resendReadiness(
        ownerPrincipal,
        event.id,
        sendableMessages[0]!.id,
      ),
    ).rejects.toMatchObject({ response: { code: "MESSAGE_NOT_FOUND" } });
  });

  it("runs scheduled rules once per evaluation slot and records cooldown no-op history", async () => {
    const owner = await createUserFixture(prisma, {
      authProviderId: "stage8-scheduled-owner",
    });
    const event = await createEventFixture(prisma, owner);
    await prisma.event.update({
      where: { id: event.id },
      data: { status: "RSVP_OPEN" },
    });
    const principal = { subject: owner.authProviderId };
    const queues = queueRecorder();
    const preparation = new PreparationService(prismaService, access);
    const messaging = new MessagingService(
      prismaService,
      access,
      queues.service,
    );
    const reminders = new RemindersService(
      prismaService,
      access,
      queues.service,
    );
    const messagingRepository = new PrismaMessagingRepository(prisma, {
      mediaPublicApiBaseUrl: "https://api.example.test/api/v1",
      mediaSigningSecret: "stage8-scheduled-media-secret-123456789",
      mediaUrlTtlSeconds: 900,
    });
    const reminderRepository = new PrismaReminderRepository(prisma);
    const invitation = await createInvitation(event.id, owner.id, 9, [
      "Scheduled",
    ]);

    const invitationTemplate = await approvedTemplate(
      preparation,
      principal,
      event.id,
      "INVITATION",
      "stage8_scheduled_invitation",
    );
    await preparation.createSnapshots(principal, event.id, {
      templateId: invitationTemplate.id,
      invitationIds: [invitation.id],
    });
    const initialReadiness = await messaging.readiness(principal, event.id, {
      templateId: invitationTemplate.id,
      invitationIds: [invitation.id],
    });
    const initialBatch = await messaging.createBatch(
      principal,
      event.id,
      {
        templateId: invitationTemplate.id,
        invitationIds: [invitation.id],
        confirmationToken: initialReadiness.confirmationToken,
      },
      "stage8-scheduled-initial",
    );
    const initialMessage = await prisma.message.findFirstOrThrow({
      where: { sendBatchId: initialBatch.id },
    });
    const initialClaim = await messagingRepository.claimMessage(
      initialMessage.id,
      5,
    );
    if (initialClaim.outcome !== "SEND") {
      throw new Error(
        `Initial message was not claimable: ${initialClaim.reason}`,
      );
    }
    await messagingRepository.recordAccepted(initialClaim, {
      provider: "META_WHATSAPP",
      providerMessageId: "wamid.stage8.scheduled.initial",
      acceptedAt: new Date("2026-09-10T08:00:00.000Z"),
    });

    const reminderTemplate = await approvedTemplate(
      preparation,
      principal,
      event.id,
      "REMINDER",
      "stage8_scheduled_reminder",
    );
    await preparation.createSnapshots(principal, event.id, {
      templateId: reminderTemplate.id,
      invitationIds: [invitation.id],
    });
    const rule = await reminders.createRule(principal, event.id, {
      templateId: reminderTemplate.id,
      name: "One day after invitation",
      triggerKind: "AFTER_INITIAL_INVITATION",
      offsetDays: 1,
      cooldownHours: 72,
      maximumReminders: 5,
      enabled: true,
    });

    const firstNow = new Date("2026-09-13T12:10:00.000Z");
    const firstJobs = await reminderRepository.listDueRuleRuns(firstNow);
    const firstJob = firstJobs.find(({ ruleId }) => ruleId === rule.id);
    expect(firstJob).toBeDefined();
    const first = await reminderRepository.runScheduledRule(
      { operation: "RUN", ...firstJob! },
      firstNow,
    );
    expect(first).toMatchObject({
      outcome: "CREATED",
      selectedCount: 1,
      eligibleCount: 1,
      excludedCount: 0,
      batchId: expect.any(String),
    });
    await expect(
      reminderRepository.runScheduledRule(
        { operation: "RUN", ...firstJob! },
        firstNow,
      ),
    ).resolves.toMatchObject({ outcome: "REPLAYED", batchId: first.batchId });

    const secondNow = new Date("2026-09-13T13:10:00.000Z");
    const secondJobs = await reminderRepository.listDueRuleRuns(secondNow);
    const secondJob = secondJobs.find(({ ruleId }) => ruleId === rule.id);
    expect(secondJob).toBeDefined();
    const second = await reminderRepository.runScheduledRule(
      { operation: "RUN", ...secondJob! },
      secondNow,
    );
    expect(second).toEqual({
      outcome: "CREATED",
      batchId: null,
      selectedCount: 1,
      eligibleCount: 0,
      excludedCount: 1,
    });
    const noOpRun = await prisma.reminderRun.findFirstOrThrow({
      where: {
        eventId: event.id,
        ruleId: rule.id,
        scheduleKey: secondJob!.scheduleKey,
      },
      include: { items: true },
    });
    expect(noOpRun).toMatchObject({
      source: "SCHEDULED",
      status: "COMPLETED",
      sendBatchId: null,
      confirmationHash: null,
      eligibleCount: 0,
      completedAt: secondNow,
    });
    expect(noOpRun.items).toHaveLength(1);
    expect(noOpRun.items[0]).toMatchObject({
      invitationGroupId: invitation.id,
      outcome: "EXCLUDED",
      messageId: null,
      reasonCodes: expect.arrayContaining(["COOLDOWN_ACTIVE"]),
    });
    await expect(
      reminderRepository.runScheduledRule(
        { operation: "RUN", ...secondJob! },
        secondNow,
      ),
    ).resolves.toMatchObject({ outcome: "REPLAYED", batchId: null });
    expect(
      await prisma.reminderRun.count({
        where: { eventId: event.id, ruleId: rule.id },
      }),
    ).toBe(2);
  });
});

async function approvedTemplate(
  preparation: PreparationService,
  principal: { readonly subject: string },
  eventId: string,
  purpose: "INVITATION" | "REMINDER",
  providerTemplateName: string,
) {
  const draft = await preparation.createTemplate(principal, eventId, {
    name: purpose === "INVITATION" ? "Stage 8 invitation" : "Stage 8 reminder",
    purpose,
    locale: "en",
    body: "Hello {{guest_name}}, please respond for {{event_name}}.",
    providerTemplateName,
  });
  return preparation.approveTemplate(principal, eventId, draft.id, {
    expectedVersion: draft.version,
  });
}

async function createInvitation(
  eventId: string,
  ownerId: string,
  phoneOffset: number,
  memberNames: readonly string[],
) {
  return prisma.invitationGroup.create({
    data: {
      eventId,
      displayName: memberNames.join(" and "),
      contactName: memberNames[0]!,
      phoneE164: `+9665555555${String(phoneOffset).padStart(2, "0")}`,
      phoneCountry: "SA",
      invitationType: memberNames.length === 1 ? "SINGLE" : "NAMED_GROUP",
      createdBy: ownerId,
      members: {
        create: memberNames.map((name, index) => ({
          name,
          position: index + 1,
          isPrimary: index === 0,
        })),
      },
    },
    include: { members: { orderBy: { position: "asc" } } },
  });
}

function rsvpService(queue: MessagingQueueService): RsvpService {
  return new RsvpService(prismaService, access, queue, {
    get: (key: string) =>
      key.endsWith("_AR")
        ? "dawah_rsvp_confirmation_ar"
        : "dawah_rsvp_confirmation_en",
  } as never);
}

function queueRecorder() {
  const batchIds: string[] = [];
  const confirmationIds: string[] = [];
  return {
    batchIds,
    confirmationIds,
    service: {
      enqueueBatch: vi.fn(async (batchId: string) => {
        batchIds.push(batchId);
      }),
      enqueueRsvpConfirmation: vi.fn(async (confirmationId: string) => {
        confirmationIds.push(confirmationId);
      }),
    } as unknown as MessagingQueueService,
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
