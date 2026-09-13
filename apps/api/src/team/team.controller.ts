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
  acceptTeamInvitationSchema,
  createTeamInvitationSchema,
  updateTeamMemberSchema,
  type AcceptTeamInvitationInput,
  type AcceptTeamInvitationResult,
  type CreateTeamInvitationInput,
  type TeamInvitation,
  type TeamInvitationCredential,
  type TeamMember,
  type TeamOverview,
  type UpdateTeamMemberInput,
} from "@dawah/api-contract";
import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { ZodValidationPipe } from "../shared/zod-validation.pipe";
import { TeamService } from "./team.service";

@UseGuards(AuthGuard)
@Controller("events/:eventId")
export class EventTeamController {
  public constructor(@Inject(TeamService) private readonly team: TeamService) {}

  @Get("team")
  public listTeam(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
  ): Promise<TeamOverview> {
    return this.team.listTeam(request.user, eventId);
  }

  @Post("team-invitations")
  public createInvitation(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Body(new ZodValidationPipe(createTeamInvitationSchema))
    input: CreateTeamInvitationInput,
  ): Promise<TeamInvitationCredential> {
    return this.team.createInvitation(request.user, eventId, input);
  }

  @Post("team-invitations/:invitationId/resend")
  @HttpCode(HttpStatus.OK)
  public resendInvitation(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Param("invitationId", new ParseUUIDPipe({ version: "4" }))
    invitationId: string,
  ): Promise<TeamInvitationCredential> {
    return this.team.resendInvitation(request.user, eventId, invitationId);
  }

  @Post("team-invitations/:invitationId/revoke")
  @HttpCode(HttpStatus.OK)
  public revokeInvitation(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Param("invitationId", new ParseUUIDPipe({ version: "4" }))
    invitationId: string,
  ): Promise<TeamInvitation> {
    return this.team.revokeInvitation(request.user, eventId, invitationId);
  }

  @Patch("memberships/:membershipId")
  public updateMembership(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Param("membershipId", new ParseUUIDPipe({ version: "4" }))
    membershipId: string,
    @Body(new ZodValidationPipe(updateTeamMemberSchema))
    input: UpdateTeamMemberInput,
  ): Promise<TeamMember> {
    return this.team.updateMembership(
      request.user,
      eventId,
      membershipId,
      input,
    );
  }

  @Post("memberships/:membershipId/revoke")
  @HttpCode(HttpStatus.OK)
  public revokeMembership(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Param("membershipId", new ParseUUIDPipe({ version: "4" }))
    membershipId: string,
  ): Promise<TeamMember> {
    return this.team.revokeMembership(request.user, eventId, membershipId);
  }
}

@UseGuards(AuthGuard)
@Controller("team-invitations")
export class TeamInvitationAcceptanceController {
  public constructor(@Inject(TeamService) private readonly team: TeamService) {}

  @Post("accept")
  @HttpCode(HttpStatus.OK)
  public acceptInvitation(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(acceptTeamInvitationSchema))
    input: AcceptTeamInvitationInput,
  ): Promise<AcceptTeamInvitationResult> {
    return this.team.acceptInvitation(request.user, input);
  }
}
