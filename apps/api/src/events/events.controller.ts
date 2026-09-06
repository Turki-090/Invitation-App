import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  createEventSchema,
  type CreateEventInput,
  type EventSummary,
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
}
