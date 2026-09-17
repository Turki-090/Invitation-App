"use client";

import type { CreditLedgerEntry } from "@dawah/api-contract";
import {
  Banner,
  Button,
  Card,
  EmptyState,
  Skeleton,
  StatCard,
  Tag,
} from "@dawah/ui";
import { useQuery } from "@tanstack/react-query";
import React from "react";
import type { AppLocale } from "../i18n/config";
import type { Dictionary } from "../i18n/dictionaries";
import { getCreditOverview, listCreditLedger } from "../lib/api";
import type { getSupabaseClient } from "../lib/supabase";

interface EventBillingProps {
  common: Dictionary["common"];
  copy: Dictionary["billing"];
  eventId: string;
  locale: AppLocale;
  supabase: ReturnType<typeof getSupabaseClient>;
}

export function EventBilling({
  common,
  copy,
  eventId,
  locale,
  supabase,
}: EventBillingProps) {
  const overview = useQuery({
    queryKey: ["events", eventId, "credits"],
    queryFn: () => getCreditOverview(supabase, eventId),
  });
  const ledger = useQuery({
    queryKey: ["events", eventId, "credits", "ledger"],
    queryFn: () =>
      listCreditLedger(supabase, eventId, { page: 1, pageSize: 20 }),
  });

  return (
    <div className="billing-page">
      <header className="workspace-page-header">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </div>
      </header>

      {overview.isLoading ? (
        <BillingLoading label={copy.loading} />
      ) : overview.isError || !overview.data ? (
        <EmptyState
          action={
            <Button onClick={() => overview.refetch()} variant="secondary">
              {common.retry}
            </Button>
          }
          description={copy.loadError}
          icon="circle-alert"
          title={copy.loadError}
        />
      ) : (
        <>
          {overview.data.billingEnabled ? null : (
            <Banner kind="info" title={copy.billingDisabled} />
          )}
          {overview.data.billingEnabled &&
          !overview.data.paymentActivationEnabled ? (
            <Banner kind="info" title={copy.paymentsDisabled} />
          ) : null}
          <div className="workspace-stat-grid">
            <StatCard
              context={copy.creditsUnit}
              label={copy.balance}
              locale={locale}
              value={overview.data.balanceUnits}
            />
            <StatCard
              context={copy.creditsUnit}
              label={copy.reserved}
              locale={locale}
              tone="pending"
              value={overview.data.reservedUnits}
            />
            <StatCard
              context={copy.creditsUnit}
              label={copy.available}
              locale={locale}
              tone="accepted"
              value={overview.data.availableUnits}
            />
          </div>
        </>
      )}

      <Card title={copy.ledgerTitle}>
        {ledger.isLoading ? (
          <BillingLoading label={copy.loading} />
        ) : ledger.isError || !ledger.data ? (
          <EmptyState
            action={
              <Button onClick={() => ledger.refetch()} variant="secondary">
                {common.retry}
              </Button>
            }
            description={copy.loadError}
            icon="circle-alert"
            title={copy.loadError}
          />
        ) : ledger.data.items.length === 0 ? (
          <EmptyState
            description={copy.noEntriesDescription}
            icon="file-text"
            title={copy.noEntriesTitle}
          />
        ) : (
          <ul className="billing-ledger-list">
            {ledger.data.items.map((entry) => (
              <li className="billing-ledger-entry" key={entry.id}>
                <div className="billing-ledger-entry__details">
                  <strong>{entryLabel(entry.entryType, copy)}</strong>
                  <small>{formatDateTime(entry.createdAt, locale)}</small>
                  {entry.description ? (
                    <small>{entry.description}</small>
                  ) : null}
                </div>
                <Tag size="sm" tone={entry.units < 0 ? "neutral" : "accent"}>
                  {formatSignedNumber(entry.units, locale)} {copy.creditsUnit}
                </Tag>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function BillingLoading({ label }: { label: string }) {
  return (
    <div aria-busy="true" aria-label={label} className="billing-loading">
      <Skeleton height={72} />
      <Skeleton height={72} />
    </div>
  );
}

function entryLabel(
  entryType: CreditLedgerEntry["entryType"],
  copy: Dictionary["billing"],
): string {
  return {
    PURCHASE: copy.entryPurchase,
    BONUS: copy.entryBonus,
    SEND_USAGE: copy.entrySendUsage,
    REFUND: copy.entryRefund,
    MANUAL_ADJUSTMENT: copy.entryManualAdjustment,
    EXPIRY: copy.entryExpiry,
  }[entryType];
}

function formatDateTime(value: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatSignedNumber(value: number, locale: AppLocale): string {
  return new Intl.NumberFormat(
    locale === "ar-SA" ? "ar-SA-u-nu-arab" : "en-US",
    { signDisplay: "exceptZero" },
  ).format(value);
}
