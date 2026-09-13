import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  createReminderRuleSchema,
  idempotencyKeySchema,
  listReminderRunsQuerySchema,
  reminderReadinessRequestSchema,
  sendRemindersSchema,
  updateReminderRuleSchema,
  type CreateReminderRuleInput,
  type ListReminderRunsQuery,
  type ListReminderRunsResponse,
  type ReminderReadinessRequest,
  type ReminderReadinessResponse,
  type ReminderRule,
  type ReminderRun,
  type ReminderRunDetail,
  type SendRemindersInput,
  type UpdateReminderRuleInput,
} from "@dawah/api-contract";
import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { ZodValidationPipe } from "../shared/zod-validation.pipe";
import { RemindersService } from "./reminders.service";

@UseGuards(AuthGuard)
@Controller("events/:eventId/reminders")
export class RemindersController {
  public constructor(
    @Inject(RemindersService) private readonly reminders: RemindersService,
  ) {}

  @Post("readiness")
  @HttpCode(HttpStatus.OK)
  public readiness(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Body(new ZodValidationPipe(reminderReadinessRequestSchema))
    input: ReminderReadinessRequest,
  ): Promise<ReminderReadinessResponse> {
    return this.reminders.readiness(request.user, eventId, input);
  }

  @Post("send")
  @HttpCode(HttpStatus.ACCEPTED)
  public send(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Headers("idempotency-key") idempotencyKeyValue: string | undefined,
    @Body(new ZodValidationPipe(sendRemindersSchema)) input: SendRemindersInput,
  ): Promise<ReminderRun> {
    return this.reminders.send(
      request.user,
      eventId,
      input,
      new ZodValidationPipe(idempotencyKeySchema).transform(
        idempotencyKeyValue,
      ),
    );
  }

  @Get("runs")
  public listRuns(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Query(new ZodValidationPipe(listReminderRunsQuerySchema))
    query: ListReminderRunsQuery,
  ): Promise<ListReminderRunsResponse> {
    return this.reminders.listRuns(request.user, eventId, query);
  }

  @Get("runs/:runId")
  public getRun(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Param("runId", new ParseUUIDPipe({ version: "4" })) runId: string,
  ): Promise<ReminderRunDetail> {
    return this.reminders.getRun(request.user, eventId, runId);
  }

  @Get("rules")
  public listRules(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
  ): Promise<ReminderRule[]> {
    return this.reminders.listRules(request.user, eventId);
  }

  @Post("rules")
  public createRule(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Body(new ZodValidationPipe(createReminderRuleSchema))
    input: CreateReminderRuleInput,
  ): Promise<ReminderRule> {
    return this.reminders.createRule(request.user, eventId, input);
  }

  @Patch("rules/:ruleId")
  public updateRule(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Param("ruleId", new ParseUUIDPipe({ version: "4" })) ruleId: string,
    @Body(new ZodValidationPipe(updateReminderRuleSchema))
    input: UpdateReminderRuleInput,
  ): Promise<ReminderRule> {
    return this.reminders.updateRule(request.user, eventId, ruleId, input);
  }
}
