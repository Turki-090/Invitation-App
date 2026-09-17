import {
  assertCreditLedgerUnits,
  assertReservationUnits,
  calculateCreditPosition,
  chargeReservation,
  CreditLedgerEntryType,
  CreditReservationStatus,
  type CreditLedgerLine,
} from "@dawah/domain";
import type { Prisma } from "@prisma/client";

export const MESSAGE_REFERENCE_TYPE = "Message";
export const SEND_BATCH_REFERENCE_TYPE = "SendBatch";

/**
 * The narrow slice of the Prisma transaction client credit accounting needs,
 * so a caller cannot reach unrelated tables through this helper.
 */
export type CreditLedgerTransaction = Pick<
  Prisma.TransactionClient,
  "creditAccount" | "creditLedgerEntry" | "creditReservation" | "$queryRaw"
>;

/** A send batch never outlives its dispatch window by more than a day. */
const RESERVATION_TTL_MILLISECONDS = 24 * 60 * 60_000;

/**
 * Raised when a scheduled batch cannot be paid for. The caller aborts its
 * transaction so nothing is queued, and the next sweep retries once the event
 * has credit again.
 */
export class InsufficientCreditError extends Error {
  public readonly code = "INSUFFICIENT_CREDITS";

  public constructor(eventId: string) {
    super(`Event ${eventId} does not have enough available credits.`);
    this.name = "InsufficientCreditError";
  }
}

export interface SendUsageInput {
  readonly eventId: string;
  readonly messageId: string;
  readonly sendBatchId: string;
  readonly units: number;
}

export interface SendRefundInput extends SendUsageInput {
  readonly reasonCode: string;
}

/**
 * Reports whether an event could hold `units` more credit right now. Events
 * without credit accounting always can, because nothing is charged for them.
 */
export async function hasAvailableCredits(
  transaction: CreditLedgerTransaction,
  eventId: string,
  units: number,
  now = new Date(),
): Promise<boolean> {
  if (units <= 0) return true;
  const accountId = await accountFor(transaction, eventId);
  if (!accountId) return true;
  const position = await creditPosition(transaction, eventId, now);
  return position.availableUnits >= units;
}

/**
 * Holds the units an automatically scheduled batch may consume. Events without
 * credit accounting are untouched; an event that cannot pay aborts the caller's
 * transaction instead of queueing messages it cannot be charged for.
 */
export async function reserveSendBatch(
  transaction: CreditLedgerTransaction,
  input: {
    readonly eventId: string;
    readonly sendBatchId: string;
    readonly createdByUserId: string;
    readonly units: number;
  },
  now = new Date(),
): Promise<boolean> {
  if (input.units <= 0) return false;
  const accountId = await accountFor(transaction, input.eventId);
  if (!accountId) return false;
  assertReservationUnits(input.units);
  await transaction.$queryRaw`
    SELECT "id" FROM "credit_accounts" WHERE "id" = ${accountId}::uuid FOR UPDATE
  `;
  const position = await creditPosition(transaction, input.eventId, now);
  if (position.availableUnits < input.units) {
    throw new InsufficientCreditError(input.eventId);
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
  return true;
}

/**
 * Charges one accepted message against the units its batch already holds.
 *
 * The database refuses a ledger entry that would take the balance below what is
 * still reserved, so the held unit is released in the same transaction and
 * before the charge. A send whose reservation is already gone is left
 * uncharged and shows up in reconciliation instead of being forced through.
 * The unique ledger reference makes a replayed acceptance a no-op.
 */
export async function chargeSendUsage(
  transaction: CreditLedgerTransaction,
  input: SendUsageInput,
  now = new Date(),
): Promise<boolean> {
  if (input.units <= 0) return false;
  const accountId = await accountFor(transaction, input.eventId);
  if (!accountId) return false;
  assertCreditLedgerUnits(CreditLedgerEntryType.SEND_USAGE, -input.units);

  const alreadyCharged = await transaction.creditLedgerEntry.findFirst({
    where: {
      creditAccountId: accountId,
      entryType: CreditLedgerEntryType.SEND_USAGE,
      referenceType: MESSAGE_REFERENCE_TYPE,
      referenceId: input.messageId,
    },
    select: { id: true },
  });
  if (alreadyCharged) return false;

  const reservation = await transaction.creditReservation.findFirst({
    where: {
      creditAccountId: accountId,
      referenceType: SEND_BATCH_REFERENCE_TYPE,
      referenceId: input.sendBatchId,
      status: CreditReservationStatus.ACTIVE,
    },
    select: { id: true, status: true, units: true },
  });
  if (!reservation || reservation.units < input.units) return false;

  const charged = chargeReservation(
    {
      status: reservation.status as CreditReservationStatus,
      units: reservation.units,
    },
    input.units,
  );
  await transaction.creditReservation.update({
    where: { id: reservation.id },
    data: {
      units: charged.heldUnits,
      status: charged.status,
      ...(charged.status === CreditReservationStatus.CONSUMED
        ? { consumedAt: now }
        : {}),
    },
  });
  const created = await transaction.creditLedgerEntry.createMany({
    data: [
      {
        eventId: input.eventId,
        creditAccountId: accountId,
        messageId: input.messageId,
        entryType: CreditLedgerEntryType.SEND_USAGE,
        units: -input.units,
        referenceType: MESSAGE_REFERENCE_TYPE,
        referenceId: input.messageId,
        description: "Logical WhatsApp send accepted by the provider.",
        metadata: { sendBatchId: input.sendBatchId },
      },
    ],
    skipDuplicates: true,
  });
  return created.count === 1;
}

/**
 * Compensates a charged message that the provider later reported as
 * undelivered. The charge itself is never erased: the ledger stays append-only.
 */
export async function refundSendUsage(
  transaction: CreditLedgerTransaction,
  input: SendRefundInput,
): Promise<boolean> {
  if (input.units <= 0) return false;
  const accountId = await accountFor(transaction, input.eventId);
  if (!accountId) return false;
  const charge = await transaction.creditLedgerEntry.findFirst({
    where: {
      creditAccountId: accountId,
      entryType: CreditLedgerEntryType.SEND_USAGE,
      referenceType: MESSAGE_REFERENCE_TYPE,
      referenceId: input.messageId,
    },
    select: { id: true },
  });
  if (!charge) return false;
  assertCreditLedgerUnits(CreditLedgerEntryType.REFUND, input.units);
  const created = await transaction.creditLedgerEntry.createMany({
    data: [
      {
        eventId: input.eventId,
        creditAccountId: accountId,
        messageId: input.messageId,
        entryType: CreditLedgerEntryType.REFUND,
        units: input.units,
        referenceType: MESSAGE_REFERENCE_TYPE,
        referenceId: input.messageId,
        description: "Refund for a message the provider could not deliver.",
        metadata: {
          sendBatchId: input.sendBatchId,
          reasonCode: input.reasonCode,
        },
      },
    ],
    skipDuplicates: true,
  });
  return created.count === 1;
}

/**
 * Returns the units a finished batch never used. Accepted messages released
 * and charged their own unit as they went, so what is left here was never
 * spent and the reservation is released rather than consumed.
 */
export async function settleSendBatchReservation(
  transaction: CreditLedgerTransaction,
  input: { readonly eventId: string; readonly sendBatchId: string },
  now = new Date(),
): Promise<boolean> {
  const accountId = await accountFor(transaction, input.eventId);
  if (!accountId) return false;
  const settled = await transaction.creditReservation.updateMany({
    where: {
      creditAccountId: accountId,
      referenceType: SEND_BATCH_REFERENCE_TYPE,
      referenceId: input.sendBatchId,
      status: CreditReservationStatus.ACTIVE,
    },
    data: { status: CreditReservationStatus.RELEASED, releasedAt: now },
  });
  return settled.count > 0;
}

async function creditPosition(
  transaction: CreditLedgerTransaction,
  eventId: string,
  now: Date,
) {
  const [entryGroups, reservations] = await Promise.all([
    transaction.creditLedgerEntry.groupBy({
      by: ["entryType"],
      where: { eventId },
      orderBy: { entryType: "asc" },
      _sum: { units: true },
    }),
    transaction.creditReservation.findMany({
      where: { eventId, status: CreditReservationStatus.ACTIVE },
      select: { status: true, units: true, expiresAt: true },
    }),
  ]);
  const lines: CreditLedgerLine[] = [];
  for (const group of entryGroups) {
    const units = group._sum.units ?? 0;
    if (units === 0) continue;
    lines.push({
      entryType: group.entryType as CreditLedgerEntryType,
      units,
    });
  }
  return calculateCreditPosition(
    lines,
    reservations.map((reservation) => ({
      status: reservation.status as CreditReservationStatus,
      units: reservation.units,
      expiresAt: reservation.expiresAt,
    })),
    now,
  );
}

/**
 * Billing leaves no rows behind when it is disabled: an event without a credit
 * account is simply not charged.
 */
async function accountFor(
  transaction: CreditLedgerTransaction,
  eventId: string,
): Promise<string | null> {
  const account = await transaction.creditAccount.findUnique({
    where: { eventId },
    select: { id: true },
  });
  return account?.id ?? null;
}
