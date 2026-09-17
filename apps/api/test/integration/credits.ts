import type { ConfigService } from "@nestjs/config";
import type { ApiEnvironment } from "@dawah/config";
import { CreditLedgerService } from "../../src/credits/credit-ledger.service";
import type { PrismaService } from "../../src/prisma/prisma.service";

/**
 * Credit accounting is a commercial feature flag, so integration tests state
 * explicitly whether an event is billed rather than depending on environment.
 */
export function createCreditLedger(
  prisma: PrismaService,
  flags: { billingEnabled?: boolean; paymentsEnabled?: boolean } = {},
): CreditLedgerService {
  return new CreditLedgerService(prisma, {
    get: (key: string) =>
      key === "BILLING_ENABLED"
        ? (flags.billingEnabled ?? false)
        : (flags.paymentsEnabled ?? false),
  } as unknown as ConfigService<ApiEnvironment, true>);
}
