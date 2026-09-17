import { describe, expect, it, vi } from "vitest";
import {
  chargeSendUsage,
  InsufficientCreditError,
  refundSendUsage,
  reserveSendBatch,
  settleSendBatchReservation,
  type CreditLedgerTransaction,
} from "./credit-ledger";

const eventId = "10000000-0000-4000-8000-000000000001";
const messageId = "20000000-0000-4000-8000-000000000001";
const sendBatchId = "30000000-0000-4000-8000-000000000001";
const accountId = "40000000-0000-4000-8000-000000000001";

describe("worker credit accounting", () => {
  it("releases a held unit and charges the send in the same transaction", async () => {
    const transaction = ledgerTransaction({
      charge: null,
      createdCount: 1,
      reservation: { id: "reservation", status: "ACTIVE", units: 2 },
    });

    await expect(
      chargeSendUsage(
        transaction,
        { eventId, messageId, sendBatchId, units: 1 },
        new Date("2026-09-16T10:00:00.000Z"),
      ),
    ).resolves.toBe(true);
    expect(transaction.creditReservation.update).toHaveBeenCalledWith({
      where: { id: "reservation" },
      data: { units: 1, status: "ACTIVE" },
    });
    expect(transaction.creditLedgerEntry.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          creditAccountId: accountId,
          entryType: "SEND_USAGE",
          messageId,
          referenceId: messageId,
          referenceType: "Message",
          units: -1,
        }),
      ],
      skipDuplicates: true,
    });
  });

  it("consumes the reservation when its last held unit is charged", async () => {
    const settledAt = new Date("2026-09-16T10:00:00.000Z");
    const transaction = ledgerTransaction({
      charge: null,
      createdCount: 1,
      reservation: { id: "reservation", status: "ACTIVE", units: 1 },
    });

    await expect(
      chargeSendUsage(
        transaction,
        { eventId, messageId, sendBatchId, units: 1 },
        settledAt,
      ),
    ).resolves.toBe(true);
    expect(transaction.creditReservation.update).toHaveBeenCalledWith({
      where: { id: "reservation" },
      data: { units: 1, status: "CONSUMED", consumedAt: settledAt },
    });
  });

  it("does not release a second unit for a replayed acceptance", async () => {
    const transaction = ledgerTransaction({
      charge: { id: "existing" },
      reservation: { id: "reservation", status: "ACTIVE", units: 2 },
    });

    await expect(
      chargeSendUsage(transaction, {
        eventId,
        messageId,
        sendBatchId,
        units: 1,
      }),
    ).resolves.toBe(false);
    expect(transaction.creditReservation.update).not.toHaveBeenCalled();
    expect(transaction.creditLedgerEntry.createMany).not.toHaveBeenCalled();
  });

  it("leaves a send uncharged when its batch holds nothing", async () => {
    const transaction = ledgerTransaction({ charge: null, reservation: null });

    await expect(
      chargeSendUsage(transaction, {
        eventId,
        messageId,
        sendBatchId,
        units: 1,
      }),
    ).resolves.toBe(false);
    expect(transaction.creditLedgerEntry.createMany).not.toHaveBeenCalled();
  });

  it("writes nothing for an event without credit accounting", async () => {
    const transaction = ledgerTransaction({ account: null, charge: null });

    await expect(
      chargeSendUsage(transaction, {
        eventId,
        messageId,
        sendBatchId,
        units: 1,
      }),
    ).resolves.toBe(false);
    expect(transaction.creditLedgerEntry.createMany).not.toHaveBeenCalled();
  });

  it("refunds only a message that was actually charged", async () => {
    const uncharged = ledgerTransaction({ charge: null });
    await expect(
      refundSendUsage(uncharged, {
        eventId,
        messageId,
        sendBatchId,
        units: 1,
        reasonCode: "PROVIDER_DELIVERY_FAILED",
      }),
    ).resolves.toBe(false);
    expect(uncharged.creditLedgerEntry.createMany).not.toHaveBeenCalled();

    const charged = ledgerTransaction({
      createdCount: 1,
      charge: { id: "charge" },
    });
    await expect(
      refundSendUsage(charged, {
        eventId,
        messageId,
        sendBatchId,
        units: 1,
        reasonCode: "PROVIDER_DELIVERY_FAILED",
      }),
    ).resolves.toBe(true);
    expect(charged.creditLedgerEntry.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          entryType: "REFUND",
          referenceId: messageId,
          units: 1,
        }),
      ],
      skipDuplicates: true,
    });
  });

  it("releases only an active batch reservation", async () => {
    const transaction = ledgerTransaction({ settledCount: 1 });
    const settledAt = new Date("2026-09-16T10:00:00.000Z");

    await expect(
      settleSendBatchReservation(
        transaction,
        { eventId, sendBatchId },
        settledAt,
      ),
    ).resolves.toBe(true);
    expect(transaction.creditReservation.updateMany).toHaveBeenCalledWith({
      where: {
        creditAccountId: accountId,
        referenceType: "SendBatch",
        referenceId: sendBatchId,
        status: "ACTIVE",
      },
      data: { status: "RELEASED", releasedAt: settledAt },
    });
  });

  it("holds credit for an automatically scheduled batch", async () => {
    const transaction = ledgerTransaction({
      entryGroups: [{ entryType: "PURCHASE", _sum: { units: 20 } }],
    });
    const now = new Date("2026-09-16T10:00:00.000Z");

    await expect(
      reserveSendBatch(
        transaction,
        {
          createdByUserId: "50000000-0000-4000-8000-000000000001",
          eventId,
          sendBatchId,
          units: 5,
        },
        now,
      ),
    ).resolves.toBe(true);
    expect(transaction.creditReservation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        referenceId: sendBatchId,
        referenceType: "SendBatch",
        status: "ACTIVE",
        units: 5,
        expiresAt: new Date("2026-09-17T10:00:00.000Z"),
      }),
    });
  });

  it("refuses to queue a scheduled batch the event cannot pay for", async () => {
    const transaction = ledgerTransaction({
      entryGroups: [{ entryType: "PURCHASE", _sum: { units: 4 } }],
      reservations: [
        {
          status: "ACTIVE",
          units: 3,
          expiresAt: new Date("2026-09-17T10:00:00.000Z"),
        },
      ],
    });

    await expect(
      reserveSendBatch(
        transaction,
        {
          createdByUserId: "50000000-0000-4000-8000-000000000001",
          eventId,
          sendBatchId,
          units: 2,
        },
        new Date("2026-09-16T10:00:00.000Z"),
      ),
    ).rejects.toBeInstanceOf(InsufficientCreditError);
    expect(transaction.creditReservation.create).not.toHaveBeenCalled();
  });

  it("leaves an unbilled event untouched when a scheduled batch runs", async () => {
    const transaction = ledgerTransaction({ account: null });

    await expect(
      reserveSendBatch(transaction, {
        createdByUserId: "50000000-0000-4000-8000-000000000001",
        eventId,
        sendBatchId,
        units: 2,
      }),
    ).resolves.toBe(false);
    expect(transaction.creditReservation.create).not.toHaveBeenCalled();
  });

  it("rejects a non-positive charge before touching the ledger", async () => {
    const transaction = ledgerTransaction({});

    await expect(
      chargeSendUsage(transaction, {
        eventId,
        messageId,
        sendBatchId,
        units: 0,
      }),
    ).resolves.toBe(false);
    expect(transaction.creditAccount.findUnique).not.toHaveBeenCalled();
  });
});

function ledgerTransaction(options: {
  account?: { id: string } | null;
  charge?: { id: string } | null;
  createdCount?: number;
  entryGroups?: { entryType: string; _sum: { units: number | null } }[];
  reservation?: { id: string; status: string; units: number } | null;
  reservations?: { status: string; units: number; expiresAt: Date }[];
  settledCount?: number;
}): LedgerTransactionMock {
  const account =
    options.account === undefined ? { id: accountId } : options.account;
  const charge =
    options.charge === undefined ? { id: "charge" } : options.charge;
  return {
    creditAccount: { findUnique: vi.fn().mockResolvedValue(account) },
    creditLedgerEntry: {
      findFirst: vi.fn().mockResolvedValue(charge),
      createMany: vi
        .fn()
        .mockResolvedValue({ count: options.createdCount ?? 0 }),
      groupBy: vi.fn().mockResolvedValue(options.entryGroups ?? []),
    },
    creditReservation: {
      create: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(options.reservation ?? null),
      findMany: vi.fn().mockResolvedValue(options.reservations ?? []),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi
        .fn()
        .mockResolvedValue({ count: options.settledCount ?? 0 }),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  } as unknown as LedgerTransactionMock;
}

type LedgerTransactionMock = CreditLedgerTransaction & {
  creditAccount: { findUnique: ReturnType<typeof vi.fn> };
  creditLedgerEntry: {
    findFirst: ReturnType<typeof vi.fn>;
    createMany: ReturnType<typeof vi.fn>;
    groupBy: ReturnType<typeof vi.fn>;
  };
  creditReservation: {
    create: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
};
