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
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  bulkCancelInvitationsSchema,
  createInvitationSchema,
  listInvitationsQuerySchema,
  updateInvitationSchema,
  type BulkCancelInvitationsInput,
  type BulkCancelInvitationsResult,
  type CreateInvitationInput,
  type InvitationDetail,
  type InvitationListResponse,
  type ListInvitationsQuery,
  type UpdateInvitationInput,
} from "@dawah/api-contract";
import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { ZodValidationPipe } from "../shared/zod-validation.pipe";
import { InvitationsService } from "./invitations.service";

@UseGuards(AuthGuard)
@Controller("events/:eventId/invitations")
export class InvitationsController {
  public constructor(
    @Inject(InvitationsService)
    private readonly invitations: InvitationsService,
  ) {}

  @Get()
  public list(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Query(new ZodValidationPipe(listInvitationsQuerySchema))
    query: ListInvitationsQuery,
  ): Promise<InvitationListResponse> {
    return this.invitations.list(request.user, eventId, query);
  }

  @Post("bulk-cancel")
  @HttpCode(HttpStatus.OK)
  public bulkCancel(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Body(new ZodValidationPipe(bulkCancelInvitationsSchema))
    input: BulkCancelInvitationsInput,
  ): Promise<BulkCancelInvitationsResult> {
    return this.invitations.bulkCancel(request.user, eventId, input);
  }

  @Post(":invitationId/cancel")
  @HttpCode(HttpStatus.OK)
  public cancel(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Param("invitationId", new ParseUUIDPipe({ version: "4" }))
    invitationId: string,
  ): Promise<InvitationDetail> {
    return this.invitations.cancel(request.user, eventId, invitationId);
  }

  @Post()
  public create(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Body(new ZodValidationPipe(createInvitationSchema))
    input: CreateInvitationInput,
  ): Promise<InvitationDetail> {
    return this.invitations.create(request.user, eventId, input);
  }

  @Get(":invitationId")
  public get(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Param("invitationId", new ParseUUIDPipe({ version: "4" }))
    invitationId: string,
  ): Promise<InvitationDetail> {
    return this.invitations.get(request.user, eventId, invitationId);
  }

  @Patch(":invitationId")
  public update(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Param("invitationId", new ParseUUIDPipe({ version: "4" }))
    invitationId: string,
    @Body(new ZodValidationPipe(updateInvitationSchema))
    input: UpdateInvitationInput,
  ): Promise<InvitationDetail> {
    return this.invitations.update(request.user, eventId, invitationId, input);
  }
}
