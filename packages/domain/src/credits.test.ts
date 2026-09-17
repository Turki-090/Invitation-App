import { describe, expect, it } from "vitest";
import {
  assertCreditLedgerUnits,
  calculateCreditPosition,
  chargeReservation,
  CreditLedgerEntryType,
  CreditReservationStatus,
  reconcileCreditUsage,
  reservationCanTransition,
} from "./credits";

describe("credit accounting rules", () => {
  it("calculates balance and ignores terminal or expired reservations", () => {
    const now = new Date("2026-09-16T12:00:00.000Z");
    expect(
      calculateCreditPosition(
        [
          { entryType: CreditLedgerEntryType.PURCHASE, units: 20 },
          { entryType: CreditLedgerEntryType.SEND_USAGE, units: -4 },
          { entryType: CreditLedgerEntryType.REFUND, units: 1 },
        ],
        [
          {
            status: CreditReservationStatus.ACTIVE,
            units: 5,
            expiresAt: new Date("2026-09-16T13:00:00.000Z"),
          },
          {
            status: CreditReservationStatus.ACTIVE,
            units: 7,
            expiresAt: new Date("2026-09-16T11:59:59.000Z"),
          },
          {
            status: CreditReservationStatus.RELEASED,
            units: 3,
            expiresAt: new Date("2026-09-16T13:00:00.000Z"),
          },
        ],
        now,
      ),
    ).toEqual({
      balanceUnits: 17,
      reservedUnits: 5,
      availableUnits: 12,
      activeReservationCount: 1,
    });
  });

  it("keeps refunds separate while reconciling logical charges", () => {
    expect(
      reconcileCreditUsage(3, [
        { entryType: CreditLedgerEntryType.SEND_USAGE, units: -1 },
        { entryType: CreditLedgerEntryType.SEND_USAGE, units: -1 },
        { entryType: CreditLedgerEntryType.REFUND, units: 1 },
      ]),
    ).toEqual({
      logicalMessageUnits: 3,
      chargedMessageUnits: 2,
      refundedUnits: 1,
      unchargedMessageUnits: 1,
      excessChargeUnits: 0,
      reconciled: false,
    });
  });

  it("enforces the ledger sign convention", () => {
    expect(() =>
      assertCreditLedgerUnits(CreditLedgerEntryType.PURCHASE, -1),
    ).toThrow("must be positive");
    expect(() =>
      assertCreditLedgerUnits(CreditLedgerEntryType.SEND_USAGE, 1),
    ).toThrow("must be negative");
    expect(() =>
      assertCreditLedgerUnits(CreditLedgerEntryType.MANUAL_ADJUSTMENT, 0),
    ).toThrow("cannot be zero");
  });

  it("releases held units one logical send at a time", () => {
    expect(
      chargeReservation({
        status: CreditReservationStatus.ACTIVE,
        units: 3,
      }),
    ).toEqual({ heldUnits: 2, status: CreditReservationStatus.ACTIVE });
    expect(
      chargeReservation({
        status: CreditReservationStatus.ACTIVE,
        units: 1,
      }),
    ).toEqual({ heldUnits: 1, status: CreditReservationStatus.CONSUMED });
  });

  it("refuses to charge a terminal reservation or exceed its held units", () => {
    expect(() =>
      chargeReservation({
        status: CreditReservationStatus.CONSUMED,
        units: 2,
      }),
    ).toThrow("active reservation");
    expect(() =>
      chargeReservation(
        { status: CreditReservationStatus.ACTIVE, units: 2 },
        3,
      ),
    ).toThrow("beyond the units it holds");
  });

  it("permits only terminal transitions from an active reservation", () => {
    expect(
      reservationCanTransition(
        CreditReservationStatus.ACTIVE,
        CreditReservationStatus.CONSUMED,
      ),
    ).toBe(true);
    expect(
      reservationCanTransition(
        CreditReservationStatus.RELEASED,
        CreditReservationStatus.ACTIVE,
      ),
    ).toBe(false);
  });
});
