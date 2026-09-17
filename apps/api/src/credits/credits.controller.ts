import {
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  listCreditLedgerQuerySchema,
  type CreditOverview,
  type ListCreditLedgerQuery,
  type ListCreditLedgerResponse,
} from "@dawah/api-contract";
import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { ZodValidationPipe } from "../shared/zod-validation.pipe";
import { CreditsService } from "./credits.service";

@UseGuards(AuthGuard)
@Controller("events/:eventId/credits")
export class CreditsController {
  public constructor(
    @Inject(CreditsService) private readonly credits: CreditsService,
  ) {}

  @Get()
  public overview(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
  ): Promise<CreditOverview> {
    return this.credits.overview(request.user, eventId);
  }

  @Get("ledger")
  public ledger(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Query(new ZodValidationPipe(listCreditLedgerQuerySchema))
    query: ListCreditLedgerQuery,
  ): Promise<ListCreditLedgerResponse> {
    return this.credits.ledgerEntries(request.user, eventId, query);
  }
}
