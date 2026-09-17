import "../test/setup";
import type {
  CreditOverview,
  ListCreditLedgerResponse,
} from "@dawah/api-contract";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "../i18n/dictionaries/en";
import { EventBilling } from "./event-billing";

const eventId = "11111111-1111-4111-8111-111111111111";
const accountId = "22222222-2222-4222-8222-222222222222";

const api = vi.hoisted(() => ({
  getCreditOverview: vi.fn(),
  listCreditLedger: vi.fn(),
}));

vi.mock("../lib/api", () => api);

const overview: CreditOverview = {
  eventId,
  accountId,
  billingEnabled: true,
  paymentActivationEnabled: false,
  balanceUnits: 120,
  reservedUnits: 20,
  availableUnits: 100,
  activeReservationCount: 1,
  reconciliation: {
    logicalMessageUnits: 30,
    chargedMessageUnits: 30,
    refundedUnits: 2,
    unchargedMessageUnits: 0,
    excessChargeUnits: 0,
    reconciled: true,
  },
  generatedAt: "2026-09-16T09:00:00.000Z",
};

const ledger: ListCreditLedgerResponse = {
  items: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      eventId,
      actorUserId: null,
      messageId: "44444444-4444-4444-8444-444444444444",
      entryType: "SEND_USAGE",
      units: -1,
      referenceType: "Message",
      referenceId: "44444444-4444-4444-8444-444444444444",
      description: "Logical WhatsApp send accepted by the provider.",
      metadata: {},
      createdAt: "2026-09-16T08:30:00.000Z",
    },
    {
      id: "55555555-5555-4555-8555-555555555555",
      eventId,
      actorUserId: null,
      messageId: null,
      entryType: "PURCHASE",
      units: 150,
      referenceType: "Payment",
      referenceId: "payment-1",
      description: null,
      metadata: {},
      createdAt: "2026-09-15T08:30:00.000Z",
    },
  ],
  pagination: { page: 1, pageSize: 20, totalItems: 2, totalPages: 1 },
};

function renderBilling() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <EventBilling
        common={en.common}
        copy={en.billing}
        eventId={eventId}
        locale="en"
        supabase={null}
      />
    </QueryClientProvider>,
  );
}

describe("event billing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getCreditOverview.mockResolvedValue(overview);
    api.listCreditLedger.mockResolvedValue(ledger);
  });

  it("separates balance, reserved, and available credit", async () => {
    renderBilling();

    expect(await screen.findByText(en.billing.available)).toBeTruthy();
    expect(screen.getByText("120")).toBeTruthy();
    expect(screen.getByText("20")).toBeTruthy();
    expect(screen.getByText("100")).toBeTruthy();
  });

  it("states that online payments are not activated", async () => {
    renderBilling();

    expect(await screen.findByText(en.billing.paymentsDisabled)).toBeTruthy();
  });

  it("says plainly when commercial billing is switched off", async () => {
    api.getCreditOverview.mockResolvedValue({
      ...overview,
      accountId: null,
      billingEnabled: false,
      balanceUnits: 0,
      reservedUnits: 0,
      availableUnits: 0,
      activeReservationCount: 0,
    });
    renderBilling();

    expect(await screen.findByText(en.billing.billingDisabled)).toBeTruthy();
    expect(screen.queryByText(en.billing.paymentsDisabled)).toBeNull();
  });

  it("shows each append-only movement with its direction", async () => {
    renderBilling();

    expect(await screen.findByText(en.billing.entrySendUsage)).toBeTruthy();
    expect(screen.getByText(en.billing.entryPurchase)).toBeTruthy();
    expect(screen.getByText(`-1 ${en.billing.creditsUnit}`)).toBeTruthy();
    expect(screen.getByText(`+150 ${en.billing.creditsUnit}`)).toBeTruthy();
  });

  it("shows an empty ledger state before any movement", async () => {
    api.listCreditLedger.mockResolvedValue({
      items: [],
      pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
    });
    renderBilling();

    expect(await screen.findByText(en.billing.noEntriesTitle)).toBeTruthy();
  });
});
