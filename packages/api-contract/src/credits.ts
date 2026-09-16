import { z } from "zod";

export const CREDIT_LEDGER_ENTRY_TYPES = [
  "PURCHASE",
  "BONUS",
  "SEND_USAGE",
  "REFUND",
  "MANUAL_ADJUSTMENT",
  "EXPIRY",
] as const;

export const CREDIT_RESERVATION_STATUSES = [
  "ACTIVE",
  "CONSUMED",
  "RELEASED",
  "EXPIRED",
] as const;

export const creditLedgerEntryTypeSchema = z.enum(CREDIT_LEDGER_ENTRY_TYPES);
export const creditReservationStatusSchema = z.enum(
  CREDIT_RESERVATION_STATUSES,
);

export const creditReconciliationSchema = z.object({
  logicalMessageUnits: z.number().int().nonnegative(),
  chargedMessageUnits: z.number().int().nonnegative(),
  refundedUnits: z.number().int().nonnegative(),
  unchargedMessageUnits: z.number().int().nonnegative(),
  excessChargeUnits: z.number().int().nonnegative(),
  reconciled: z.boolean(),
});
export type CreditReconciliation = z.infer<
  typeof creditReconciliationSchema
>;

export const creditOverviewSchema = z.object({
  eventId: z.uuid(),
  accountId: z.uuid().nullable(),
  billingEnabled: z.boolean(),
  paymentActivationEnabled: z.boolean(),
  balanceUnits: z.number().int(),
  reservedUnits: z.number().int().nonnegative(),
  availableUnits: z.number().int(),
  activeReservationCount: z.number().int().nonnegative(),
  reconciliation: creditReconciliationSchema,
  generatedAt: z.string(),
});
export type CreditOverview = z.infer<typeof creditOverviewSchema>;

export const creditLedgerEntrySchema = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  actorUserId: z.uuid().nullable(),
  messageId: z.uuid().nullable(),
  entryType: creditLedgerEntryTypeSchema,
  units: z.number().int(),
  referenceType: z.string().min(1).max(64),
  referenceId: z.string().min(1).max(255),
  description: z.string().max(500).nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});
export type CreditLedgerEntry = z.infer<typeof creditLedgerEntrySchema>;

export const listCreditLedgerQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  entryType: creditLedgerEntryTypeSchema.optional(),
});
export type ListCreditLedgerQuery = z.infer<
  typeof listCreditLedgerQuerySchema
>;

export const listCreditLedgerResponseSchema = z.object({
  items: z.array(creditLedgerEntrySchema),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive().max(100),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});
export type ListCreditLedgerResponse = z.infer<
  typeof listCreditLedgerResponseSchema
>;
