import { createHash, randomUUID } from "node:crypto";
import type { MessagingProvider } from "@dawah/messaging";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { EventAccessService } from "../../src/events/event-access.service";
import { EventsService } from "../../src/events/events.service";
import type { MessagingQueueService } from "../../src/messaging/messaging-queue.service";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { RsvpService } from "../../src/rsvp/rsvp.service";
import { PrismaMessagingRepository } from "../../../worker/src/prisma-messaging-repository";
import { createWhatsappSendProcessor } from "../../../worker/src/whatsapp-send-processor";
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

describe("Stage 7 PostgreSQL public RSVP integration", () => {
  let queuedConfirmationIds: string[];
  let service: RsvpService;

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await database.clean();
    resetFactorySequence();
    queuedConfirmationIds = [];
    service = new RsvpService(
      prismaService,
      access,
      {
        enqueueRsvpConfirmation: vi.fn(async (confirmationId: string) => {
          queuedConfirmationIds.push(confirmationId);
        }),
      } as unknown as MessagingQueueService,
      {
        get: (key: string) =>
          key.endsWith("_AR")
            ? "dawah_rsvp_confirmation_ar"
            : "dawah_rsvp_confirmation_en",
      } as never,
    );
  });

  afterAll(async () => {
    await database.clean();
    await prisma.$disconnect();
  });

  it("issues 256-bit hash-only links, rotates them, strictly shapes public data, and revokes uniformly", async () => {
    const { owner, event, principal } = await openEvent("capability-owner");
    const invitation = await createInvitation({
      eventId: event.id,
      ownerId: owner.id,
      invitationType: "SINGLE",
      members: [{ name: "Private Guest", isPrimary: true }],
      internalNote: "never expose this host-only note",
    });

    const first = await service.issueCapability(
      principal,
      event.id,
      invitation.id,
      {},
    );
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = await prisma.publicInvitationCapability.findFirstOrThrow({
      where: { invitationGroupId: invitation.id },
    });
    expect(stored.tokenHash).toBe(sha256(first.token));
    expect(stored.tokenHash).not.toContain(first.token);

    const publicInvitation = await service.getPublicInvitation(
      first.token,
      "en",
    );
    expect(publicInvitation).toMatchObject({
      locale: "en",
      invitation: {
        displayName: "Private Guest",
        invitationType: "SINGLE",
      },
      policy: { lifecycleState: "OPEN", canRespond: true },
    });
    const serialized = JSON.stringify(publicInvitation);
    expect(serialized).not.toContain("+966");
    expect(serialized).not.toContain("never expose");
    expect(serialized).not.toContain(owner.id);
    expect(Object.keys(publicInvitation).sort()).toEqual([
      "currentRsvp",
      "event",
      "invitation",
      "locale",
      "policy",
    ]);

    const second = await service.issueCapability(
      principal,
      event.id,
      invitation.id,
      {},
    );
    expect(second.token).not.toBe(first.token);
    await expect(
      service.getPublicInvitation(first.token, "en"),
    ).rejects.toMatchObject({
      response: { code: "PUBLIC_INVITATION_NOT_FOUND" },
    });
    expect(await prisma.publicInvitationCapability.count()).toBe(2);
    expect(
      await prisma.publicInvitationCapability.count({
        where: { invitationGroupId: invitation.id, revokedAt: null },
      }),
    ).toBe(1);
    await expect(
      service.getCapabilityStatus(principal, event.id, invitation.id),
    ).resolves.toMatchObject({ active: true, revokedAt: null });
    await prisma.event.update({
      where: { id: event.id },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });
    await expect(
      service.getCapabilityStatus(principal, event.id, invitation.id),
    ).resolves.toMatchObject({ active: false, revokedAt: null });
    await expect(
      service.getPublicInvitation(second.token, "en"),
    ).rejects.toMatchObject({
      response: { code: "PUBLIC_INVITATION_NOT_FOUND" },
    });
    await prisma.event.update({
      where: { id: event.id },
      data: { status: "RSVP_OPEN", archivedAt: null },
    });
    await expect(
      service.getPublicInvitation("not-a-real-private-token", "en"),
    ).rejects.toMatchObject({
      response: { code: "PUBLIC_INVITATION_NOT_FOUND" },
    });

    await prisma.publicInvitationCapability.update({
      where: { tokenHash: sha256(second.token) },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    await expect(
      service.getPublicInvitation(second.token, "en"),
    ).rejects.toMatchObject({
      response: { code: "PUBLIC_INVITATION_NOT_FOUND" },
    });

    const revoked = await service.revokeCapability(
      principal,
      event.id,
      invitation.id,
    );
    expect(revoked).toMatchObject({
      active: false,
      revokedAt: expect.any(String),
    });
    await expect(
      service.getPublicInvitation(second.token, "en"),
    ).rejects.toMatchObject({
      response: { code: "PUBLIC_INVITATION_NOT_FOUND" },
    });
    const audits = await prisma.auditLog.findMany({
      where: { eventId: event.id, action: { contains: "public_access" } },
    });
    expect(audits).toHaveLength(3);
    expect(JSON.stringify(audits)).not.toContain(first.token);
    expect(JSON.stringify(audits)).not.toContain(second.token);
  });

  it("handles every invitation type atomically, preserves edits and idempotency, and updates dashboard totals", async () => {
    const { owner, event, principal } = await openEvent("all-types-owner");
    const single = await createInvitation({
      eventId: event.id,
      ownerId: owner.id,
      invitationType: "SINGLE",
      members: [{ name: "Single guest", isPrimary: true }],
      phoneOffset: 1,
    });
    const family = await createInvitation({
      eventId: event.id,
      ownerId: owner.id,
      invitationType: "NAMED_GROUP",
      members: [
        { name: "Parent", isPrimary: true },
        { name: "Child one", isPrimary: false },
        { name: "Child two", isPrimary: false },
      ],
      phoneOffset: 2,
    });
    const companions = await createInvitation({
      eventId: event.id,
      ownerId: owner.id,
      invitationType: "PRIMARY_WITH_COMPANIONS",
      maxCompanions: 2,
      members: [{ name: "Primary guest", isPrimary: true }],
      phoneOffset: 3,
    });
    const [singleAccess, familyAccess, companionAccess] = await Promise.all([
      service.issueCapability(principal, event.id, single.id, {}),
      service.issueCapability(principal, event.id, family.id, {}),
      service.issueCapability(principal, event.id, companions.id, {}),
    ]);
    const [singlePublic, familyPublic, companionPublic] = await Promise.all([
      service.getPublicInvitation(singleAccess.token, "en"),
      service.getPublicInvitation(familyAccess.token, "en"),
      service.getPublicInvitation(companionAccess.token, "en"),
    ]);

    const singleSubmissionId = randomUUID();
    const singleAccepted = await service.submitGuest(singleAccess.token, "en", {
      submissionId: singleSubmissionId,
      attendingMemberIds: [singlePublic.invitation.members[0]!.id],
      companionCount: 0,
    });
    const familyPartial = await service.submitGuest(familyAccess.token, "en", {
      submissionId: randomUUID(),
      attendingMemberIds: [familyPublic.invitation.members[1]!.id],
      companionCount: 0,
    });
    const companionAccepted = await service.submitGuest(
      companionAccess.token,
      "en",
      {
        submissionId: randomUUID(),
        attendingMemberIds: [companionPublic.invitation.members[0]!.id],
        companionCount: 2,
      },
    );
    expect(singleAccepted).toMatchObject({
      status: "ACCEPTED",
      expectedAttendees: 1,
      changed: true,
      isEdited: false,
      confirmationQueued: true,
    });
    expect(familyPartial).toMatchObject({
      status: "PARTIALLY_ACCEPTED",
      expectedAttendees: 1,
    });
    expect(companionAccepted).toMatchObject({
      status: "ACCEPTED",
      expectedAttendees: 3,
    });
    expect(JSON.stringify(familyPublic)).not.toContain(
      singlePublic.invitation.members[0]!.id,
    );
    await expect(
      service.submitGuest(familyAccess.token, "en", {
        submissionId: randomUUID(),
        attendingMemberIds: [singlePublic.invitation.members[0]!.id],
        companionCount: 0,
      }),
    ).rejects.toMatchObject({
      response: { code: "RSVP_MEMBER_NOT_INVITED" },
    });
    expect(
      await prisma.rsvpSubmission.count({
        where: { invitationGroupId: family.id },
      }),
    ).toBe(1);
    expect(queuedConfirmationIds).toHaveLength(3);
    expect(await prisma.rsvpMember.count()).toBe(5);

    const replay = await service.submitGuest(singleAccess.token, "ar-SA", {
      submissionId: singleSubmissionId,
      attendingMemberIds: [singlePublic.invitation.members[0]!.id],
      companionCount: 0,
    });
    expect(replay).toEqual(singleAccepted);
    expect(
      await prisma.rsvpHistory.count({
        where: { invitationGroupId: single.id },
      }),
    ).toBe(1);
    await expect(
      service.submitGuest(singleAccess.token, "en", {
        submissionId: singleSubmissionId,
        attendingMemberIds: [],
        companionCount: 0,
      }),
    ).rejects.toMatchObject({
      response: { code: "RSVP_IDEMPOTENCY_CONFLICT" },
    });

    const declined = await service.submitGuest(singleAccess.token, "en", {
      submissionId: randomUUID(),
      attendingMemberIds: [],
      companionCount: 0,
    });
    expect(declined).toMatchObject({
      status: "DECLINED",
      expectedAttendees: 0,
      isEdited: true,
      changed: true,
    });
    const oldWatermark = new Date("2026-01-01T00:00:00.000Z");
    await prisma.rsvp.update({
      where: { invitationGroupId: single.id },
      data: { respondedAt: oldWatermark },
    });
    const noChange = await service.submitGuest(singleAccess.token, "en", {
      submissionId: randomUUID(),
      attendingMemberIds: [],
      companionCount: 0,
    });
    expect(noChange).toMatchObject({
      status: "DECLINED",
      changed: false,
      confirmationQueued: false,
    });
    expect(new Date(noChange.respondedAt).getTime()).toBeGreaterThan(
      oldWatermark.getTime(),
    );
    const detail = await service.getHostRsvp(principal, event.id, single.id);
    expect(detail.currentRsvp).toMatchObject({
      status: "DECLINED",
      isEdited: true,
      source: "GUEST_WEB",
    });
    expect(detail.history).toHaveLength(2);
    expect(detail.history[0]).toMatchObject({
      previousStatus: "ACCEPTED",
      newStatus: "DECLINED",
      previousResponse: {
        attendingMemberIds: [singlePublic.invitation.members[0]!.id],
      },
      newResponse: { attendingMemberIds: [] },
    });

    const dashboard = await new EventsService(prismaService, access).dashboard(
      principal,
      event.id,
    );
    expect(dashboard).toMatchObject({
      expectedAttendees: 4,
      rsvp: {
        acceptedGroups: 1,
        partialGroups: 1,
        declinedGroups: 1,
        pendingGroups: 0,
      },
    });
  });

  it("serializes concurrent edits without losing member coverage or aggregate consistency", async () => {
    const { owner, event, principal } = await openEvent(
      "concurrent-rsvp-owner",
    );
    const invitation = await createInvitation({
      eventId: event.id,
      ownerId: owner.id,
      invitationType: "NAMED_GROUP",
      members: [
        { name: "One", isPrimary: true },
        { name: "Two", isPrimary: false },
        { name: "Three", isPrimary: false },
      ],
    });
    const accessLink = await service.issueCapability(
      principal,
      event.id,
      invitation.id,
      {},
    );
    const publicInvitation = await service.getPublicInvitation(
      accessLink.token,
      "en",
    );
    const ids = publicInvitation.invitation.members.map(({ id }) => id);
    const results = await Promise.all([
      service.submitGuest(accessLink.token, "en", {
        submissionId: randomUUID(),
        attendingMemberIds: [ids[0]!],
        companionCount: 0,
      }),
      service.submitGuest(accessLink.token, "en", {
        submissionId: randomUUID(),
        attendingMemberIds: ids,
        companionCount: 0,
      }),
    ]);
    expect(results).toHaveLength(2);
    const persisted = await prisma.invitationGroup.findUniqueOrThrow({
      where: { id: invitation.id },
      include: { rsvp: { include: { members: true } } },
    });
    expect(persisted.rsvp?.members).toHaveLength(3);
    const attending =
      persisted.rsvp?.members.filter(({ attending }) => attending).length ?? 0;
    expect(persisted.expectedAttendees).toBe(attending);
    expect(persisted.rsvpStatus).toBe(
      attending === 3 ? "ACCEPTED" : "PARTIALLY_ACCEPTED",
    );
    expect(await prisma.rsvpHistory.count()).toBe(2);
    expect(await prisma.rsvpSubmission.count()).toBe(2);
  });

  it("attributes host-created and host-edited responses without weakening RSVP invariants", async () => {
    const { owner, event, principal } = await openEvent("host-rsvp-owner");
    const invitation = await createInvitation({
      eventId: event.id,
      ownerId: owner.id,
      invitationType: "SINGLE",
      members: [{ name: "Host-assisted guest", isPrimary: true }],
    });
    const member = invitation.members[0]!;

    await expect(
      service.submitHost(principal, event.id, invitation.id, {
        submissionId: randomUUID(),
        attendingMemberIds: [member.id],
        companionCount: 0,
      }),
    ).resolves.toMatchObject({
      status: "ACCEPTED",
      changed: true,
      isEdited: false,
    });
    await expect(
      service.submitHost(principal, event.id, invitation.id, {
        submissionId: randomUUID(),
        attendingMemberIds: [],
        companionCount: 0,
      }),
    ).resolves.toMatchObject({
      status: "DECLINED",
      changed: true,
      isEdited: true,
    });

    const detail = await service.getHostRsvp(
      principal,
      event.id,
      invitation.id,
    );
    expect(detail.currentRsvp).toMatchObject({
      status: "DECLINED",
      source: "HOST_MANUAL",
      isEdited: true,
    });
    expect(detail.history).toHaveLength(2);
    expect(detail.history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "HOST_MANUAL",
          actorReference: owner.id,
        }),
      ]),
    );
    expect(
      await prisma.auditLog.count({
        where: {
          eventId: event.id,
          actorUserId: owner.id,
          action: { in: ["rsvp.created", "rsvp.edited"] },
        },
      }),
    ).toBe(2);
    expect(queuedConfirmationIds).toHaveLength(2);
  });

  it("honors closed/completed policy while retaining exact retry idempotency", async () => {
    const { owner, event, principal } = await openEvent("policy-owner");
    const invitation = await createInvitation({
      eventId: event.id,
      ownerId: owner.id,
      invitationType: "SINGLE",
      members: [{ name: "Policy guest", isPrimary: true }],
    });
    const capability = await service.issueCapability(
      principal,
      event.id,
      invitation.id,
      {},
    );
    const publicInvitation = await service.getPublicInvitation(
      capability.token,
      "en",
    );
    const input = {
      submissionId: randomUUID(),
      attendingMemberIds: [publicInvitation.invitation.members[0]!.id],
      companionCount: 0,
    };
    const accepted = await service.submitGuest(capability.token, "en", input);
    await prisma.event.update({
      where: { id: event.id },
      data: { allowRsvpEdits: false },
    });
    await expect(
      service.submitGuest(capability.token, "en", input),
    ).resolves.toEqual(accepted);
    await expect(
      service.submitGuest(capability.token, "en", {
        submissionId: randomUUID(),
        attendingMemberIds: [],
        companionCount: 0,
      }),
    ).rejects.toMatchObject({ response: { code: "RSVP_NOT_EDITABLE" } });
    expect(
      (await service.getPublicInvitation(capability.token, "en")).policy,
    ).toMatchObject({
      lifecycleState: "OPEN",
      canEdit: false,
      reason: "EDITS_DISABLED",
    });

    await prisma.event.update({
      where: { id: event.id },
      data: { status: "COMPLETED" },
    });
    expect(
      (await service.getPublicInvitation(capability.token, "en")).policy,
    ).toMatchObject({
      lifecycleState: "COMPLETED",
      canRespond: false,
      canEdit: false,
    });
  });

  it("rejects incomplete and companion-only RSVP rows at commit", async () => {
    const { owner, event } = await openEvent("constraint-owner");
    const single = await createInvitation({
      eventId: event.id,
      ownerId: owner.id,
      invitationType: "SINGLE",
      members: [{ name: "Constraint guest", isPrimary: true }],
    });
    await expect(
      prisma.$transaction(async (transaction) => {
        await transaction.rsvp.create({
          data: {
            invitationGroupId: single.id,
            status: "ACCEPTED",
            source: "SYSTEM",
          },
        });
        await transaction.invitationGroup.update({
          where: { id: single.id },
          data: { rsvpStatus: "ACCEPTED", expectedAttendees: 1 },
        });
      }),
    ).rejects.toBeDefined();
    expect(await prisma.rsvp.count()).toBe(0);

    const companions = await createInvitation({
      eventId: event.id,
      ownerId: owner.id,
      invitationType: "PRIMARY_WITH_COMPANIONS",
      maxCompanions: 2,
      members: [{ name: "Primary", isPrimary: true }],
      phoneOffset: 2,
    });
    const member = await prisma.guestMember.findFirstOrThrow({
      where: { invitationGroupId: companions.id },
    });
    await expect(
      prisma.$transaction(async (transaction) => {
        const response = await transaction.rsvp.create({
          data: {
            invitationGroupId: companions.id,
            status: "ACCEPTED",
            companionCount: 1,
            source: "SYSTEM",
          },
        });
        await transaction.rsvpMember.create({
          data: {
            invitationGroupId: companions.id,
            rsvpId: response.id,
            guestMemberId: member.id,
            attending: false,
          },
        });
        await transaction.invitationGroup.update({
          where: { id: companions.id },
          data: { rsvpStatus: "ACCEPTED", expectedAttendees: 1 },
        });
      }),
    ).rejects.toBeDefined();
  });

  it("ignores WhatsApp replies whose immutable invitation binding is stale", async () => {
    const { owner, event } = await openEvent("stale-binding-owner");
    const invitation = await createInvitation({
      eventId: event.id,
      ownerId: owner.id,
      invitationType: "SINGLE",
      members: [{ name: "Original guest", isPrimary: true }],
    });
    const { message, webhook } = await createWhatsappFixture(
      owner.id,
      event.id,
      invitation.id,
    );
    await prisma.$transaction(async (transaction) => {
      await transaction.guestMember.deleteMany({
        where: { invitationGroupId: invitation.id },
      });
      await transaction.guestMember.create({
        data: {
          invitationGroupId: invitation.id,
          name: "Original guest",
          isPrimary: true,
          position: 1,
        },
      });
    });
    const repository = new PrismaMessagingRepository(prisma, {
      mediaPublicApiBaseUrl: "https://api.example.test/api/v1",
      mediaSigningSecret: "stage7-media-signing-secret-123456789",
      mediaUrlTtlSeconds: 900,
    });

    await expect(
      repository.applyWebhook(webhook.id, {
        kind: "RESPONSE",
        contextProviderMessageId: message.providerMessageId!,
        occurredAt: new Date("2026-09-11T12:00:00.000Z"),
        responseType: "BUTTON",
        responseValue: "ATTEND",
      }),
    ).resolves.toBe("APPLIED");

    expect(await prisma.rsvp.count()).toBe(0);
    expect(await prisma.rsvpHistory.count()).toBe(0);
    expect(await prisma.rsvpConfirmation.count()).toBe(0);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { eventId: event.id, action: "message.webhook_applied" },
    });
    expect(JSON.stringify(audit.metadata)).toContain(
      "STALE_INVITATION_SNAPSHOT",
    );
  });

  it("prevents a delayed WhatsApp reply from overwriting a newer host response", async () => {
    const { owner, event, principal } = await openEvent("stale-reply-owner");
    const invitation = await createInvitation({
      eventId: event.id,
      ownerId: owner.id,
      invitationType: "SINGLE",
      members: [{ name: "Chronology guest", isPrimary: true }],
    });
    const { message, webhook } = await createWhatsappFixture(
      owner.id,
      event.id,
      invitation.id,
    );
    const hostResponse = await service.submitHost(
      principal,
      event.id,
      invitation.id,
      {
        submissionId: randomUUID(),
        attendingMemberIds: [invitation.members[0]!.id],
        companionCount: 0,
      },
    );
    const repository = new PrismaMessagingRepository(prisma, {
      mediaPublicApiBaseUrl: "https://api.example.test/api/v1",
      mediaSigningSecret: "stage7-media-signing-secret-123456789",
      mediaUrlTtlSeconds: 900,
    });
    const delayedAt = new Date(
      new Date(hostResponse.respondedAt).getTime() - 60_000,
    );

    await expect(
      repository.applyWebhook(webhook.id, {
        kind: "RESPONSE",
        contextProviderMessageId: message.providerMessageId!,
        occurredAt: delayedAt,
        responseType: "BUTTON",
        responseValue: "DECLINE",
      }),
    ).resolves.toBe("APPLIED");

    expect(
      await prisma.invitationGroup.findUniqueOrThrow({
        where: { id: invitation.id },
      }),
    ).toMatchObject({ rsvpStatus: "ACCEPTED", expectedAttendees: 1 });
    expect(await prisma.rsvpHistory.count()).toBe(1);
    expect(await prisma.rsvpConfirmation.count()).toBe(1);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { eventId: event.id, action: "message.webhook_applied" },
    });
    expect(JSON.stringify(audit.metadata)).toContain("STALE_RSVP_RESPONSE");
  });

  it("orders same-second WhatsApp replies by durable ingestion sequence", async () => {
    const { owner, event } = await openEvent("same-second-reply-owner");
    const invitation = await createInvitation({
      eventId: event.id,
      ownerId: owner.id,
      invitationType: "SINGLE",
      members: [{ name: "Same second guest", isPrimary: true }],
    });
    const { message, webhook: earlier } = await createWhatsappFixture(
      owner.id,
      event.id,
      invitation.id,
    );
    const later = await createResponseWebhook("stage7-same-second-later", "4");
    expect(later.ingestionSequence).toBeGreaterThan(earlier.ingestionSequence);
    const repository = new PrismaMessagingRepository(prisma, {
      mediaPublicApiBaseUrl: "https://api.example.test/api/v1",
      mediaSigningSecret: "stage7-media-signing-secret-123456789",
      mediaUrlTtlSeconds: 900,
    });
    const occurredAt = new Date("2026-09-11T12:00:00.000Z");

    await repository.applyWebhook(later.id, {
      kind: "RESPONSE",
      contextProviderMessageId: message.providerMessageId!,
      occurredAt,
      responseType: "BUTTON",
      responseValue: "DECLINE",
    });
    await repository.applyWebhook(earlier.id, {
      kind: "RESPONSE",
      contextProviderMessageId: message.providerMessageId!,
      occurredAt,
      responseType: "BUTTON",
      responseValue: "ATTEND",
    });

    expect(
      await prisma.invitationGroup.findUniqueOrThrow({
        where: { id: invitation.id },
      }),
    ).toMatchObject({ rsvpStatus: "DECLINED", expectedAttendees: 0 });
    expect(await prisma.rsvpHistory.count()).toBe(1);
  });

  it("serializes rapid RSVP confirmations per invitation", async () => {
    const { owner, event, principal } = await openEvent(
      "confirmation-order-owner",
    );
    const invitation = await createInvitation({
      eventId: event.id,
      ownerId: owner.id,
      invitationType: "SINGLE",
      members: [{ name: "Confirmation order guest", isPrimary: true }],
    });
    await service.submitHost(principal, event.id, invitation.id, {
      submissionId: randomUUID(),
      attendingMemberIds: [invitation.members[0]!.id],
      companionCount: 0,
    });
    const repository = new PrismaMessagingRepository(prisma, {
      mediaPublicApiBaseUrl: "https://api.example.test/api/v1",
      mediaSigningSecret: "stage7-media-signing-secret-123456789",
      mediaUrlTtlSeconds: 900,
    });
    const first = await prisma.rsvpConfirmation.findFirstOrThrow({
      where: { invitationGroupId: invitation.id },
      orderBy: { sequence: "asc" },
    });
    const firstClaim = await repository.claimRsvpConfirmation(first.id, 5);
    expect(firstClaim.outcome).toBe("SEND");
    if (firstClaim.outcome !== "SEND") throw new Error("Expected send claim");

    await service.submitHost(principal, event.id, invitation.id, {
      submissionId: randomUUID(),
      attendingMemberIds: [],
      companionCount: 0,
    });
    const second = await prisma.rsvpConfirmation.findFirstOrThrow({
      where: { invitationGroupId: invitation.id, id: { not: first.id } },
    });
    await expect(
      repository.claimRsvpConfirmation(second.id, 5),
    ).resolves.toMatchObject({
      outcome: "DEFER",
      reason: "EARLIER_CONFIRMATION_SENDING",
    });

    await repository.recordRsvpConfirmationAccepted(firstClaim, {
      provider: "META_WHATSAPP",
      providerMessageId: "wamid.stage7.first-confirmation",
      acceptedAt: new Date(),
    });
    await expect(
      repository.claimRsvpConfirmation(second.id, 5),
    ).resolves.toMatchObject({ outcome: "SEND" });
  });

  it("maps a snapshotted WhatsApp button once and sends its durable confirmation once", async () => {
    const { owner, event } = await openEvent("whatsapp-rsvp-owner");
    const invitation = await createInvitation({
      eventId: event.id,
      ownerId: owner.id,
      invitationType: "SINGLE",
      members: [{ name: "WhatsApp guest", isPrimary: true }],
    });
    const { message, webhook } = await createWhatsappFixture(
      owner.id,
      event.id,
      invitation.id,
    );
    await prisma.invitationGroup.update({
      where: { id: invitation.id },
      data: {
        displayName: "A replacement contact",
        phoneE164: "+966555559999",
      },
    });
    const repository = new PrismaMessagingRepository(prisma, {
      mediaPublicApiBaseUrl: "https://api.example.test/api/v1",
      mediaSigningSecret: "stage7-media-signing-secret-123456789",
      mediaUrlTtlSeconds: 900,
      rsvpConfirmationTemplateAr: "dawah_rsvp_confirmation_ar",
      rsvpConfirmationTemplateEn: "dawah_rsvp_confirmation_en",
    });
    await expect(
      repository.applyWebhook(webhook.id, {
        kind: "RESPONSE",
        contextProviderMessageId: message.providerMessageId!,
        occurredAt: new Date("2026-09-11T12:00:00.000Z"),
        responseType: "BUTTON",
        responseValue: "ATTEND",
      }),
    ).resolves.toBe("APPLIED");
    expect(
      await prisma.invitationGroup.findUniqueOrThrow({
        where: { id: invitation.id },
      }),
    ).toMatchObject({ rsvpStatus: "ACCEPTED", expectedAttendees: 1 });
    expect(await prisma.rsvpHistory.count()).toBe(1);

    const reaffirmedAt = new Date("2026-09-11T12:03:00.000Z");
    const reaffirmation = await createResponseWebhook(
      "stage7-response-reaffirmed",
      "2",
    );
    await expect(
      repository.applyWebhook(reaffirmation.id, {
        kind: "RESPONSE",
        contextProviderMessageId: message.providerMessageId!,
        occurredAt: reaffirmedAt,
        responseType: "BUTTON",
        responseValue: "ATTEND",
      }),
    ).resolves.toBe("APPLIED");
    expect(
      await prisma.rsvp.findUniqueOrThrow({
        where: { invitationGroupId: invitation.id },
      }),
    ).toMatchObject({ respondedAt: reaffirmedAt });

    const delayed = await createResponseWebhook(
      "stage7-response-delayed-after-reaffirmation",
      "3",
    );
    await expect(
      repository.applyWebhook(delayed.id, {
        kind: "RESPONSE",
        contextProviderMessageId: message.providerMessageId!,
        occurredAt: new Date("2026-09-11T12:02:00.000Z"),
        responseType: "BUTTON",
        responseValue: "DECLINE",
      }),
    ).resolves.toBe("APPLIED");
    expect(
      await prisma.invitationGroup.findUniqueOrThrow({
        where: { id: invitation.id },
      }),
    ).toMatchObject({ rsvpStatus: "ACCEPTED", expectedAttendees: 1 });
    expect(await prisma.rsvpHistory.count()).toBe(1);
    expect(await prisma.rsvpConfirmation.count()).toBe(1);

    const confirmation = await prisma.rsvpConfirmation.findFirstOrThrow();
    expect(confirmation).toMatchObject({
      status: "QUEUED",
      attemptCount: 0,
      recipientPhoneE164: message.recipientPhoneE164,
      templateVariables: expect.objectContaining({
        guest_name: "WhatsApp guest",
      }),
    });

    const sendConfirmation = vi.fn(async () => ({
      provider: "META_WHATSAPP" as const,
      providerMessageId: "wamid.stage7.confirmation",
      acceptedAt: new Date("2026-09-11T12:00:01.000Z"),
    }));
    const provider: MessagingProvider = {
      sendInvitation: sendConfirmation,
      sendReminder: sendConfirmation,
      sendConfirmation,
    };
    const processor = createWhatsappSendProcessor({
      repository,
      provider,
      maximumAttempts: 5,
      enqueueMessages: async () => undefined,
    });
    await expect(
      processor({
        data: {
          operation: "SEND_RSVP_CONFIRMATION",
          confirmationId: confirmation.id,
        },
      } as never),
    ).resolves.toMatchObject({ outcome: "ACCEPTED" });
    await expect(
      processor({
        data: {
          operation: "SEND_RSVP_CONFIRMATION",
          confirmationId: confirmation.id,
        },
      } as never),
    ).resolves.toMatchObject({ outcome: "SKIPPED" });
    expect(sendConfirmation).toHaveBeenCalledTimes(1);
    expect(
      await prisma.rsvpConfirmation.findUniqueOrThrow({
        where: { id: confirmation.id },
      }),
    ).toMatchObject({
      status: "SENT",
      attemptCount: 1,
      providerMessageId: "wamid.stage7.confirmation",
    });
    await expect(
      repository.applyWebhook(webhook.id, {
        kind: "RESPONSE",
        contextProviderMessageId: message.providerMessageId!,
        occurredAt: new Date("2026-09-11T12:00:00.000Z"),
        responseType: "BUTTON",
        responseValue: "ATTEND",
      }),
    ).resolves.toBe("IGNORED");
    expect(await prisma.rsvpHistory.count()).toBe(1);
  });
});

async function openEvent(authProviderId: string) {
  const owner = await createUserFixture(prisma, { authProviderId });
  const event = await createEventFixture(prisma, owner);
  const updated = await prisma.event.update({
    where: { id: event.id },
    data: {
      status: "RSVP_OPEN",
      rsvpDeadline: new Date("2027-01-14T00:00:00.000Z"),
      allowRsvpEdits: true,
    },
  });
  return {
    owner,
    event: updated,
    principal: { subject: owner.authProviderId },
  };
}

async function createInvitation(input: {
  eventId: string;
  ownerId: string;
  invitationType: "SINGLE" | "NAMED_GROUP" | "PRIMARY_WITH_COMPANIONS";
  members: readonly { readonly name: string; readonly isPrimary: boolean }[];
  maxCompanions?: number;
  phoneOffset?: number;
  internalNote?: string;
}) {
  return prisma.$transaction(async (transaction) =>
    transaction.invitationGroup.create({
      data: {
        eventId: input.eventId,
        displayName: input.members[0]!.name,
        contactName: input.members[0]!.name,
        phoneE164: `+9665555555${String(input.phoneOffset ?? 0).padStart(2, "0")}`,
        phoneCountry: "SA",
        invitationType: input.invitationType,
        maxCompanions: input.maxCompanions ?? 0,
        internalNote: input.internalNote,
        createdBy: input.ownerId,
        members: {
          create: input.members.map((member, index) => ({
            ...member,
            position: index + 1,
          })),
        },
      },
      include: { members: { orderBy: { position: "asc" } } },
    }),
  );
}

async function createWhatsappFixture(
  ownerId: string,
  eventId: string,
  invitationGroupId: string,
) {
  const template = await prisma.invitationTemplate.create({
    data: {
      eventId,
      createdBy: ownerId,
      templateKey: "stage7-whatsapp",
      version: 1,
      locale: "en",
      status: "APPROVED",
      displayName: "Stage 7 WhatsApp",
      providerTemplateName: "wedding_invitation_en",
      bodyTemplate: "Hello {{guest_name}}",
      variableSchema: ["guest_name"],
      interactiveComponents: ["ATTEND", "DECLINE"],
      contentHash: "a".repeat(64),
      approvedAt: new Date(),
    },
  });
  const invitation = await prisma.invitationGroup.findUniqueOrThrow({
    where: { id: invitationGroupId },
    include: { members: { orderBy: { position: "asc" } } },
  });
  const renderedContent = {
    renderedBody: "Hello WhatsApp guest",
    recipientName: "WhatsApp guest",
    rsvpBinding: {
      version: 1,
      invitationId: invitation.id,
      invitationType: invitation.invitationType,
      memberIds: invitation.members.map(({ id }) => id),
      maxCompanions: invitation.maxCompanions,
    },
    replyActions: [
      {
        id: "ATTEND",
        label: "I will attend",
        intent: "ATTEND",
        attendingMemberCount: 1,
        companionCount: 0,
        expectedAttendeeCount: 1,
      },
      {
        id: "DECLINE",
        label: "Decline",
        intent: "DECLINE",
        attendingMemberCount: 0,
        companionCount: 0,
        expectedAttendeeCount: 0,
      },
    ],
  };
  const snapshot = await prisma.invitationContentSnapshot.create({
    data: {
      eventId,
      invitationGroupId,
      templateId: template.id,
      templateVersion: 1,
      locale: "en",
      createdBy: ownerId,
      variables: { guest_name: "WhatsApp guest" },
      renderedBody: "Hello WhatsApp guest",
      renderedContent,
      readinessResult: { ready: true, issues: [] },
      isReady: true,
      sourceHash: "b".repeat(64),
      contentHash: "c".repeat(64),
    },
  });
  const batch = await prisma.sendBatch.create({
    data: {
      eventId,
      createdBy: ownerId,
      status: "IN_PROGRESS",
      requestHash: "d".repeat(64),
      selectionHash: "e".repeat(64),
      confirmationHash: "f".repeat(64),
      totalMessages: 1,
      estimatedCreditUnits: 1,
      startedAt: new Date(),
    },
  });
  const message = await prisma.message.create({
    data: {
      eventId,
      sendBatchId: batch.id,
      invitationGroupId,
      contentSnapshotId: snapshot.id,
      providerMessageId: "wamid.stage7.invitation",
      status: "DELIVERED",
      recipientPhoneE164: invitation.phoneE164,
      providerTemplateName: "wedding_invitation_en",
      templateId: template.id,
      templateVersion: 1,
      locale: "en",
      templateVariables: { guest_name: "WhatsApp guest" },
      templateParameterOrder: ["guest_name"],
      renderedContent,
      sourceHash: snapshot.sourceHash,
      contentHash: snapshot.contentHash,
      sentAt: new Date(),
      deliveredAt: new Date(),
    },
  });
  const webhook = await prisma.webhookEvent.create({
    data: {
      provider: "META_WHATSAPP",
      providerEventId: "stage7-response-event",
      eventType: "messages",
      payload: { kind: "RESPONSE" },
      payloadHash: "1".repeat(64),
    },
  });
  return { message, webhook };
}

function createResponseWebhook(providerEventId: string, hashDigit: string) {
  return prisma.webhookEvent.create({
    data: {
      provider: "META_WHATSAPP",
      providerEventId,
      eventType: "messages",
      payload: { kind: "RESPONSE" },
      payloadHash: hashDigit.repeat(64),
    },
  });
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
