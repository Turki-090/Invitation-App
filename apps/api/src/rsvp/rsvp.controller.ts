import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  issuePublicInvitationCapabilitySchema,
  publicInvitationLocaleQuerySchema,
  submitRsvpSchema,
  type HostRsvpDetail,
  type IssuePublicInvitationCapabilityInput,
  type IssuedPublicInvitationCapability,
  type PublicInvitation,
  type PublicInvitationCapabilityStatus,
  type PublicInvitationLocaleQuery,
  type RsvpResult,
  type SubmitRsvpInput,
} from "@dawah/api-contract";
import { createHash } from "node:crypto";
import type { Response } from "express";
import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { ZodValidationPipe } from "../shared/zod-validation.pipe";
import { RsvpService } from "./rsvp.service";

@Controller("public/invitations")
export class PublicRsvpController {
  public constructor(@Inject(RsvpService) private readonly rsvp: RsvpService) {}

  @Get(":token")
  @Throttle({
    default: {
      limit: 30,
      ttl: 60_000,
      getTracker: getPublicCapabilityTracker,
    },
  })
  public getInvitation(
    @Param("token") token: string,
    @Query(new ZodValidationPipe(publicInvitationLocaleQuerySchema))
    query: PublicInvitationLocaleQuery,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PublicInvitation> {
    setPrivateGuestHeaders(response);
    return this.rsvp.getPublicInvitation(token, query.locale);
  }

  @Post(":token/rsvp")
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit: 10,
      ttl: 60_000,
      getTracker: getPublicCapabilityTracker,
    },
  })
  public submit(
    @Param("token") token: string,
    @Query(new ZodValidationPipe(publicInvitationLocaleQuerySchema))
    query: PublicInvitationLocaleQuery,
    @Body(new ZodValidationPipe(submitRsvpSchema)) input: SubmitRsvpInput,
    @Res({ passthrough: true }) response: Response,
  ): Promise<RsvpResult> {
    setPrivateGuestHeaders(response);
    return this.rsvp.submitGuest(token, query.locale, input);
  }
}

@UseGuards(AuthGuard)
@Controller("events/:eventId/invitations/:invitationId")
export class HostRsvpController {
  public constructor(@Inject(RsvpService) private readonly rsvp: RsvpService) {}

  @Get("rsvp")
  public getRsvp(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Param("invitationId", new ParseUUIDPipe({ version: "4" }))
    invitationId: string,
  ): Promise<HostRsvpDetail> {
    return this.rsvp.getHostRsvp(request.user, eventId, invitationId);
  }

  @Post("rsvp")
  @HttpCode(HttpStatus.OK)
  public submitRsvp(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Param("invitationId", new ParseUUIDPipe({ version: "4" }))
    invitationId: string,
    @Body(new ZodValidationPipe(submitRsvpSchema)) input: SubmitRsvpInput,
  ): Promise<RsvpResult> {
    return this.rsvp.submitHost(request.user, eventId, invitationId, input);
  }

  @Get("public-access")
  public getPublicAccess(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Param("invitationId", new ParseUUIDPipe({ version: "4" }))
    invitationId: string,
  ): Promise<PublicInvitationCapabilityStatus> {
    return this.rsvp.getCapabilityStatus(request.user, eventId, invitationId);
  }

  @Post("public-access")
  public issuePublicAccess(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Param("invitationId", new ParseUUIDPipe({ version: "4" }))
    invitationId: string,
    @Body(new ZodValidationPipe(issuePublicInvitationCapabilitySchema))
    input: IssuePublicInvitationCapabilityInput,
  ): Promise<IssuedPublicInvitationCapability> {
    return this.rsvp.issueCapability(
      request.user,
      eventId,
      invitationId,
      input,
    );
  }

  @Delete("public-access")
  @HttpCode(HttpStatus.OK)
  public revokePublicAccess(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Param("invitationId", new ParseUUIDPipe({ version: "4" }))
    invitationId: string,
  ): Promise<PublicInvitationCapabilityStatus> {
    return this.rsvp.revokeCapability(request.user, eventId, invitationId);
  }
}

function setPrivateGuestHeaders(response: Response): void {
  response.setHeader(
    "Cache-Control",
    "private, no-store, max-age=0, must-revalidate",
  );
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Expires", "0");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
}

export function getPublicCapabilityTracker(
  request: Record<string, unknown>,
): string {
  const params = request.params;
  const token =
    typeof params === "object" && params !== null && "token" in params
      ? String(params.token)
      : "missing";
  const capabilityFingerprint = createHash("sha256")
    .update(token)
    .digest("hex");
  const ip = typeof request.ip === "string" ? request.ip : "unknown";

  return `${ip}:${capabilityFingerprint}`;
}
