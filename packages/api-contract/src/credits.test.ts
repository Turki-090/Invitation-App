import { describe, expect, it } from "vitest";
import {
  creditOverviewSchema,
  listCreditLedgerQuerySchema,
} from "./credits";

describe("credits API contract", () => {
  it("defaults bounded ledger pagination", () => {
    expect(listCreditLedgerQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
    expect(() =>
      listCreditLedgerQuerySchema.parse({ pageSize: 101 }),
    ).toThrow();
  });

  it("represents a commercially disabled account without inventing pricing", () => {
    const generatedAt = "2026-09-16T12:00:00.000Z";
    expect(
      creditOverviewSchema.parse({
        eventId: "10000000-0000-4000-8000-000000000001",
        accountId: null,
        billingEnabled: false,
        paymentActivationEnabled: false,
        balanceUnits: 0,
        reservedUnits: 0,
        availableUnits: 0,
        activeReservationCount: 0,
        reconciliation: {
          logicalMessageUnits: 0,
          chargedMessageUnits: 0,
          refundedUnits: 0,
          unchargedMessageUnits: 0,
          excessChargeUnits: 0,
          reconciled: true,
        },
        generatedAt,
      }),
    ).toMatchObject({ billingEnabled: false, balanceUnits: 0, generatedAt });
  });
});
