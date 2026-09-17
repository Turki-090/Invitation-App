import type {
  CreditOverview,
  ListCreditLedgerResponse,
} from "@dawah/api-contract";
import { EmptyState } from "@dawah/ui";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { EventBilling } from "../components/event-billing";
import type { AppLocale } from "../i18n/config";
import arSA from "../i18n/dictionaries/ar-SA";
import en from "../i18n/dictionaries/en";

const meta = {
  title: "Host/Credits and billing",
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const eventId = "30000000-0000-4000-8000-000000000001";
const accountId = "30000000-0000-4000-8000-000000000002";

export const Arabic: Story = {
  globals: { locale: "ar-SA" },
  render: () => <BillingSurface locale="ar-SA" />,
};

export const English: Story = {
  globals: { locale: "en" },
  render: () => <BillingSurface locale="en" />,
};

export const BillingDisabled: Story = {
  globals: { locale: "ar-SA" },
  render: () => <BillingSurface billingEnabled={false} locale="ar-SA" />,
};

export const PermissionDenied: Story = {
  globals: { locale: "en" },
  // The workspace shell renders this state in place of the surface whenever the
  // server-computed billing capability is false.
  render: () => (
    <EmptyState
      description={en.billing.permissionDeniedDescription}
      icon="circle-alert"
      title={en.billing.permissionDeniedTitle}
    />
  ),
};

function BillingSurface({
  billingEnabled = true,
  locale,
}: {
  billingEnabled?: boolean;
  locale: AppLocale;
}) {
  const [client] = useState(() => seededClient(billingEnabled, locale));
  const dictionary = locale === "ar-SA" ? arSA : en;
  return (
    <QueryClientProvider client={client}>
      <EventBilling
        common={dictionary.common}
        copy={dictionary.billing}
        eventId={eventId}
        locale={locale}
        supabase={null}
      />
    </QueryClientProvider>
  );
}

function seededClient(billingEnabled: boolean, locale: AppLocale): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: {
        refetchOnMount: false,
        refetchOnReconnect: false,
        refetchOnWindowFocus: false,
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
      },
    },
  });
  client.setQueryData(["events", eventId, "credits"], overview(billingEnabled));
  client.setQueryData(
    ["events", eventId, "credits", "ledger"],
    billingEnabled ? ledger(locale) : emptyLedger(),
  );
  return client;
}

function overview(billingEnabled: boolean): CreditOverview {
  return {
    eventId,
    accountId,
    billingEnabled,
    paymentActivationEnabled: false,
    balanceUnits: billingEnabled ? 1_200 : 0,
    reservedUnits: billingEnabled ? 180 : 0,
    availableUnits: billingEnabled ? 1_020 : 0,
    activeReservationCount: billingEnabled ? 3 : 0,
    reconciliation: {
      logicalMessageUnits: 420,
      chargedMessageUnits: 420,
      refundedUnits: 12,
      unchargedMessageUnits: 0,
      excessChargeUnits: 0,
      reconciled: true,
    },
    generatedAt: "2026-09-17T09:00:00.000Z",
  };
}

function ledger(locale: AppLocale): ListCreditLedgerResponse {
  const arabic = locale === "ar-SA";
  return {
    items: [
      {
        id: "30000000-0000-4000-8000-000000000010",
        eventId,
        actorUserId: null,
        messageId: null,
        entryType: "PURCHASE",
        units: 1_000,
        referenceType: "purchase",
        referenceId: "purchase-1",
        description: arabic ? "باقة رصيد أولية" : "Initial credit pack",
        metadata: {},
        createdAt: "2026-09-15T09:00:00.000Z",
      },
      {
        id: "30000000-0000-4000-8000-000000000011",
        eventId,
        actorUserId: null,
        messageId: "30000000-0000-4000-8000-000000000012",
        entryType: "SEND_USAGE",
        units: -120,
        referenceType: "message",
        referenceId: "message-1",
        description: null,
        metadata: {},
        createdAt: "2026-09-16T09:00:00.000Z",
      },
      {
        id: "30000000-0000-4000-8000-000000000013",
        eventId,
        actorUserId: null,
        messageId: null,
        entryType: "REFUND",
        units: 12,
        referenceType: "message",
        referenceId: "message-2",
        description: arabic ? "استرداد رسالة فاشلة" : "Failed message refund",
        metadata: {},
        createdAt: "2026-09-16T10:00:00.000Z",
      },
    ],
    pagination: { page: 1, pageSize: 20, totalItems: 3, totalPages: 1 },
  };
}

function emptyLedger(): ListCreditLedgerResponse {
  return {
    items: [],
    pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
  };
}
