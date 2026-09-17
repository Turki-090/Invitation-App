import type { ConfigService } from "@nestjs/config";
import type { ApiEnvironment } from "@dawah/config";
import { Permission } from "@dawah/domain";
import { describe, expect, it, vi } from "vitest";
import type { AuthPrincipal } from "../auth/auth.types";
import type { EventAccessService } from "../events/event-access.service";
import type { PrismaService } from "../prisma/prisma.service";
import { CreditLedgerService } from "./credit-ledger.service";
import { CreditsService } from "./credits.service";
import { DisabledPaymentProvider } from "./payment-provider";

const principal: AuthPrincipal = { subject: "stage9-credits" };
const eventId = "10000000-0000-4000-8000-000000000001";
const accountId = "20000000-0000-4000-8000-000000000001";
const sendBatchId = "30000000-0000-4000-8000-000000000001";
const userId = "40000000-0000-4000-8000-000000000001";

describe("CreditsService", () => {
  it("reports balance, reservations, and reconciliation for the owner", async () => {
    const prisma = prismaMock({
      entryGroups: [
        { entryType: "PURCHASE", _sum: { units: 100 } },
        { entryType: "SEND_USAGE", _sum: { units: -40 } },
        { entryType: "REFUND", _sum: { units: 5 } },
      ],
      reservations: [activeReservation(10)],
      sentUnits: 40,
    });
    const access = accessMock();

    const overview = await new CreditsService(
      prisma,
      access,
      ledger(prisma, { BILLING_ENABLED: true, PAYMENTS_ENABLED: false }),
    ).overview(principal, eventId);

    expect(access.resolve).toHaveBeenCalledWith(
      principal,
      eventId,
      Permission.BILLING_MANAGE,
    );
    expect(overview).toMatchObject({
      accountId,
      availableUnits: 55,
      balanceUnits: 65,
      billingEnabled: true,
      paymentActivationEnabled: false,
      reservedUnits: 10,
      activeReservationCount: 1,
      reconciliation: {
        chargedMessageUnits: 40,
        logicalMessageUnits: 40,
        reconciled: true,
        refundedUnits: 5,
      },
    });
  });

  it("flags a ledger that has not charged every logical send", async () => {
    const prisma = prismaMock({
      entryGroups: [
        { entryType: "PURCHASE", _sum: { units: 100 } },
        { entryType: "SEND_USAGE", _sum: { units: -8 } },
      ],
      sentUnits: 10,
    });

    const overview = await new CreditsService(
      prisma,
      accessMock(),
      ledger(prisma, { BILLING_ENABLED: true }),
    ).overview(principal, eventId);

    expect(overview.reconciliation).toMatchObject({
      unchargedMessageUnits: 2,
      excessChargeUnits: 0,
      reconciled: false,
    });
  });

  it("ignores manual adjustments that net to zero", async () => {
    const prisma = prismaMock({
      entryGroups: [
        { entryType: "MANUAL_ADJUSTMENT", _sum: { units: 0 } },
        { entryType: "PURCHASE", _sum: { units: 20 } },
      ],
    });

    const overview = await new CreditsService(
      prisma,
      accessMock(),
      ledger(prisma, { BILLING_ENABLED: true }),
    ).overview(principal, eventId);

    expect(overview.balanceUnits).toBe(20);
  });

  it("pages the append-only ledger newest first", async () => {
    const prisma = prismaMock({});

    const response = await new CreditsService(
      prisma,
      accessMock(),
      ledger(prisma, {}),
    ).ledgerEntries(principal, eventId, { page: 2, pageSize: 20 });

    expect(prisma.creditLedgerEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: 20,
        take: 20,
      }),
    );
    expect(response.pagination).toMatchObject({ page: 2, totalItems: 0 });
  });
});

describe("CreditLedgerService", () => {
  it("does not touch billing tables while billing is disabled", async () => {
    const prisma = prismaMock({});
    const transaction = transactionMock(prisma);

    await ledger(prisma, { BILLING_ENABLED: false }).reserveForSendBatch(
      transaction,
      { createdByUserId: userId, eventId, sendBatchId, units: 5 },
    );

    expect(transaction.creditAccount.upsert).not.toHaveBeenCalled();
    expect(transaction.creditReservation.create).not.toHaveBeenCalled();
  });

  it("holds the units a queued batch may consume", async () => {
    const prisma = prismaMock({
      entryGroups: [{ entryType: "PURCHASE", _sum: { units: 50 } }],
    });
    const transaction = transactionMock(prisma);
    const now = new Date("2026-09-16T09:00:00.000Z");

    await ledger(prisma, { BILLING_ENABLED: true }).reserveForSendBatch(
      transaction,
      { createdByUserId: userId, eventId, sendBatchId, units: 5 },
      now,
    );

    expect(transaction.creditReservation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        creditAccountId: accountId,
        referenceId: sendBatchId,
        referenceType: "SendBatch",
        sendBatchId,
        status: "ACTIVE",
        units: 5,
        expiresAt: new Date("2026-09-17T09:00:00.000Z"),
      }),
    });
  });

  it("refuses a send that would exceed the available balance", async () => {
    const prisma = prismaMock({
      entryGroups: [{ entryType: "PURCHASE", _sum: { units: 6 } }],
      reservations: [activeReservation(4)],
    });
    const transaction = transactionMock(prisma);

    await expect(
      ledger(prisma, { BILLING_ENABLED: true }).reserveForSendBatch(
        transaction,
        { createdByUserId: userId, eventId, sendBatchId, units: 3 },
      ),
    ).rejects.toMatchObject({ response: { code: "INSUFFICIENT_CREDITS" } });
    expect(transaction.creditReservation.create).not.toHaveBeenCalled();
  });

  it("keeps a replayed batch reservation to a single hold", async () => {
    const prisma = prismaMock({
      entryGroups: [{ entryType: "PURCHASE", _sum: { units: 50 } }],
    });
    const transaction = transactionMock(prisma, {
      existingReservation: { id: "existing" },
    });

    await ledger(prisma, { BILLING_ENABLED: true }).reserveForSendBatch(
      transaction,
      { createdByUserId: userId, eventId, sendBatchId, units: 5 },
    );

    expect(transaction.creditReservation.create).not.toHaveBeenCalled();
  });

  it("rejects a manual adjustment that would make the balance negative", async () => {
    const prisma = prismaMock({
      entryGroups: [{ entryType: "PURCHASE", _sum: { units: 3 } }],
    });
    const transaction = transactionMock(prisma);

    await expect(
      ledger(prisma, { BILLING_ENABLED: true }).recordManualAdjustment(
        transaction,
        {
          actorUserId: userId,
          eventId,
          referenceId: "correction-1",
          referenceType: "Operator",
          units: -10,
        },
      ),
    ).rejects.toMatchObject({ response: { code: "INSUFFICIENT_CREDITS" } });
    expect(transaction.creditLedgerEntry.createMany).not.toHaveBeenCalled();
  });

  it("appends a purchase against an immutable reference", async () => {
    const prisma = prismaMock({});
    const transaction = transactionMock(prisma);

    await ledger(prisma, { BILLING_ENABLED: true }).recordPurchase(
      transaction,
      {
        actorUserId: userId,
        eventId,
        referenceId: "payment-1",
        referenceType: "Payment",
        units: 25,
      },
    );

    expect(transaction.creditLedgerEntry.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          entryType: "PURCHASE",
          referenceId: "payment-1",
          units: 25,
        }),
      ],
      skipDuplicates: true,
    });
  });

  it("rejects a purchase recorded with the wrong sign", async () => {
    const prisma = prismaMock({});

    await expect(
      ledger(prisma, { BILLING_ENABLED: true }).recordPurchase(
        transactionMock(prisma),
        {
          actorUserId: userId,
          eventId,
          referenceId: "payment-2",
          referenceType: "Payment",
          units: -5,
        },
      ),
    ).rejects.toThrow(RangeError);
  });
});

describe("DisabledPaymentProvider", () => {
  it("reports that payments are not activated", async () => {
    const provider = new DisabledPaymentProvider();

    expect(provider.activated).toBe(false);
    await expect(provider.settlePurchase()).rejects.toMatchObject({
      response: { code: "PAYMENTS_NOT_ACTIVATED" },
    });
  });
});

function ledger(
  prisma: PrismaService,
  flags: Record<string, boolean>,
): CreditLedgerService {
  return new CreditLedgerService(prisma, {
    get: vi.fn((key: string) => flags[key] ?? false),
  } as unknown as ConfigService<ApiEnvironment, true>);
}

function accessMock(): EventAccessService {
  return {
    resolve: vi.fn().mockResolvedValue({ user: { id: userId } }),
    allows: vi.fn().mockReturnValue(true),
  } as unknown as EventAccessService;
}

function activeReservation(units: number) {
  return {
    status: "ACTIVE" as const,
    units,
    expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
  };
}

interface LedgerFixture {
  entryGroups?: { entryType: string; _sum: { units: number | null } }[];
  reservations?: { status: string; units: number; expiresAt: Date }[];
  sentUnits?: number;
}

function prismaMock(fixture: LedgerFixture): PrismaService & {
  creditLedgerEntry: { findMany: ReturnType<typeof vi.fn> };
} {
  const client = {
    creditAccount: {
      findUnique: vi.fn().mockResolvedValue({ id: accountId }),
      upsert: vi.fn().mockResolvedValue({ id: accountId }),
    },
    creditLedgerEntry: {
      groupBy: vi.fn().mockResolvedValue(fixture.entryGroups ?? []),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    creditReservation: {
      findMany: vi.fn().mockResolvedValue(fixture.reservations ?? []),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    message: {
      aggregate: vi
        .fn()
        .mockResolvedValue({ _sum: { creditUnits: fixture.sentUnits ?? 0 } }),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
  return {
    ...client,
    $transaction: vi.fn((run: (transaction: unknown) => Promise<unknown>) =>
      run(client),
    ),
  } as unknown as PrismaService & {
    creditLedgerEntry: { findMany: ReturnType<typeof vi.fn> };
  };
}

function transactionMock(
  prisma: PrismaService,
  overrides: { existingReservation?: { id: string } | null } = {},
) {
  const client = prisma as unknown as {
    creditAccount: { upsert: ReturnType<typeof vi.fn> };
    creditLedgerEntry: {
      createMany: ReturnType<typeof vi.fn>;
      groupBy: ReturnType<typeof vi.fn>;
    };
    creditReservation: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    message: { aggregate: ReturnType<typeof vi.fn> };
    $queryRaw: ReturnType<typeof vi.fn>;
  };
  client.creditReservation.findFirst.mockResolvedValue(
    overrides.existingReservation ?? null,
  );
  return client as unknown as typeof client &
    Parameters<CreditLedgerService["reserveForSendBatch"]>[0];
}
