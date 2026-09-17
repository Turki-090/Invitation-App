import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { ConfigService } from "@nestjs/config";
import type { ApiEnvironment } from "@dawah/config";
import { Permission } from "@dawah/domain";
import type {
  MessagingProvider,
  MessagingTemplateSendInput,
} from "@dawah/messaging";
import { InMemoryObjectStorage } from "@dawah/storage";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  refundSendUsage,
  settleSendBatchReservation,
} from "../../../worker/src/credit-ledger";
import { createExportProcessor } from "../../../worker/src/export-processor";
import { PrismaExportRepository } from "../../../worker/src/prisma-export-repository";
import { PrismaMessagingRepository } from "../../../worker/src/prisma-messaging-repository";
import { createWhatsappSendProcessor } from "../../../worker/src/whatsapp-send-processor";
import { CheckInsService } from "../../src/check-ins/check-ins.service";
import { CreditsService } from "../../src/credits/credits.service";
import { EventAccessService } from "../../src/events/event-access.service";
import type { MessagingQueueService } from "../../src/messaging/messaging-queue.service";
import { MessagingService } from "../../src/messaging/messaging.service";
import { PreparationService } from "../../src/preparation/preparation.service";
import type { ExportsQueueService } from "../../src/exports/exports-queue.service";
import { ExportsService } from "../../src/exports/exports.service";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ReportsService } from "../../src/reports/reports.service";
import { RsvpService } from "../../src/rsvp/rsvp.service";
import { createCreditLedger } from "./credits";
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
const privateBucket = "dawah-private";
const exportSigningSecret = "stage9-export-download-signing-secret-value";
const checkInSigningSecret = "stage9-check-in-token-signing-secret-value";

describe("Stage 9 PostgreSQL reporting, exports, credits, and check-in integration", () => {
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

  it("reconciles the event report against its own source records", async () => {
    const owner = await createUserFixture(prisma, {
      authProviderId: "stage9-report-owner",
    });
    const event = await createEventFixture(prisma, owner);
    const principal = { subject: owner.authProviderId };
    const accepted = await createInvitation(event.id, owner.id, 1, ["Sara"], {
      maxCompanions: 1,
    });
    await respond(principal, event.id, accepted, { companionCount: 1 });
    const partial = await createInvitation(event.id, owner.id, 2, [
      "Ahmed",
      "Noura",
    ]);
    await respond(principal, event.id, partial, {
      attendingMemberIds: [partial.members[0]!.id],
    });
    const declined = await createInvitation(event.id, owner.id, 3, ["Faisal"]);
    await respond(principal, event.id, declined, { attendingMemberIds: [] });
    await createInvitation(event.id, owner.id, 4, ["Mona"]);
    const cancelled = await createInvitation(event.id, owner.id, 5, ["Old"]);
    await prisma.invitationGroup.update({
      where: { id: cancelled.id },
      data: { cancelledAt: new Date() },
    });
    await prisma.checkInState.create({
      data: {
        eventId: event.id,
        invitationGroupId: accepted.id,
        checkedInCount: 1,
        firstCheckedInAt: new Date(),
        lastCheckedInAt: new Date(),
      },
    });

    const report = await new ReportsService(prismaService, access).get(
      principal,
      event.id,
    );

    const [activeGroups, namedGuests, expectedAttendance] = await Promise.all([
      prisma.invitationGroup.count({
        where: { eventId: event.id, cancelledAt: null },
      }),
      prisma.guestMember.count({
        where: { invitationGroup: { eventId: event.id, cancelledAt: null } },
      }),
      prisma.invitationGroup.aggregate({
        where: { eventId: event.id, cancelledAt: null },
        _sum: { expectedAttendees: true },
      }),
    ]);
    expect(report.invitationGroups.active).toBe(activeGroups);
    expect(report.invitationGroups.cancelled).toBe(1);
    expect(report.namedGuests).toBe(namedGuests);
    expect(report.expectedAttendance).toBe(
      expectedAttendance._sum.expectedAttendees ?? 0,
    );
    expect(report.rsvp).toEqual({
      acceptedGroups: 1,
      partiallyAcceptedGroups: 1,
      declinedGroups: 1,
      pendingGroups: 1,
    });
    expect(report.checkIn).toMatchObject({
      checkedInGroups: 1,
      checkedInAttendees: 1,
      noShowAttendees: null,
    });
    expect(
      report.checkIn.checkedInAttendees + report.checkIn.notArrivedAttendees,
    ).toBe(report.expectedAttendance);
  });

  it("builds a private export in the background and serves it only to its requester", async () => {
    const owner = await createUserFixture(prisma, {
      authProviderId: "stage9-export-owner",
    });
    const other = await createUserFixture(prisma, {
      authProviderId: "stage9-export-other",
    });
    const event = await createEventFixture(prisma, owner, {
      member: owner,
    });
    // A second member who may export in their own right: the file still must
    // not be visible to them, because visibility is per requester.
    await prisma.eventMembership.create({
      data: {
        eventId: event.id,
        userId: other.id,
        role: "CO_HOST",
        status: "ACTIVE",
        acceptedAt: new Date(),
        permissionsJson: {
          mode: "CUSTOM",
          permissions: [Permission.EVENT_VIEW, Permission.GUEST_EXPORT],
        },
      },
    });
    const confirmed = await createInvitation(event.id, owner.id, 10, ["Sara"], {
      maxCompanions: 1,
    });
    await respond({ subject: owner.authProviderId }, event.id, confirmed, {
      companionCount: 1,
    });
    await createInvitation(event.id, owner.id, 11, ["Ahmed"]);

    const storage = new InMemoryObjectStorage();
    const enqueued: { eventId: string; exportJobId: string }[] = [];
    const exports = new ExportsService(
      prismaService,
      access,
      {
        enqueue: vi.fn(
          async (data: { eventId: string; exportJobId: string }) => {
            enqueued.push(data);
          },
        ),
      } as unknown as ExportsQueueService,
      storage,
      exportConfig(),
    );
    const ownerPrincipal = { subject: owner.authProviderId };

    const requested = await exports.create(ownerPrincipal, event.id, {
      format: "CSV",
      preset: "FULL_GUEST_LIST",
    });
    expect(requested.status).toBe("QUEUED");
    expect(enqueued).toEqual([
      { eventId: event.id, exportJobId: requested.id },
    ]);

    const processor = createExportProcessor({
      privateBucket,
      repository: new PrismaExportRepository(prisma),
      retentionHours: 168,
      storage,
    });
    await expect(
      processor({ data: enqueued[0]!, name: "generate" }),
    ).resolves.toMatchObject({ outcome: "COMPLETED", rowCount: 2 });

    const completed = await exports.get(ownerPrincipal, event.id, requested.id);
    expect(completed).toMatchObject({ status: "COMPLETED", rowCount: 2 });
    const url = new URL(completed.output!.downloadUrl, "https://api.test");
    const file = await exports.download(
      ownerPrincipal,
      event.id,
      requested.id,
      {
        expires: Number(url.searchParams.get("expires")),
        signature: url.searchParams.get("signature")!,
      },
    );
    expect(new TextDecoder().decode(file.body)).toContain("Sara");

    // A second member of the same event cannot see or download the file.
    await expect(
      exports.get({ subject: other.authProviderId }, event.id, requested.id),
    ).rejects.toMatchObject({ response: { code: "EXPORT_NOT_FOUND" } });

    await expect(
      prisma.notification.findFirst({
        where: { eventId: event.id, kind: "EXPORT_READY" },
      }),
    ).resolves.toMatchObject({ userId: owner.id, sourceId: requested.id });

    // Replaying the same queue job must not produce a second file.
    await expect(
      processor({ data: enqueued[0]!, name: "generate" }),
    ).resolves.toMatchObject({
      outcome: "SKIPPED",
      reason: "ALREADY_PROCESSED",
    });
    expect(
      await prisma.storedAsset.count({
        where: { eventId: event.id, kind: "GENERATED_FILE" },
      }),
    ).toBe(1);
  });

  it("fails an export whose requester lost export permission", async () => {
    const owner = await createUserFixture(prisma, {
      authProviderId: "stage9-export-revoked-owner",
    });
    const staff = await createUserFixture(prisma, {
      authProviderId: "stage9-export-revoked-staff",
    });
    const event = await createEventFixture(prisma, owner);
    const membership = await prisma.eventMembership.create({
      data: {
        eventId: event.id,
        userId: staff.id,
        role: "CO_HOST",
        status: "ACTIVE",
        acceptedAt: new Date(),
        permissionsJson: {
          mode: "CUSTOM",
          permissions: [Permission.EVENT_VIEW, Permission.GUEST_EXPORT],
        },
      },
    });
    const storage = new InMemoryObjectStorage();
    const enqueued: { eventId: string; exportJobId: string }[] = [];
    const exports = new ExportsService(
      prismaService,
      access,
      {
        enqueue: vi.fn(
          async (data: { eventId: string; exportJobId: string }) => {
            enqueued.push(data);
          },
        ),
      } as unknown as ExportsQueueService,
      storage,
      exportConfig(),
    );

    const requested = await exports.create(
      { subject: staff.authProviderId },
      event.id,
      { format: "CSV", preset: "FULL_GUEST_LIST" },
    );
    await prisma.eventMembership.update({
      where: { id: membership.id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });

    const processor = createExportProcessor({
      privateBucket,
      repository: new PrismaExportRepository(prisma),
      retentionHours: 168,
      storage,
    });
    await expect(
      processor({ data: enqueued[0]!, name: "generate" }),
    ).resolves.toMatchObject({ outcome: "FAILED", reason: "ACCESS_REVOKED" });

    await expect(
      prisma.exportJob.findUniqueOrThrow({ where: { id: requested.id } }),
    ).resolves.toMatchObject({
      status: "FAILED",
      failureCode: "EXPORT_ACCESS_REVOKED",
    });
    expect(storage.objectCount).toBe(0);
  });

  it("charges each logical send once and never lets the balance go negative", async () => {
    const owner = await createUserFixture(prisma, {
      authProviderId: "stage9-credit-owner",
    });
    const event = await createEventFixture(prisma, owner);
    await createInvitation(event.id, owner.id, 40, ["Sara"]);
    const principal = { subject: owner.authProviderId };
    const ledger = createCreditLedger(prismaService, { billingEnabled: true });
    const credits = new CreditsService(prismaService, access, ledger);

    await prisma.$transaction((transaction) =>
      ledger.recordPurchase(transaction, {
        actorUserId: owner.id,
        eventId: event.id,
        referenceId: "stage9-grant",
        referenceType: "Payment",
        units: 5,
      }),
    );
    await expect(credits.overview(principal, event.id)).resolves.toMatchObject({
      balanceUnits: 5,
      availableUnits: 5,
    });

    // The database refuses a ledger entry that would take the balance negative,
    // whatever the application asks for.
    await expect(
      prisma.creditLedgerEntry.create({
        data: {
          eventId: event.id,
          creditAccountId: (
            await prisma.creditAccount.findUniqueOrThrow({
              where: { eventId: event.id },
            })
          ).id,
          entryType: "SEND_USAGE",
          units: -50,
          referenceType: "Manual",
          referenceId: "stage9-overdraft",
        },
      }),
    ).rejects.toThrow();

    const preparation = new PreparationService(prismaService, access);
    const draft = await preparation.createTemplate(principal, event.id, {
      name: "Stage 9 invitation",
      purpose: "INVITATION",
      locale: "en",
      body: "Hello {{guest_name}}, you are invited to {{event_name}}.",
      providerTemplateName: "stage9_invitation_en",
    });
    const template = await preparation.approveTemplate(
      principal,
      event.id,
      draft.id,
      { expectedVersion: draft.version },
    );
    await preparation.createSnapshots(principal, event.id, {
      templateId: template.id,
    });
    const messaging = new MessagingService(
      prismaService,
      access,
      {
        enqueueBatch: vi.fn().mockResolvedValue(undefined),
        enqueueRsvpConfirmation: vi.fn().mockResolvedValue(undefined),
      } as unknown as MessagingQueueService,
      ledger,
    );
    const readiness = await messaging.readiness(principal, event.id, {
      templateId: template.id,
    });
    const batch = await messaging.createBatch(
      principal,
      event.id,
      {
        templateId: template.id,
        confirmationToken: readiness.confirmationToken,
      },
      "stage9-launch-0001",
    );

    // The launch holds exactly what it will owe.
    await expect(
      prisma.creditReservation.findFirstOrThrow({
        where: { eventId: event.id },
      }),
    ).resolves.toMatchObject({
      referenceId: batch.id,
      referenceType: "SendBatch",
      status: "ACTIVE",
      units: 1,
    });
    await expect(credits.overview(principal, event.id)).resolves.toMatchObject({
      balanceUnits: 5,
      reservedUnits: 1,
      availableUnits: 4,
      activeReservationCount: 1,
    });

    const message = await prisma.message.findFirstOrThrow({
      where: { sendBatchId: batch.id },
    });

    // The charge happens where production puts it: inside the worker
    // transaction that records the provider's acceptance. Replaying the send
    // job must not charge or release a second unit.
    const dispatched: string[] = [];
    const sendProcessor = createWhatsappSendProcessor({
      repository: messagingRepository(),
      provider: acceptingProvider(),
      maximumAttempts: 5,
      enqueueMessages: async (ids) => {
        dispatched.push(...ids);
      },
    });
    await expect(
      sendProcessor({
        data: { operation: "DISPATCH_BATCH", batchId: batch.id },
      } as never),
    ).resolves.toMatchObject({ outcome: "DISPATCHED", count: 1 });
    expect(dispatched).toEqual([message.id]);
    await expect(
      sendProcessor({
        data: { operation: "SEND_MESSAGE", messageId: message.id },
      } as never),
    ).resolves.toMatchObject({ outcome: "ACCEPTED" });
    await expect(
      sendProcessor({
        data: { operation: "SEND_MESSAGE", messageId: message.id },
      } as never),
    ).resolves.toMatchObject({ outcome: "SKIPPED" });
    await expect(
      prisma.message.findUniqueOrThrow({ where: { id: message.id } }),
    ).resolves.toMatchObject({ status: "SENT" });
    expect(
      await prisma.creditLedgerEntry.count({
        where: { eventId: event.id, entryType: "SEND_USAGE" },
      }),
    ).toBe(1);
    await expect(
      prisma.creditReservation.findFirstOrThrow({
        where: { eventId: event.id },
      }),
    ).resolves.toMatchObject({ status: "CONSUMED" });
    await expect(credits.overview(principal, event.id)).resolves.toMatchObject({
      balanceUnits: 4,
      reservedUnits: 0,
      availableUnits: 4,
      reconciliation: {
        logicalMessageUnits: 1,
        chargedMessageUnits: 1,
        reconciled: true,
      },
    });

    await prisma.$transaction((transaction) =>
      refundSendUsage(transaction, {
        eventId: event.id,
        messageId: message.id,
        sendBatchId: batch.id,
        units: message.creditUnits,
        reasonCode: "PROVIDER_DELIVERY_FAILED",
      }),
    );
    // The reservation was consumed by its last charge, so settlement is a no-op.
    await prisma.$transaction((transaction) =>
      settleSendBatchReservation(transaction, {
        eventId: event.id,
        sendBatchId: batch.id,
      }),
    );

    const settled = await credits.overview(principal, event.id);
    expect(settled).toMatchObject({
      balanceUnits: 5,
      reservedUnits: 0,
      availableUnits: 5,
      activeReservationCount: 0,
      reconciliation: { refundedUnits: 1, reconciled: true },
    });

    await expect(
      prisma.$transaction((transaction) =>
        ledger.reserveForSendBatch(transaction, {
          createdByUserId: owner.id,
          eventId: event.id,
          sendBatchId: randomUUID(),
          units: 50,
        }),
      ),
    ).rejects.toMatchObject({ response: { code: "INSUFFICIENT_CREDITS" } });

    const ledgerPage = await credits.ledgerEntries(principal, event.id, {
      page: 1,
      pageSize: 20,
    });
    expect(ledgerPage.items.map((entry) => entry.entryType)).toEqual([
      "REFUND",
      "SEND_USAGE",
      "PURCHASE",
    ]);
    // The ledger is append-only in the database, not only in the service.
    await expect(
      prisma.creditLedgerEntry.update({
        where: { id: ledgerPage.items[0]!.id },
        data: { units: 99 },
      }),
    ).rejects.toThrow();
  });

  it("handles concurrent and repeated scans without exceeding confirmed attendance", async () => {
    const owner = await createUserFixture(prisma, {
      authProviderId: "stage9-check-in-owner",
    });
    const event = await createEventFixture(prisma, owner);
    await prisma.event.update({
      where: { id: event.id },
      data: { qrEnabled: true, status: "EVENT_DAY" },
    });
    const invitation = await createInvitation(
      event.id,
      owner.id,
      20,
      ["Sara"],
      { maxCompanions: 2 },
    );
    await respond({ subject: owner.authProviderId }, event.id, invitation, {
      companionCount: 2,
    });
    const checkIns = new CheckInsService(
      prismaService,
      access,
      checkInConfig(),
    );
    const principal = { subject: owner.authProviderId };

    const concurrent = await Promise.allSettled(
      [1, 2, 3, 4].map((index) =>
        checkIns.checkIn(principal, event.id, `stage9-scan-${index}`, {
          attendeeCount: 1,
          invitationGroupId: invitation.id,
          source: "QR",
        }),
      ),
    );
    const recorded = concurrent.filter(
      (outcome) => outcome.status === "fulfilled",
    );
    expect(recorded.length).toBeGreaterThan(0);

    const state = await prisma.checkInState.findUniqueOrThrow({
      where: { invitationGroupId: invitation.id },
    });
    expect(state.checkedInCount).toBeLessThanOrEqual(3);
    const records = await prisma.checkInRecord.aggregate({
      where: { invitationGroupId: invitation.id },
      _sum: { attendeeCount: true },
    });
    expect(records._sum.attendeeCount ?? 0).toBe(state.checkedInCount);

    // A repeated idempotency key replays its stored result.
    const first = await checkIns
      .checkIn(principal, event.id, "stage9-scan-replay", {
        attendeeCount: 1,
        invitationGroupId: invitation.id,
        source: "QR",
      })
      .catch(() => null);
    if (first) {
      const replay = await checkIns.checkIn(
        principal,
        event.id,
        "stage9-scan-replay",
        { attendeeCount: 1, invitationGroupId: invitation.id, source: "QR" },
      );
      expect(replay).toMatchObject({
        idempotentReplay: true,
        checkedInAttendance: first.checkedInAttendance,
      });
    }

    // Once the party is complete, another scan reports a duplicate.
    await prisma.checkInState.update({
      where: { invitationGroupId: invitation.id },
      data: { checkedInCount: 3 },
    });
    const duplicate = await checkIns.checkIn(
      principal,
      event.id,
      "stage9-scan-duplicate",
      { attendeeCount: 1, invitationGroupId: invitation.id, source: "QR" },
    );
    expect(duplicate).toMatchObject({
      outcome: "ALREADY_CHECKED_IN",
      incrementedBy: 0,
      recordId: null,
    });

    const dashboard = await checkIns.dashboard(principal, event.id);
    expect(dashboard).toMatchObject({
      expectedAttendance: 3,
      checkedInAttendance: 3,
      remainingAttendance: 0,
      fullyCheckedInGroups: 1,
    });
    expect(dashboard.duplicateAttempts).toBeGreaterThanOrEqual(1);
  });

  it("issues one stable entry pass per invitation and resolves it on event day", async () => {
    const owner = await createUserFixture(prisma, {
      authProviderId: "stage9-pass-owner",
    });
    const event = await createEventFixture(prisma, owner);
    await prisma.event.update({
      where: { id: event.id },
      data: { qrEnabled: true, status: "EVENT_DAY" },
    });
    const invitation = await createInvitation(
      event.id,
      owner.id,
      30,
      ["Sara"],
      { maxCompanions: 1 },
    );
    await respond({ subject: owner.authProviderId }, event.id, invitation, {
      companionCount: 1,
    });
    const capabilityToken = randomBytes(32).toString("base64url");
    await prisma.publicInvitationCapability.create({
      data: {
        invitationGroupId: invitation.id,
        tokenHash: createHash("sha256")
          .update(capabilityToken, "utf8")
          .digest("hex"),
        expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
      },
    });
    const checkIns = new CheckInsService(
      prismaService,
      access,
      checkInConfig(),
    );

    const pass = await checkIns.issuePublicEntryPass(capabilityToken);
    const reissued = await checkIns.issuePublicEntryPass(capabilityToken);
    expect(reissued.token).toBe(pass.token);
    expect(pass.qrPayload).toBe(pass.token);
    expect(
      await prisma.entryPass.count({
        where: { invitationGroupId: invitation.id, revokedAt: null },
      }),
    ).toBe(1);

    const resolved = await checkIns.resolveEntryPass(
      { subject: owner.authProviderId },
      event.id,
      pass.token,
    );
    expect(resolved).toMatchObject({
      invitationGroupId: invitation.id,
      confirmedAttendance: 2,
      checkedInAttendance: 0,
      status: "NOT_ARRIVED",
    });

    // The stored pass never contains the token itself.
    const stored = await prisma.entryPass.findFirstOrThrow({
      where: { invitationGroupId: invitation.id },
    });
    expect(stored.tokenHash).not.toContain(pass.token);
    expect(stored.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });
});

function exportConfig(): ConfigService<ApiEnvironment, true> {
  return {
    get: vi.fn((key: string) =>
      key === "EXPORT_DOWNLOAD_SIGNING_SECRET" ? exportSigningSecret : 300,
    ),
  } as unknown as ConfigService<ApiEnvironment, true>;
}

function checkInConfig(): ConfigService<ApiEnvironment, true> {
  return {
    get: vi.fn((key: string) =>
      key === "CHECK_IN_ENABLED" ? true : checkInSigningSecret,
    ),
  } as unknown as ConfigService<ApiEnvironment, true>;
}

/**
 * Invitations are always created in the pending, zero-attendee state the
 * database requires of an invitation without an RSVP. Confirmed attendance is
 * then produced through the real host RSVP path so every aggregate,
 * history row and deferred constraint is satisfied exactly as in production.
 */
async function createInvitation(
  eventId: string,
  ownerId: string,
  phoneOffset: number,
  memberNames: readonly string[],
  overrides: { maxCompanions?: number } = {},
) {
  return prisma.invitationGroup.create({
    data: {
      eventId,
      displayName: memberNames.join(" and "),
      contactName: memberNames[0]!,
      phoneE164: `+9665666666${String(phoneOffset).padStart(2, "0")}`,
      phoneCountry: "SA",
      invitationType: overrides.maxCompanions
        ? "PRIMARY_WITH_COMPANIONS"
        : memberNames.length === 1
          ? "SINGLE"
          : "NAMED_GROUP",
      maxCompanions: overrides.maxCompanions ?? 0,
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

function rsvpService(): RsvpService {
  return new RsvpService(
    prismaService,
    access,
    {
      enqueueBatch: vi.fn().mockResolvedValue(undefined),
      enqueueRsvpConfirmation: vi.fn().mockResolvedValue(undefined),
    } as unknown as MessagingQueueService,
    {
      get: (key: string) =>
        key.endsWith("_AR")
          ? "dawah_rsvp_confirmation_ar"
          : "dawah_rsvp_confirmation_en",
    } as never,
  );
}

/** Records a host RSVP, which is what gives an invitation its attendance. */
async function respond(
  principal: { readonly subject: string },
  eventId: string,
  invitation: { readonly id: string; readonly members: { id: string }[] },
  options: {
    attendingMemberIds?: readonly string[];
    companionCount?: number;
  } = {},
) {
  return rsvpService().submitHost(principal, eventId, invitation.id, {
    submissionId: randomUUID(),
    attendingMemberIds: [
      ...(options.attendingMemberIds ??
        invitation.members.map((member) => member.id)),
    ],
    companionCount: options.companionCount ?? 0,
  });
}

function acceptingProvider(): MessagingProvider {
  const send = vi.fn(async (_input: MessagingTemplateSendInput) => ({
    provider: "META_WHATSAPP" as const,
    providerMessageId: `wamid.stage9.${randomUUID()}`,
    acceptedAt: new Date(),
  }));
  return { sendInvitation: send, sendReminder: send, sendConfirmation: send };
}

function messagingRepository(): PrismaMessagingRepository {
  return new PrismaMessagingRepository(prisma, {
    mediaPublicApiBaseUrl: "https://api.dawah.test/api/v1",
    mediaSigningSecret: "stage9-media-signing-secret-0123456789abcd",
    mediaUrlTtlSeconds: 900,
    rsvpConfirmationTemplateAr: "dawah_rsvp_confirmation_ar",
    rsvpConfirmationTemplateEn: "dawah_rsvp_confirmation_en",
  });
}
