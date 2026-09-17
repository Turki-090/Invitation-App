import { Inject, Injectable } from "@nestjs/common";
import {
  creditOverviewSchema,
  type CreditLedgerEntry,
  type CreditOverview,
  type ListCreditLedgerQuery,
  type ListCreditLedgerResponse,
} from "@dawah/api-contract";
import { Permission } from "@dawah/domain";
import {
  Prisma,
  type CreditLedgerEntry as PersistedEntry,
} from "@prisma/client";
import type { AuthPrincipal } from "../auth/auth.types";
import { EventAccessService } from "../events/event-access.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreditLedgerService } from "./credit-ledger.service";

@Injectable()
export class CreditsService {
  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventAccessService) private readonly access: EventAccessService,
    @Inject(CreditLedgerService) private readonly ledger: CreditLedgerService,
  ) {}

  public async overview(
    principal: AuthPrincipal,
    eventId: string,
  ): Promise<CreditOverview> {
    await this.access.resolve(principal, eventId, Permission.BILLING_MANAGE);
    return this.prisma.$transaction(
      async (transaction) => {
        const [accountId, position, reconciliation] = await Promise.all([
          this.ledger.findAccountId(eventId, transaction),
          this.ledger.position(eventId, transaction),
          this.ledger.reconciliation(eventId, transaction),
        ]);
        return creditOverviewSchema.parse({
          eventId,
          accountId,
          billingEnabled: this.ledger.billingEnabled,
          paymentActivationEnabled: this.ledger.paymentActivationEnabled,
          balanceUnits: position.balanceUnits,
          reservedUnits: position.reservedUnits,
          availableUnits: position.availableUnits,
          activeReservationCount: position.activeReservationCount,
          reconciliation,
          generatedAt: new Date().toISOString(),
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  public async ledgerEntries(
    principal: AuthPrincipal,
    eventId: string,
    query: ListCreditLedgerQuery,
  ): Promise<ListCreditLedgerResponse> {
    await this.access.resolve(principal, eventId, Permission.BILLING_MANAGE);
    const where = {
      eventId,
      ...(query.entryType ? { entryType: query.entryType } : {}),
    } as const;
    const [items, totalItems] = await Promise.all([
      this.prisma.creditLedgerEntry.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.creditLedgerEntry.count({ where }),
    ]);
    return {
      items: items.map((item) => toContract(item)),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / query.pageSize),
      },
    };
  }
}

function toContract(entry: PersistedEntry): CreditLedgerEntry {
  return {
    id: entry.id,
    eventId: entry.eventId,
    actorUserId: entry.actorUserId,
    messageId: entry.messageId,
    entryType: entry.entryType,
    units: entry.units,
    referenceType: entry.referenceType,
    referenceId: entry.referenceId,
    description: entry.description,
    metadata:
      typeof entry.metadata === "object" &&
      entry.metadata !== null &&
      !Array.isArray(entry.metadata)
        ? (entry.metadata as Record<string, unknown>)
        : {},
    createdAt: entry.createdAt.toISOString(),
  };
}
