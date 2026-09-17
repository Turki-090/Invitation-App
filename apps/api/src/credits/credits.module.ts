import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EventsModule } from "../events/events.module";
import { PrismaModule } from "../prisma/prisma.module";
import { CreditLedgerService } from "./credit-ledger.service";
import { CreditsController } from "./credits.controller";
import { CreditsService } from "./credits.service";
import { DisabledPaymentProvider, PAYMENT_PROVIDER } from "./payment-provider";

@Module({
  imports: [AuthModule, EventsModule, PrismaModule],
  controllers: [CreditsController],
  providers: [
    CreditLedgerService,
    CreditsService,
    { provide: PAYMENT_PROVIDER, useClass: DisabledPaymentProvider },
  ],
  exports: [CreditLedgerService],
})
export class CreditsModule {}
