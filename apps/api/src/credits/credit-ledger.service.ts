import { ConflictException, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ApiEnvironment } from "@dawah/config";
import {
  assertCreditLedgerUnits,
  assertReservationUnits,
  calculateCreditPosition,
  CreditLedgerEntryType,
  CreditReservationStatus,
  reconcileCreditUsage,
  type CreditLedgerLine,
  type CreditPosition,
  type CreditReconciliation,
} from "@dawah/domain";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type LedgerClient = PrismaService | Prisma.TransactionClient;

export const SEND_BATCH_REFERENCE_TYPE = "SendBatch";
export const MESSAGE_REFERENCE_TYPE = "Message";

/** A send batch never outlives its dispatch window by more than a day. */
const RESERVATION_TTL_MILLISECONDS = 24 * 60 * 60_000;

export interface SendBatchReservationInput {
  readonly eventId: string;
  readonly sendBatchId: string;
  readonly units: number;
  readonly createdByUserId: string;
}

export interface LedgerEntryInput {
  readonly eventId: string;
  readonly actorUserId: string | null;
  readonly units: number;
  readonly referenceType: string;
  readonly referenceId: string;
  readonly description?: string;
  readonly metadata?: Prisma.InputJsonValue;
}

/**
 * Append-only credit accounting. Every write is keyed by an immutable
 * reference so a retried request cannot charge the same logical send twice,
 * and availability is always evaluated inside the caller's transaction.
 */
@Injectable()
export class CreditLedgerService {
  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService)
    private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}

  public get billingEnabled(): boolean {
    return this.config.get("BILLING_ENABLED", { infer: true });
  }

  public get paymentActivationEnabled(): boolean {
    return this.config.get("PAYMENTS_ENABLED", { infer: true });
  }

  public async findAccountId(
    eventId: string,
    client: LedgerClient = this.prisma,
  ): Promise<string | null> {
    const account = await client.creditAccount.findUnique({
      where: { eventId },
      select: { id: true },
    });
    return account?.id ?? null;
  }

  /**
   * Accounts are only created once an event actually needs credit
   * accounting, so a deployment with billing disabled keeps no billing rows.
   */
  public async ensureAccount(
    transaction: Prisma.TransactionClient,
    eventId: string,
  ): Promise<string> {
    const account = await transaction.creditAccount.upsert({
      where: { eventId },
      create: { eventId },
      update: {},
      select: { id: true },
    });
    return account.id;
  }

  public async position(
    eventId: string,
    client: LedgerClient = this.prisma,
    now = new Date(),
  ): Promise<CreditPosition> {
    const [entryGroups, reservations] = await Promise.all([
      client.creditLedgerEntry.groupBy({
        by: ["entryType"],
        where: { eventId },
        orderBy: { entryType: "asc" },
        _sum: { units: true },
      }),
      client.creditReservation.findMany({
        where: { eventId, status: CreditReservationStatus.ACTIVE },
        select: { status: true, units: true, expiresAt: true },
      }),
    ]);
    return calculateCreditPosition(
      aggregatedLines(entryGroups),
      reservations.map((reservation) => ({
        status: reservation.status as CreditReservationStatus,
        units: reservation.units,
        expiresAt: reservation.expiresAt,
      })),
      now,
    );
  }

  /**
   * Compares the immutable logical-send stream against the ledger. A message
   * counts as a logical send once the provider has accepted it.
   */
  public async reconciliation(
    eventId: string,
    client: LedgerClient = this.prisma,
  ): Promise<CreditReconciliation> {
    const [sent, entryGroups] = await Promise.all([
      client.message.aggregate({
        where: { eventId, sentAt: { not: null } },
        _sum: { creditUnits: true },
      }),
      client.creditLedgerEntry.groupBy({
        by: ["entryType"],
        where: { eventId },
        orderBy: { entryType: "asc" },
        _sum: { units: true },
      }),
    ]);
    return reconcileCreditUsage(
      sent._sum.creditUnits ?? 0,
      aggregatedLines(entryGroups),
    );
  }

  /**
   * Holds the units a queued batch may consume. The hold is released when the
   * batch reaches a terminal state, by which point the accepted messages have
   * been charged individually.
   */
  public async reserveForSendBatch(
    transaction: Prisma.TransactionClient,
    input: SendBatchReservationInput,
    now = new Date(),
  ): Promise<void> {
    if (!this.billingEnabled || input.units === 0) return;
    assertReservationUnits(input.units);
    const accountId = await this.ensureAccount(transaction, input.eventId);
    await transaction.$queryRaw`
      SELECT "id" FROM "credit_accounts" WHERE "id" = ${accountId}::uuid FOR UPDATE
    `;
    const existing = await transaction.creditReservation.findFirst({
      where: {
        creditAccountId: accountId,
        referenceType: SEND_BATCH_REFERENCE_TYPE,
        referenceId: input.sendBatchId,
      },
      select: { id: true },
    });
    if (existing) return;

    const position = await this.position(input.eventId, transaction, now);
    if (position.availableUnits < input.units) {
      throw new ConflictException({
        code: "INSUFFICIENT_CREDITS",
        message:
          "The event does not have enough available credits for this send.",
      });
    }
    await transaction.creditReservation.create({
      data: {
        eventId: input.eventId,
        creditAccountId: accountId,
        createdByUserId: input.createdByUserId,
        sendBatchId: input.sendBatchId,
        status: CreditReservationStatus.ACTIVE,
        units: input.units,
        referenceType: SEND_BATCH_REFERENCE_TYPE,
        referenceId: input.sendBatchId,
        expiresAt: new Date(now.getTime() + RESERVATION_TTL_MILLISECONDS),
      },
    });
  }

  /** Records settled payment credit. Operator and payment-provider entry point. */
  public recordPurchase(
    transaction: Prisma.TransactionClient,
    input: LedgerEntryInput,
  ): Promise<void> {
    return this.append(transaction, CreditLedgerEntryType.PURCHASE, input);
  }

  /** Records a corrective grant or deduction made by a platform operator. */
  public recordManualAdjustment(
    transaction: Prisma.TransactionClient,
    input: LedgerEntryInput,
  ): Promise<void> {
    return this.append(
      transaction,
      CreditLedgerEntryType.MANUAL_ADJUSTMENT,
      input,
    );
  }

  private async append(
    transaction: Prisma.TransactionClient,
    entryType: CreditLedgerEntryType,
    input: LedgerEntryInput,
  ): Promise<void> {
    assertCreditLedgerUnits(entryType, input.units);
    const accountId = await this.ensureAccount(transaction, input.eventId);
    await transaction.$queryRaw`
      SELECT "id" FROM "credit_accounts" WHERE "id" = ${accountId}::uuid FOR UPDATE
    `;
    if (input.units < 0) {
      // The database guard compares against reserved units too, so the service
      // refuses the same entry with a stable code instead of surfacing a
      // constraint violation.
      const position = await this.position(input.eventId, transaction);
      if (position.availableUnits + input.units < 0) {
        throw new ConflictException({
          code: "INSUFFICIENT_CREDITS",
          message:
            "A credit balance cannot fall below the units already reserved.",
        });
      }
    }
    await transaction.creditLedgerEntry.createMany({
      data: [
        {
          eventId: input.eventId,
          creditAccountId: accountId,
          actorUserId: input.actorUserId,
          entryType,
          units: input.units,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          description: input.description ?? null,
          metadata: input.metadata ?? {},
        },
      ],
      skipDuplicates: true,
    });
  }
}

/**
 * Turns per-type sums into ledger lines so balance arithmetic stays in the
 * domain package. Offsetting manual adjustments can net to zero, which is a
 * valid aggregate even though a single zero-unit entry never is.
 */
function aggregatedLines(
  groups: readonly {
    readonly entryType: string;
    readonly _sum: { readonly units: number | null };
  }[],
): readonly CreditLedgerLine[] {
  const lines: CreditLedgerLine[] = [];
  for (const group of groups) {
    const units = group._sum.units ?? 0;
    if (units === 0) continue;
    lines.push({
      entryType: group.entryType as CreditLedgerEntryType,
      units,
    });
  }
  return lines;
}
