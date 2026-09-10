import { createHash, createHmac, randomUUID } from "node:crypto";
import {
  MessagingProviderError,
  verifyWhatsappMediaSignature,
  type MessagingProvider,
  type MessagingTemplateSendInput,
} from "@dawah/messaging";
import {
  createProducerRedis,
  queueNames,
  whatsappMessageJobId,
  whatsappMessageJobs,
  type WhatsappSendJobData,
} from "@dawah/queue";
import { Queue } from "bullmq";
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
import { MessagingMediaService } from "../../src/messaging/messaging-media.service";
import type { MessagingQueueService } from "../../src/messaging/messaging-queue.service";
import { MessagingService } from "../../src/messaging/messaging.service";
import { WhatsappWebhookService } from "../../src/messaging/whatsapp-webhook.service";
import { PreparationService } from "../../src/preparation/preparation.service";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { PrismaMessagingRepository } from "../../../worker/src/prisma-messaging-repository";
import { createWhatsappSendProcessor } from "../../../worker/src/whatsapp-send-processor";
import { createWhatsappWebhookProcessor } from "../../../worker/src/whatsapp-webhook-processor";
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

describe("Stage 6 PostgreSQL messaging integration", () => {
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

  it("queues 2,000 logical sends idempotently and reconciles signed out-of-order webhooks", async () => {
    const owner = await createUserFixture(prisma, {
      authProviderId: "stage6-messaging-owner",
    });
    const event = await createEventFixture(prisma, owner);
    const invitationIds = Array.from({ length: 2_000 }, () => randomUUID());
    await prisma.$transaction(async (transaction) => {
      await transaction.invitationGroup.createMany({
        data: invitationIds.map((id, index) => ({
          id,
          eventId: event.id,
          displayName: `Guest ${index + 1}`,
          contactName: `Guest ${index + 1}`,
          phoneE164: `+96650${String(index).padStart(7, "0")}`,
          phoneCountry: "SA",
          invitationType: "SINGLE",
          createdBy: owner.id,
        })),
      });
      await transaction.guestMember.createMany({
        data: invitationIds.map((invitationGroupId, index) => ({
          invitationGroupId,
          name: `Guest ${index + 1}`,
          position: 1,
          isPrimary: true,
        })),
      });
    });
    const principal = { subject: owner.authProviderId };
    const invitationImage = Buffer.from("stage6 immutable invitation image");
    const invitationImageChecksum = createHash("sha256")
      .update(invitationImage)
      .digest("hex");
    const asset = await prisma.storedAsset.create({
      data: {
        eventId: event.id,
        createdBy: owner.id,
        kind: "INVITATION_ASSET",
        status: "READY",
        storageProvider: "s3-compatible",
        bucket: "dawah-private-test",
        objectKey: `events/${event.id}/invitation-assets/stage6.png`,
        originalFilename: "stage6.png",
        contentType: "image/png",
        byteSize: invitationImage.byteLength,
        sha256: invitationImageChecksum,
        imageWidth: 1,
        imageHeight: 1,
        uploadedAt: new Date(),
        validatedAt: new Date(),
      },
    });
    const preparation = new PreparationService(prismaService, access);
    const draft = await preparation.createTemplate(principal, event.id, {
      name: "Approved English WhatsApp invitation",
      locale: "en",
      body: "Hello {{guest_name}}, you are invited to {{event_name}}.",
      providerTemplateName: "wedding_invitation_en",
      assetId: asset.id,
    });
    const template = await preparation.approveTemplate(
      principal,
      event.id,
      draft.id,
      { expectedVersion: 1 },
    );
    const snapshots = await preparation.createSnapshots(principal, event.id, {
      templateId: template.id,
    });
    expect(snapshots).toMatchObject({
      createdCount: 2_000,
      blockedCount: 0,
    });
    await expect(
      prisma.storedAsset.update({
        where: { id: asset.id },
        data: { status: "DELETED", deletedAt: new Date() },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.storedAsset.findUniqueOrThrow({ where: { id: asset.id } }),
    ).resolves.toMatchObject({ status: "READY", deletedAt: null });

    const queues = queueRecorder();
    const messaging = new MessagingService(
      prismaService,
      access,
      queues.service,
    );
    const readiness = await messaging.readiness(principal, event.id, {
      templateId: template.id,
    });
    expect(readiness.summary).toEqual({
      selectedInvitations: 2_000,
      readyInvitations: 2_000,
      alreadySentInvitations: 0,
      blockedInvitations: 0,
      estimatedCreditUnits: 2_000,
    });
    expect(
      new Date(readiness.expiresAt).getTime() - Date.now(),
    ).toBeGreaterThan(5 * 60 * 1_000 - 5_000);

    const request = {
      templateId: template.id,
      confirmationToken: readiness.confirmationToken,
    };
    const [batch, replay] = await Promise.all([
      messaging.createBatch(principal, event.id, request, "stage6-launch-0001"),
      messaging.createBatch(principal, event.id, request, "stage6-launch-0001"),
    ]);
    expect(replay.id).toBe(batch.id);
    expect(queues.batchIds).toEqual([batch.id, batch.id]);
    expect(await prisma.sendBatch.count()).toBe(1);
    expect(await prisma.message.count()).toBe(2_000);
    expect(
      await prisma.message.aggregate({ _sum: { creditUnits: true } }),
    ).toMatchObject({ _sum: { creditUnits: 2_000 } });
    expect(await prisma.idempotencyRecord.count()).toBe(1);

    const mediaSigningSecret = "stage6-test-media-signing-secret-123456789";
    const repository = new PrismaMessagingRepository(prisma, {
      mediaPublicApiBaseUrl: "https://api.dawah.sa/api/v1",
      mediaSigningSecret,
      mediaUrlTtlSeconds: 900,
    });
    const dispatchedMessageIds: string[] = [];
    const provider = acceptedProvider();
    const processor = createWhatsappSendProcessor({
      repository,
      provider,
      maximumAttempts: 5,
      enqueueMessages: async (ids) => {
        dispatchedMessageIds.push(...ids);
      },
    });
    await expect(
      processor({
        data: { operation: "DISPATCH_BATCH", batchId: batch.id },
      } as never),
    ).resolves.toMatchObject({ outcome: "DISPATCHED", count: 2_000 });
    expect(new Set(dispatchedMessageIds).size).toBe(2_000);
    await verifyRealQueueFanout(repository, batch.id, dispatchedMessageIds);

    const firstMessageId = dispatchedMessageIds[0]!;
    await expect(
      processor({
        data: { operation: "SEND_MESSAGE", messageId: firstMessageId },
      } as never),
    ).resolves.toMatchObject({ outcome: "ACCEPTED" });
    await expect(
      processor({
        data: { operation: "SEND_MESSAGE", messageId: firstMessageId },
      } as never),
    ).resolves.toMatchObject({ outcome: "SKIPPED" });
    expect(provider.sendInvitation).toHaveBeenCalledTimes(1);
    const providerInput = provider.sendInvitation.mock.calls[0]?.[0];
    expect(providerInput?.header?.kind).toBe("IMAGE_LINK");
    if (providerInput?.header?.kind !== "IMAGE_LINK") {
      throw new Error("Expected an immutable signed image header.");
    }
    const mediaUrl = new URL(providerInput.header.url);
    const firstSnapshot = await prisma.message.findUniqueOrThrow({
      where: { id: firstMessageId },
      select: { contentSnapshot: true },
    });
    expect(mediaUrl.searchParams.get("checksum")).toBe(
      firstSnapshot.contentSnapshot.assetSha256,
    );
    expect(
      verifyWhatsappMediaSignature({
        snapshotId: firstSnapshot.contentSnapshot.id,
        assetSha256: firstSnapshot.contentSnapshot.assetSha256!,
        expiresAtSeconds: Number(mediaUrl.searchParams.get("expires")),
        signature: mediaUrl.searchParams.get("signature")!,
        secret: mediaSigningSecret,
      }),
    ).toBe(true);
    const mediaService = new MessagingMediaService(
      prismaService,
      {
        getObject: vi.fn().mockResolvedValue({
          bucket: asset.bucket,
          key: asset.objectKey,
          body: invitationImage,
          size: invitationImage.byteLength,
          contentType: asset.contentType!,
          metadata: {},
        }),
      } as never,
      {
        get: vi.fn((key: string) =>
          key === "META_WHATSAPP_MEDIA_SIGNING_SECRET"
            ? mediaSigningSecret
            : 8 * 1024 * 1024,
        ),
      } as never,
    );
    await expect(
      mediaService.content(
        firstSnapshot.contentSnapshot.id,
        mediaUrl.searchParams.get("checksum"),
        mediaUrl.searchParams.get("expires"),
        mediaUrl.searchParams.get("signature"),
      ),
    ).resolves.toEqual({ body: invitationImage, mediaType: "image/png" });
    expect(
      await prisma.messageAttempt.count({
        where: { messageId: firstMessageId },
      }),
    ).toBe(1);

    const webhook = new WhatsappWebhookService(
      prismaService,
      queues.service,
      configFixture(),
    );
    const processWebhook = createWhatsappWebhookProcessor(repository);
    const earlyWebhookMessageId = dispatchedMessageIds[2]!;
    const earlyClaim = await repository.claimMessage(earlyWebhookMessageId, 5);
    expect(earlyClaim.outcome).toBe("SEND");
    if (earlyClaim.outcome !== "SEND") {
      throw new Error("Expected the early-webhook message to be claimable.");
    }
    await ingestAndProcess(
      webhook,
      queues,
      processWebhook,
      statusPayload(
        "delivered",
        "1725880005",
        "wamid.stage6.early",
        earlyWebhookMessageId,
      ),
    );
    expect(
      await prisma.message.findUniqueOrThrow({
        where: { id: earlyWebhookMessageId },
      }),
    ).toMatchObject({
      status: "DELIVERED",
      providerMessageId: "wamid.stage6.early",
    });
    await repository.recordAccepted(earlyClaim, {
      provider: "META_WHATSAPP",
      providerMessageId: "wamid.stage6.early",
      acceptedAt: new Date("2026-09-09T12:00:00.000Z"),
    });
    expect(
      await prisma.message.findUniqueOrThrow({
        where: { id: earlyWebhookMessageId },
      }),
    ).toMatchObject({
      status: "DELIVERED",
      providerMessageId: "wamid.stage6.early",
    });
    await repository.recordFailure(earlyClaim, {
      failureClass: "TRANSIENT",
      providerCode: "131048",
      retry: true,
    });
    await repository.recordAccepted(earlyClaim, {
      provider: "META_WHATSAPP",
      providerMessageId: "wamid.stage6.conflicting-stale-result",
      acceptedAt: new Date("2026-09-09T12:00:01.000Z"),
    });
    expect(
      await prisma.message.findUniqueOrThrow({
        where: { id: earlyWebhookMessageId },
      }),
    ).toMatchObject({
      status: "DELIVERED",
      providerMessageId: "wamid.stage6.early",
    });

    const asynchronousFailureMessageId = dispatchedMessageIds[3]!;
    const asynchronousFailureClaim = await repository.claimMessage(
      asynchronousFailureMessageId,
      5,
    );
    expect(asynchronousFailureClaim.outcome).toBe("SEND");
    if (asynchronousFailureClaim.outcome !== "SEND") {
      throw new Error(
        "Expected the asynchronous-failure message to be claimable.",
      );
    }
    await repository.recordAccepted(asynchronousFailureClaim, {
      provider: "META_WHATSAPP",
      providerMessageId: "wamid.stage6.asynchronous-failure",
      acceptedAt: new Date("2026-09-09T12:00:00.000Z"),
    });
    await ingestAndProcess(
      webhook,
      queues,
      processWebhook,
      statusPayload(
        "failed",
        "1725880006",
        "wamid.stage6.asynchronous-failure",
        asynchronousFailureMessageId,
      ),
    );
    expect(
      await prisma.message.findUniqueOrThrow({
        where: { id: asynchronousFailureMessageId },
      }),
    ).toMatchObject({
      status: "FAILED",
      failureClass: "PERMANENT",
    });
    await prisma.message.update({
      where: { id: asynchronousFailureMessageId },
      data: { failureClass: "AMBIGUOUS" },
    });
    await expect(
      messaging.resendReadiness(
        principal,
        event.id,
        asynchronousFailureMessageId,
      ),
    ).resolves.toMatchObject({
      eligible: false,
      reasonCode: "AMBIGUOUS_OUTCOME",
    });
    await prisma.message.update({
      where: { id: asynchronousFailureMessageId },
      data: { failureClass: "PERMANENT" },
    });

    const earlyFailureMessageId = dispatchedMessageIds[4]!;
    const earlyFailureClaim = await repository.claimMessage(
      earlyFailureMessageId,
      5,
    );
    expect(earlyFailureClaim.outcome).toBe("SEND");
    if (earlyFailureClaim.outcome !== "SEND") {
      throw new Error("Expected the early-failure message to be claimable.");
    }
    await ingestAndProcess(
      webhook,
      queues,
      processWebhook,
      statusPayload(
        "failed",
        "1725880007",
        "wamid.stage6.early-failure",
        earlyFailureMessageId,
      ),
    );
    await repository.recordAccepted(earlyFailureClaim, {
      provider: "META_WHATSAPP",
      providerMessageId: "wamid.stage6.early-failure",
      acceptedAt: new Date("2026-09-09T12:00:00.000Z"),
    });
    expect(
      await prisma.message.findUniqueOrThrow({
        where: { id: earlyFailureMessageId },
      }),
    ).toMatchObject({
      status: "FAILED",
      failureClass: "PERMANENT",
    });

    const webhookWonMessageId = dispatchedMessageIds[5]!;
    const webhookWonClaim = await repository.claimMessage(
      webhookWonMessageId,
      5,
    );
    if (webhookWonClaim.outcome !== "SEND") {
      throw new Error("Expected the webhook-won message to be claimable.");
    }
    await ingestAndProcess(
      webhook,
      queues,
      processWebhook,
      statusPayload(
        "delivered",
        "1725880006",
        "wamid.stage6.webhook-won",
        webhookWonMessageId,
      ),
    );
    await repository.recordFailure(webhookWonClaim, {
      failureClass: "AMBIGUOUS",
      providerCode: "PROVIDER_TIMEOUT",
      retry: false,
    });
    expect(
      await prisma.message.findUniqueOrThrow({
        where: { id: webhookWonMessageId },
      }),
    ).toMatchObject({
      status: "DELIVERED",
      providerMessageId: "wamid.stage6.webhook-won",
      failureClass: null,
    });
    expect(
      await prisma.messageAttempt.findUniqueOrThrow({
        where: { id: webhookWonClaim.attemptId },
      }),
    ).toMatchObject({
      status: "AMBIGUOUS",
      failureClass: "AMBIGUOUS",
      failureCode: "PROVIDER_TIMEOUT",
      completedAt: expect.any(Date),
    });

    const readPayload = statusPayload("read", "1725880020");
    const deliveredPayload = statusPayload("delivered", "1725880010");
    await ingestAndProcess(webhook, queues, processWebhook, readPayload);
    await ingestAndProcess(webhook, queues, processWebhook, deliveredPayload);
    const messageAfterWebhooks = await prisma.message.findUniqueOrThrow({
      where: { id: firstMessageId },
    });
    expect(messageAfterWebhooks).toMatchObject({
      status: "READ",
      providerMessageId: "wamid.stage6.1",
      deliveredAt: expect.any(Date),
      readAt: expect.any(Date),
    });
    await expect(
      messaging.resendReadiness(principal, event.id, firstMessageId),
    ).resolves.toMatchObject({
      eligible: false,
      reasonCode: "NOT_FAILED",
    });

    const duplicateBody = Buffer.from(JSON.stringify(readPayload));
    const duplicateAck = await webhook.ingest(
      duplicateBody,
      signature(duplicateBody),
      readPayload,
    );
    expect(duplicateAck).toEqual({
      accepted: true,
      queuedEvents: 0,
      duplicateEvents: 1,
    });
    expect(
      await prisma.webhookEvent.count({
        where: { eventType: "MESSAGE_READ" },
      }),
    ).toBe(1);

    const recoverablePayload = statusPayload("sent", "1725880009");
    const recoverableBody = Buffer.from(JSON.stringify(recoverablePayload));
    const recoverableStart = queues.webhookIds.length;
    await webhook.ingest(
      recoverableBody,
      signature(recoverableBody),
      recoverablePayload,
    );
    const recoverableWebhookId = queues.webhookIds[recoverableStart]!;
    await expect(
      repository.claimWebhook(recoverableWebhookId),
    ).resolves.toMatchObject({ outcome: "PROCESS" });
    await repository.recordWebhookFailure(recoverableWebhookId);
    await expect(
      webhook.ingest(
        recoverableBody,
        signature(recoverableBody),
        recoverablePayload,
      ),
    ).resolves.toEqual({
      accepted: true,
      queuedEvents: 1,
      duplicateEvents: 1,
    });
    await expect(
      processWebhook({
        data: { webhookEventId: recoverableWebhookId },
      } as never),
    ).resolves.toMatchObject({ outcome: "APPLIED" });
    expect(
      await prisma.webhookEvent.findUniqueOrThrow({
        where: { id: recoverableWebhookId },
      }),
    ).toMatchObject({ status: "PROCESSED" });

    const crashedPayload = statusPayload("sent", "1725880008");
    const crashedBody = Buffer.from(JSON.stringify(crashedPayload));
    const crashedStart = queues.webhookIds.length;
    await webhook.ingest(crashedBody, signature(crashedBody), crashedPayload);
    const crashedWebhookId = queues.webhookIds[crashedStart]!;
    await expect(
      repository.claimWebhook(crashedWebhookId),
    ).resolves.toMatchObject({ outcome: "PROCESS" });
    await expect(
      processWebhook({ data: { webhookEventId: crashedWebhookId } } as never),
    ).resolves.toMatchObject({ outcome: "APPLIED" });
    expect(
      await prisma.webhookEvent.findUniqueOrThrow({
        where: { id: crashedWebhookId },
      }),
    ).toMatchObject({ status: "PROCESSED" });

    const stalePayload = statusPayload("sent", "1725880007");
    const staleBody = Buffer.from(JSON.stringify(stalePayload));
    const staleStart = queues.webhookIds.length;
    await webhook.ingest(staleBody, signature(staleBody), stalePayload);
    const staleWebhookId = queues.webhookIds[staleStart]!;
    await expect(
      repository.claimWebhook(staleWebhookId),
    ).resolves.toMatchObject({
      outcome: "PROCESS",
    });
    await prisma.webhookEvent.update({
      where: { id: staleWebhookId },
      data: { processingStartedAt: new Date(Date.now() - 6 * 60 * 1_000) },
    });
    await expect(
      webhook.ingest(staleBody, signature(staleBody), stalePayload),
    ).resolves.toEqual({
      accepted: true,
      queuedEvents: 1,
      duplicateEvents: 1,
    });
    await expect(
      processWebhook({ data: { webhookEventId: staleWebhookId } } as never),
    ).resolves.toMatchObject({ outcome: "APPLIED" });

    const failedMessageId = dispatchedMessageIds[1]!;
    const permanentFailure = createWhatsappSendProcessor({
      repository,
      provider: rejectedProvider(),
      maximumAttempts: 5,
      enqueueMessages: async () => undefined,
    });
    await expect(
      permanentFailure({
        data: { operation: "SEND_MESSAGE", messageId: failedMessageId },
      } as never),
    ).resolves.toMatchObject({ outcome: "FAILED" });
    expect(
      await prisma.message.findUniqueOrThrow({
        where: { id: failedMessageId },
      }),
    ).toMatchObject({
      status: "FAILED",
      failureClass: "PERMANENT",
      failureCode: "131026",
    });

    const failedBeforeCorrection = await prisma.message.findUniqueOrThrow({
      where: { id: failedMessageId },
    });
    await prisma.invitationGroup.update({
      where: { id: failedBeforeCorrection.invitationGroupId },
      data: { phoneE164: "+966599999999" },
    });
    await expect(
      messaging.resendReadiness(principal, event.id, failedMessageId),
    ).resolves.toMatchObject({
      eligible: false,
      reasonCode: "SNAPSHOT_STALE",
      reason: expect.stringContaining("current snapshot"),
    });
    await preparation.createSnapshots(principal, event.id, {
      templateId: template.id,
      invitationIds: [failedBeforeCorrection.invitationGroupId],
    });
    const resendReadiness = await messaging.resendReadiness(
      principal,
      event.id,
      failedMessageId,
    );
    expect(resendReadiness).toMatchObject({
      eligible: true,
      estimatedCreditUnits: 1,
      reasonCode: null,
      reason: null,
    });
    const [resendBatch, resendReplay] = await Promise.all([
      messaging.resend(
        principal,
        event.id,
        failedMessageId,
        { confirmationToken: resendReadiness.confirmationToken! },
        "stage6-resend-0001",
      ),
      messaging.resend(
        principal,
        event.id,
        failedMessageId,
        { confirmationToken: resendReadiness.confirmationToken! },
        "stage6-resend-0001",
      ),
    ]);
    expect(resendReplay.id).toBe(resendBatch.id);
    expect(resendBatch.totalMessages).toBe(1);
    expect(
      await prisma.message.findFirstOrThrow({
        where: { sendBatchId: resendBatch.id },
      }),
    ).toMatchObject({
      predecessorMessageId: failedMessageId,
      recipientPhoneE164: "+966599999999",
      creditUnits: 1,
    });
    expect(
      (
        await prisma.message.findFirstOrThrow({
          where: { sendBatchId: resendBatch.id },
        })
      ).contentSnapshotId,
    ).not.toBe(failedBeforeCorrection.contentSnapshotId);
    await expect(
      messaging.resendReadiness(principal, event.id, failedMessageId),
    ).resolves.toMatchObject({
      eligible: false,
      reasonCode: "ALREADY_RESENT",
    });

    await prisma.invitationTemplate.update({
      where: { id: template.id },
      data: { status: "ARCHIVED", archivedAt: new Date(), isDefault: false },
    });
    await expect(
      messaging.resendReadiness(principal, event.id, earlyFailureMessageId),
    ).resolves.toMatchObject({
      eligible: false,
      reasonCode: "TEMPLATE_NOT_APPROVED",
    });
  }, 60_000);

  it("serializes competing launches and final message completions", async () => {
    const owner = await createUserFixture(prisma, {
      authProviderId: "stage6-terminal-batch-owner",
    });
    const event = await createEventFixture(prisma, owner);
    const invitationIds = [randomUUID(), randomUUID()];
    await prisma.$transaction(async (transaction) => {
      await transaction.invitationGroup.createMany({
        data: invitationIds.map((id, index) => ({
          id,
          eventId: event.id,
          displayName: `Terminal Guest ${index + 1}`,
          contactName: `Terminal Guest ${index + 1}`,
          phoneE164: `+96651111111${index}`,
          phoneCountry: "SA",
          invitationType: "SINGLE",
          createdBy: owner.id,
        })),
      });
      await transaction.guestMember.createMany({
        data: invitationIds.map((invitationGroupId, index) => ({
          invitationGroupId,
          name: `Terminal Guest ${index + 1}`,
          position: 1,
          isPrimary: true,
        })),
      });
    });
    const principal = { subject: owner.authProviderId };
    const preparation = new PreparationService(prismaService, access);
    const draft = await preparation.createTemplate(principal, event.id, {
      name: "Terminal batch template",
      locale: "en",
      body: "Hello {{guest_name}}, you are invited to {{event_name}}.",
      providerTemplateName: "terminal_batch_template_en",
    });
    const template = await preparation.approveTemplate(
      principal,
      event.id,
      draft.id,
      { expectedVersion: 1 },
    );
    await preparation.createSnapshots(principal, event.id, {
      templateId: template.id,
    });
    const queues = queueRecorder();
    const messaging = new MessagingService(
      prismaService,
      access,
      queues.service,
    );
    const readiness = await messaging.readiness(principal, event.id, {
      templateId: template.id,
    });
    const launchKeys = [
      "stage6-competing-launch-a",
      "stage6-competing-launch-b",
    ];
    const launches = await Promise.allSettled(
      launchKeys.map((key) =>
        messaging.createBatch(
          principal,
          event.id,
          {
            templateId: template.id,
            confirmationToken: readiness.confirmationToken,
          },
          key,
        ),
      ),
    );
    expect(
      launches.filter(({ status }) => status === "fulfilled"),
    ).toHaveLength(1);
    expect(launches.filter(({ status }) => status === "rejected")).toHaveLength(
      1,
    );
    const winningIndex = launches.findIndex(
      ({ status }) => status === "fulfilled",
    );
    const winner = launches[winningIndex];
    if (!winner || winner.status !== "fulfilled") {
      throw new Error("Expected exactly one competing launch to succeed.");
    }
    const batch = winner.value;
    const winningKey = launchKeys[winningIndex]!;
    const repository = new PrismaMessagingRepository(prisma);
    await repository.recordExhaustedSendJob({
      operation: "DISPATCH_BATCH",
      batchId: batch.id,
    });
    expect(
      await prisma.sendBatch.findUniqueOrThrow({ where: { id: batch.id } }),
    ).toMatchObject({ status: "FAILED" });
    expect(
      await prisma.message.count({
        where: {
          sendBatchId: batch.id,
          status: "FAILED",
          failureCode: "DISPATCH_RETRY_EXHAUSTED",
        },
      }),
    ).toBe(2);
    queues.failedBatchIds.add(batch.id);
    const recovered = await messaging.createBatch(
      principal,
      event.id,
      {
        templateId: template.id,
        confirmationToken: readiness.confirmationToken,
      },
      winningKey,
    );
    expect(recovered.id).toBe(batch.id);
    const recoveryFence = await prisma.sendBatch.findUniqueOrThrow({
      where: { id: batch.id },
      select: { dispatchStartedAt: true },
    });
    expect(recoveryFence.dispatchStartedAt).toBeInstanceOf(Date);
    await repository.recordExhaustedSendJob(
      { operation: "DISPATCH_BATCH", batchId: batch.id },
      new Date(recoveryFence.dispatchStartedAt!.getTime() - 1),
    );
    expect(
      await prisma.message.count({
        where: { sendBatchId: batch.id, status: "QUEUED" },
      }),
    ).toBe(2);
    const messageIds = await repository.prepareBatchDispatch(batch.id);
    await repository.markBatchDispatched(batch.id);
    const claims = await Promise.all(
      messageIds.map((messageId) => repository.claimMessage(messageId, 5)),
    );
    expect(claims.every((claim) => claim.outcome === "SEND")).toBe(true);
    await Promise.all(
      claims.map((claim, index) => {
        if (claim.outcome !== "SEND") {
          throw new Error(
            "Expected the terminal batch message to be claimable.",
          );
        }
        return repository.recordAccepted(claim, {
          provider: "META_WHATSAPP",
          providerMessageId: `wamid.stage6.terminal-${index + 1}`,
          acceptedAt: new Date("2026-09-09T12:10:00.000Z"),
        });
      }),
    );
    expect(
      await prisma.sendBatch.findUniqueOrThrow({ where: { id: batch.id } }),
    ).toMatchObject({ status: "COMPLETED", completedAt: expect.any(Date) });
  });
});

function queueRecorder() {
  const batchIds: string[] = [];
  const webhookIds: string[] = [];
  const failedBatchIds = new Set<string>();
  return {
    batchIds,
    webhookIds,
    failedBatchIds,
    service: {
      enqueueBatch: vi.fn(
        async (
          batchId: string,
          beforeFailedJobRetry?: (exhaustedAt: Date) => Promise<void>,
        ) => {
          if (failedBatchIds.has(batchId)) {
            await beforeFailedJobRetry?.(new Date(Date.now() - 1_000));
            failedBatchIds.delete(batchId);
          }
          batchIds.push(batchId);
        },
      ),
      enqueueWebhooks: vi.fn(async (ids: readonly string[]) => {
        webhookIds.push(...ids);
      }),
    } as unknown as MessagingQueueService,
  };
}

function acceptedProvider(): MessagingProvider & {
  sendInvitation: ReturnType<typeof vi.fn>;
} {
  const sendInvitation = vi.fn(async (_input: MessagingTemplateSendInput) => ({
    provider: "META_WHATSAPP" as const,
    providerMessageId: "wamid.stage6.1",
    acceptedAt: new Date("2026-09-09T12:00:00.000Z"),
  }));
  return {
    sendInvitation,
    sendReminder: sendInvitation,
    sendConfirmation: sendInvitation,
  };
}

function rejectedProvider(): MessagingProvider {
  const reject = async () => {
    throw new MessagingProviderError(
      "131026",
      { failureClass: "PERMANENT", retryable: false },
      400,
    );
  };
  return {
    sendInvitation: reject,
    sendReminder: reject,
    sendConfirmation: reject,
  };
}

function configFixture() {
  const values: Record<string, string> = {
    META_WHATSAPP_APP_SECRET: "stage6-app-secret",
    META_WHATSAPP_WEBHOOK_VERIFY_TOKEN: "stage6-verify-token",
    META_WHATSAPP_PHONE_NUMBER_ID: "123456789012345",
  };
  return { get: (key: string) => values[key] } as never;
}

function statusPayload(
  status: string,
  timestamp: string,
  providerMessageId = "wamid.stage6.1",
  logicalMessageId?: string,
) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: "123456789012345" },
              statuses: [
                {
                  id: providerMessageId,
                  status,
                  timestamp,
                  ...(logicalMessageId
                    ? { biz_opaque_callback_data: logicalMessageId }
                    : {}),
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function signature(body: Buffer): string {
  return `sha256=${createHmac("sha256", "stage6-app-secret").update(body).digest("hex")}`;
}

async function ingestAndProcess(
  webhook: WhatsappWebhookService,
  queues: ReturnType<typeof queueRecorder>,
  processor: ReturnType<typeof createWhatsappWebhookProcessor>,
  payload: ReturnType<typeof statusPayload>,
) {
  const body = Buffer.from(JSON.stringify(payload));
  const start = queues.webhookIds.length;
  await webhook.ingest(body, signature(body), payload);
  for (const webhookEventId of queues.webhookIds.slice(start)) {
    await processor({ data: { webhookEventId } } as never);
  }
}

async function verifyRealQueueFanout(
  repository: PrismaMessagingRepository,
  batchId: string,
  expectedMessageIds: readonly string[],
): Promise<void> {
  const redisUrl = assertTestRedis();
  const uniquePrefix = `${process.env.QUEUE_PREFIX ?? "dawah:test"}:stage6-fanout:${randomUUID()}`;
  const connection = createProducerRedis(redisUrl, "dawah-stage6-fanout-test");
  const queue = new Queue<WhatsappSendJobData>(queueNames.whatsappSend, {
    connection,
    prefix: uniquePrefix,
  });
  const dispatch = createWhatsappSendProcessor({
    repository,
    provider: acceptedProvider(),
    maximumAttempts: 5,
    enqueueMessages: async (messageIds) => {
      await queue.addBulk(whatsappMessageJobs(messageIds, 5));
    },
  });

  try {
    await queue.waitUntilReady();
    await dispatch({
      data: { operation: "DISPATCH_BATCH", batchId },
    } as never);
    await dispatch({
      data: { operation: "DISPATCH_BATCH", batchId },
    } as never);
    const jobs = await queue.getJobs(["waiting"], 0, -1, false);
    expect(jobs).toHaveLength(2_000);
    expect(new Set(jobs.map(({ id }) => id)).size).toBe(2_000);
    expect(new Set(jobs.map(({ id }) => id))).toEqual(
      new Set(expectedMessageIds.map(whatsappMessageJobId)),
    );
    for (const job of jobs) {
      expect(job.name).toBe("send");
      expect(job.data).toEqual({
        operation: "SEND_MESSAGE",
        messageId: job.id!.replace(/^message-/, ""),
      });
    }
    await expect(
      Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getDelayedCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
      ]),
    ).resolves.toEqual([2_000, 0, 0, 0, 0]);
  } finally {
    await queue.obliterate({ force: true }).catch(() => undefined);
    await queue.close().catch(() => undefined);
    connection.disconnect(false);
  }
}

function assertTestRedis(): string {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl)
    throw new Error("REDIS_URL is required for Stage 6 integration.");
  const hostname = new URL(redisUrl).hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  if (
    process.env.NODE_ENV !== "test" ||
    process.env.DAWAH_ENV !== "test" ||
    !new Set(["localhost", "127.0.0.1", "::1"]).has(hostname)
  ) {
    throw new Error(
      "Stage 6 queue integration requires a local test Redis instance.",
    );
  }
  return redisUrl;
}
