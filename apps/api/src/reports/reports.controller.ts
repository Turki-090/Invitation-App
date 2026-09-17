import {
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { EventReport } from "@dawah/api-contract";
import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { ReportsService } from "./reports.service";

@UseGuards(AuthGuard)
@Controller("events/:eventId/reports")
export class ReportsController {
  public constructor(
    @Inject(ReportsService) private readonly reports: ReportsService,
  ) {}

  @Get()
  public get(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
  ): Promise<EventReport> {
    return this.reports.get(request.user, eventId);
  }
}
