import type { WebhookEventStatus } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaMessagingRepository } from "../../../worker/src/prisma-messaging-repository";
import { TestDatabase } from "./database";

const database = new TestDatabase();
const prisma = database.prisma;
const repository = new PrismaMessagingRepository(prisma);
const now = new Date("2026-10-01T18:00:00.000Z");

function minutesAgo(minutes: number): Date {
  return new Date(now.getTime() - minutes * 60_000);
}

let sequence = 0;
function webhook(
  status: WebhookEventStatus,
  times: {
    receivedAt: Date;
    queuedAt?: Date;
    processingStartedAt?: Date;
    processedAt?: Date;
  },
) {
  sequence += 1;
  return prisma.webhookEvent.create({
    data: {
      provider: "META_WHATSAPP",
      providerEventId: `recovery-${sequence}`,
      eventType: "MESSAGE_RESPONSE",
      payload: { kind: "RESPONSE" },
      payloadHash: String(sequence % 10).repeat(64),
      status,
      ...times,
      ...(status === "FAILED"
        ? { processingError: "Webhook processing failed and is safe to retry." }
        : {}),
    },
  });
}

describe("stranded webhook recovery", () => {
  beforeEach(() => database.clean());
  afterAll(() => prisma.$disconnect());

  it("requeues only events no job will finish, oldest first", async () => {
    const stranded = [
      await webhook("RECEIVED", { receivedAt: minutesAgo(30) }),
      await webhook("QUEUED", {
        receivedAt: minutesAgo(40),
        queuedAt: minutesAgo(10),
      }),
      await webhook("FAILED", {
        receivedAt: minutesAgo(60),
        processedAt: minutesAgo(20),
      }),
      await webhook("PROCESSING", {
        receivedAt: minutesAgo(60),
        processingStartedAt: minutesAgo(6),
      }),
    ];
    const live = [
      await webhook("QUEUED", {
        receivedAt: minutesAgo(3),
        queuedAt: minutesAgo(3),
      }),
      await webhook("FAILED", {
        receivedAt: minutesAgo(30),
        processedAt: minutesAgo(5),
      }),
      await webhook("PROCESSING", {
        receivedAt: minutesAgo(30),
        processingStartedAt: minutesAgo(1),
      }),
      await webhook("PROCESSED", {
        receivedAt: minutesAgo(90),
        processedAt: minutesAgo(89),
      }),
      await webhook("IGNORED", {
        receivedAt: minutesAgo(90),
        processedAt: minutesAgo(89),
      }),
      await webhook("FAILED", {
        receivedAt: minutesAgo(73 * 60),
        processedAt: minutesAgo(72 * 60),
      }),
    ];

    const requeued = await repository.requeueStalledWebhooks(now);

    expect(requeued).toEqual(stranded.map(({ id }) => id));
    for (const row of await prisma.webhookEvent.findMany({
      where: { id: { in: stranded.map(({ id }) => id) } },
    })) {
      expect(row).toMatchObject({
        status: "QUEUED",
        queuedAt: now,
        processingStartedAt: null,
        processedAt: null,
        processingError: null,
      });
    }
    for (const before of live) {
      const after = await prisma.webhookEvent.findUniqueOrThrow({
        where: { id: before.id },
      });
      expect(after.status).toBe(before.status);
      expect(after.queuedAt).toEqual(before.queuedAt);
    }

    // The requeue itself is the backoff anchor: nothing repeats next minute.
    await expect(
      repository.requeueStalledWebhooks(new Date(now.getTime() + 60_000)),
    ).resolves.toEqual([]);
  });

  it("leaves an event a live job claimed after it was selected", async () => {
    const event = await webhook("FAILED", {
      receivedAt: minutesAgo(60),
      processedAt: minutesAgo(20),
    });
    const claimedAt = new Date(now.getTime() - 1_000);
    const original = prisma.webhookEvent.findMany.bind(prisma.webhookEvent);
    let raced = false;
    const racing = new Proxy(prisma, {
      get(target, property, receiver) {
        if (property !== "webhookEvent") {
          return Reflect.get(target, property, receiver);
        }
        return new Proxy(target.webhookEvent, {
          get(delegate, method, delegateReceiver) {
            if (method !== "findMany") {
              return Reflect.get(delegate, method, delegateReceiver);
            }
            return async (...args: Parameters<typeof original>) => {
              const selected = await original(...args);
              if (!raced) {
                raced = true;
                await target.webhookEvent.update({
                  where: { id: event.id },
                  data: {
                    status: "PROCESSING",
                    processingStartedAt: claimedAt,
                  },
                });
              }
              return selected;
            };
          },
        });
      },
    });

    await new PrismaMessagingRepository(racing).requeueStalledWebhooks(now);

    await expect(
      prisma.webhookEvent.findUniqueOrThrow({ where: { id: event.id } }),
    ).resolves.toMatchObject({
      status: "PROCESSING",
      processingStartedAt: claimedAt,
    });
  });
});
