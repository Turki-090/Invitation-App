export const CreditLedgerEntryType = {
  PURCHASE: "PURCHASE",
  BONUS: "BONUS",
  SEND_USAGE: "SEND_USAGE",
  REFUND: "REFUND",
  MANUAL_ADJUSTMENT: "MANUAL_ADJUSTMENT",
  EXPIRY: "EXPIRY",
} as const;

export type CreditLedgerEntryType =
  (typeof CreditLedgerEntryType)[keyof typeof CreditLedgerEntryType];

export const CreditReservationStatus = {
  ACTIVE: "ACTIVE",
  CONSUMED: "CONSUMED",
  RELEASED: "RELEASED",
  EXPIRED: "EXPIRED",
} as const;

export type CreditReservationStatus =
  (typeof CreditReservationStatus)[keyof typeof CreditReservationStatus];

export interface CreditLedgerLine {
  readonly entryType: CreditLedgerEntryType;
  readonly units: number;
  readonly messageId?: string | null;
}

export interface CreditReservationLine {
  readonly status: CreditReservationStatus;
  readonly units: number;
  readonly expiresAt: Date;
}

export interface CreditPosition {
  readonly balanceUnits: number;
  readonly reservedUnits: number;
  readonly availableUnits: number;
  readonly activeReservationCount: number;
}

export interface CreditReconciliation {
  readonly logicalMessageUnits: number;
  readonly chargedMessageUnits: number;
  readonly refundedUnits: number;
  readonly unchargedMessageUnits: number;
  readonly excessChargeUnits: number;
  readonly reconciled: boolean;
}

const positiveEntryTypes = new Set<CreditLedgerEntryType>([
  CreditLedgerEntryType.PURCHASE,
  CreditLedgerEntryType.BONUS,
  CreditLedgerEntryType.REFUND,
]);

const negativeEntryTypes = new Set<CreditLedgerEntryType>([
  CreditLedgerEntryType.SEND_USAGE,
  CreditLedgerEntryType.EXPIRY,
]);

/**
 * Validates the sign convention shared by the application and database. Credit
 * quantities are integers so accounting never depends on floating point math.
 */
export function assertCreditLedgerUnits(
  entryType: CreditLedgerEntryType,
  units: number,
): void {
  assertSafeInteger(units, "Credit ledger units");
  if (positiveEntryTypes.has(entryType) && units <= 0) {
    throw new RangeError(`${entryType} credit units must be positive.`);
  }
  if (negativeEntryTypes.has(entryType) && units >= 0) {
    throw new RangeError(`${entryType} credit units must be negative.`);
  }
  if (entryType === CreditLedgerEntryType.MANUAL_ADJUSTMENT && units === 0) {
    throw new RangeError("Manual credit adjustments cannot be zero.");
  }
}

export function assertReservationUnits(units: number): void {
  assertSafeInteger(units, "Credit reservation units");
  if (units <= 0) {
    throw new RangeError("Credit reservation units must be positive.");
  }
}

export function calculateCreditPosition(
  entries: readonly CreditLedgerLine[],
  reservations: readonly CreditReservationLine[],
  now = new Date(),
): CreditPosition {
  let balanceUnits = 0;
  for (const entry of entries) {
    assertCreditLedgerUnits(entry.entryType, entry.units);
    balanceUnits = addSafe(balanceUnits, entry.units);
  }

  let reservedUnits = 0;
  let activeReservationCount = 0;
  for (const reservation of reservations) {
    assertReservationUnits(reservation.units);
    if (
      reservation.status !== CreditReservationStatus.ACTIVE ||
      reservation.expiresAt.getTime() <= now.getTime()
    ) {
      continue;
    }
    reservedUnits = addSafe(reservedUnits, reservation.units);
    activeReservationCount += 1;
  }

  return {
    balanceUnits,
    reservedUnits,
    availableUnits: addSafe(balanceUnits, -reservedUnits),
    activeReservationCount,
  };
}

/**
 * Reconciles one immutable logical-message unit stream against the append-only
 * ledger. Refunds are reported separately: they compensate a charge without
 * erasing its history.
 */
export function reconcileCreditUsage(
  logicalMessageUnits: number,
  entries: readonly CreditLedgerLine[],
): CreditReconciliation {
  assertNonnegativeSafeInteger(logicalMessageUnits, "Logical message units");
  let chargedMessageUnits = 0;
  let refundedUnits = 0;

  for (const entry of entries) {
    assertCreditLedgerUnits(entry.entryType, entry.units);
    if (entry.entryType === CreditLedgerEntryType.SEND_USAGE) {
      chargedMessageUnits = addSafe(chargedMessageUnits, -entry.units);
    } else if (entry.entryType === CreditLedgerEntryType.REFUND) {
      refundedUnits = addSafe(refundedUnits, entry.units);
    }
  }

  const difference = logicalMessageUnits - chargedMessageUnits;
  return {
    logicalMessageUnits,
    chargedMessageUnits,
    refundedUnits,
    unchargedMessageUnits: Math.max(0, difference),
    excessChargeUnits: Math.max(0, -difference),
    reconciled: difference === 0,
  };
}

export function reservationCanTransition(
  current: CreditReservationStatus,
  next: CreditReservationStatus,
): boolean {
  if (current === next) return true;
  return (
    current === CreditReservationStatus.ACTIVE &&
    (next === CreditReservationStatus.CONSUMED ||
      next === CreditReservationStatus.RELEASED ||
      next === CreditReservationStatus.EXPIRED)
  );
}

export interface ReservationCharge {
  /** Units the reservation still holds after the charge. */
  readonly heldUnits: number;
  readonly status: CreditReservationStatus;
}

/**
 * An active reservation holds the units a launched batch still owes. Charging a
 * logical send releases one held unit in the same transaction as its negative
 * ledger entry, so the database availability guard admits the charge without a
 * window in which the same balance could be reserved twice.
 *
 * `heldUnits` stays positive: the final charge keeps the last held amount and
 * moves the reservation to `CONSUMED`, which removes it from availability math.
 */
export function chargeReservation(
  reservation: {
    readonly status: CreditReservationStatus;
    readonly units: number;
  },
  units = 1,
): ReservationCharge {
  assertReservationUnits(reservation.units);
  assertSafeInteger(units, "Charged reservation units");
  if (units <= 0) {
    throw new RangeError("Charged reservation units must be positive.");
  }
  if (reservation.status !== CreditReservationStatus.ACTIVE) {
    throw new RangeError("Only an active reservation can be charged.");
  }
  if (units > reservation.units) {
    throw new RangeError(
      "A reservation cannot be charged beyond the units it holds.",
    );
  }
  const remaining = reservation.units - units;
  return remaining === 0
    ? {
        heldUnits: reservation.units,
        status: CreditReservationStatus.CONSUMED,
      }
    : { heldUnits: remaining, status: CreditReservationStatus.ACTIVE };
}

function assertNonnegativeSafeInteger(value: number, label: string): void {
  assertSafeInteger(value, label);
  if (value < 0) throw new RangeError(`${label} cannot be negative.`);
}

function assertSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer.`);
  }
}

function addSafe(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw new RangeError("Credit total exceeds the safe integer range.");
  }
  return result;
}
