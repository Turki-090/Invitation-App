import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  createEventSchema,
  type CreateEventInput,
  type EventSummary,
} from "@dawah/api-contract";
import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { ZodValidationPipe } from "../shared/zod-validation.pipe";
import { EventsService } from "./events.service";

@ApiTags("events")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("events")
export class EventsController {
  public constructor(private readonly events: EventsService) {}

  @Get()
  @ApiOperation({ summary: "List events available to the current host" })
  public list(@Req() request: AuthenticatedRequest): Promise<EventSummary[]> {
    return this.events.list(request.user);
  }

  @Post()
  @ApiOperation({ summary: "Create an event and its owner membership" })
  public create(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(createEventSchema)) input: CreateEventInput,
  ): Promise<EventSummary> {
    return this.events.create(request.user, input);
  }
}
