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
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  checkInIdempotencyKeySchema,
  createCheckInSchema,
  resolveEntryPassSchema,
  searchCheckInPartiesQuerySchema,
  type CheckInDashboard,
  type CheckInResult,
  type CreateCheckInInput,
  type PublicEntryPass,
  type ResolveEntryPassInput,
  type ResolvedEntryPass,
  type SearchCheckInPartiesQuery,
  type SearchCheckInPartiesResponse,
} from "@dawah/api-contract";
import { createHash } from "node:crypto";
import type { Response } from "express";
import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { ZodValidationPipe } from "../shared/zod-validation.pipe";
import { CheckInsService } from "./check-ins.service";

@Controller("public/invitations")
export class PublicEntryPassController {
  public constructor(
    @Inject(CheckInsService) private readonly checkIns: CheckInsService,
  ) {}

  @Post(":token/entry-pass")
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit: 10,
      ttl: 60_000,
      getTracker: getEntryPassTracker,
    },
  })
  public issue(
    @Param("token") token: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PublicEntryPass> {
    setPrivateGuestHeaders(response);
    return this.checkIns.issuePublicEntryPass(token);
  }
}

@UseGuards(AuthGuard)
@Controller("events/:eventId/check-ins")
export class CheckInsController {
  public constructor(
    @Inject(CheckInsService) private readonly checkIns: CheckInsService,
  ) {}

  @Post("resolve")
  @HttpCode(HttpStatus.OK)
  public resolve(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Body(new ZodValidationPipe(resolveEntryPassSchema))
    input: ResolveEntryPassInput,
  ): Promise<ResolvedEntryPass> {
    return this.checkIns.resolveEntryPass(request.user, eventId, input.token);
  }

  @Get("search")
  public search(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Query(new ZodValidationPipe(searchCheckInPartiesQuerySchema))
    query: SearchCheckInPartiesQuery,
  ): Promise<SearchCheckInPartiesResponse> {
    return this.checkIns.search(request.user, eventId, query);
  }

  @Get("dashboard")
  public dashboard(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
  ): Promise<CheckInDashboard> {
    return this.checkIns.dashboard(request.user, eventId);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  public checkIn(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Headers("idempotency-key") idempotencyKeyValue: string | undefined,
    @Body(new ZodValidationPipe(createCheckInSchema))
    input: CreateCheckInInput,
  ): Promise<CheckInResult> {
    return this.checkIns.checkIn(
      request.user,
      eventId,
      parseCheckInIdempotencyKey(idempotencyKeyValue),
      input,
    );
  }
}

function parseCheckInIdempotencyKey(value: string | undefined): string {
  return new ZodValidationPipe(checkInIdempotencyKeySchema).transform(value);
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

export function getEntryPassTracker(request: Record<string, unknown>): string {
  const params = request.params;
  const token =
    typeof params === "object" && params !== null && "token" in params
      ? String(params.token)
      : "missing";
  const fingerprint = createHash("sha256").update(token).digest("hex");
  const ip = typeof request.ip === "string" ? request.ip : "unknown";
  return `${ip}:${fingerprint}`;
}
