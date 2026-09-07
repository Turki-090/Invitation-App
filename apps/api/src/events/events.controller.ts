import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  createEventSchema,
  transitionEventStatusSchema,
  updateEventSchema,
  type CreateEventInput,
  type EventDashboardSummary,
  type EventDetail,
  type EventSummary,
  type TransitionEventStatusInput,
  type UpdateEventInput,
} from "@dawah/api-contract";
import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { ZodValidationPipe } from "../shared/zod-validation.pipe";
import { EventsService } from "./events.service";

@UseGuards(AuthGuard)
@Controller("events")
export class EventsController {
  public constructor(
    @Inject(EventsService) private readonly events: EventsService,
  ) {}

  @Get()
  public list(@Req() request: AuthenticatedRequest): Promise<EventSummary[]> {
    return this.events.list(request.user);
  }

  @Post()
  public create(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(createEventSchema)) input: CreateEventInput,
  ): Promise<EventSummary> {
    return this.events.create(request.user, input);
  }

  @Get(":eventId/dashboard")
  public dashboard(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
  ): Promise<EventDashboardSummary> {
    return this.events.dashboard(request.user, eventId);
  }

  @Get(":eventId")
  public get(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
  ): Promise<EventDetail> {
    return this.events.get(request.user, eventId);
  }

  @Patch(":eventId")
  public update(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Body(new ZodValidationPipe(updateEventSchema)) input: UpdateEventInput,
  ): Promise<EventDetail> {
    return this.events.update(request.user, eventId, input);
  }

  @Post(":eventId/archive")
  @HttpCode(HttpStatus.OK)
  public archive(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
  ): Promise<EventDetail> {
    return this.events.archive(request.user, eventId);
  }

  @Post(":eventId/recovery-request")
  @HttpCode(HttpStatus.OK)
  public recover(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
  ): Promise<EventDetail> {
    return this.events.recover(request.user, eventId);
  }

  @Post(":eventId/status-transitions")
  @HttpCode(HttpStatus.OK)
  public transitionStatus(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Body(new ZodValidationPipe(transitionEventStatusSchema))
    input: TransitionEventStatusInput,
  ): Promise<EventDetail> {
    return this.events.transitionStatus(request.user, eventId, input);
  }
}
