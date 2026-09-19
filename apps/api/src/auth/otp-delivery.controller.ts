import {
  Body,
  Controller,
  Headers,
  Inject,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { OtpDeliveryService } from "./otp-delivery.service";

type RawBodyRequest = Request & { rawBody?: Buffer };

/**
 * Supabase Auth's send-SMS hook.
 *
 * Every sign-in in the product arrives here from one Supabase origin, so the
 * per-address throttle is skipped deliberately: applied, it would let one
 * busy evening lock every host out. Abuse is bounded by the signature, which
 * only Supabase can produce, and by Supabase's own sign-in rate limits.
 */
@Controller("webhooks/supabase-otp")
export class OtpDeliveryController {
  public constructor(
    @Inject(OtpDeliveryService) private readonly delivery: OtpDeliveryService,
  ) {}

  @Post()
  @SkipThrottle()
  public async send(
    @Req() request: RawBodyRequest,
    @Headers() headers: Record<string, string | undefined>,
    @Body() payload: unknown,
    @Res() response: Response,
  ): Promise<void> {
    const outcome = await this.delivery.deliver(
      request.rawBody,
      {
        id: headers["webhook-id"] ?? headers["svix-id"],
        timestamp: headers["webhook-timestamp"] ?? headers["svix-timestamp"],
        signature: headers["webhook-signature"] ?? headers["svix-signature"],
      },
      payload,
    );

    if (outcome.retryAfterSeconds !== undefined) {
      // Supabase retries a failed delivery only when it is told how long to
      // wait, so an omitted header silently turns a transient fault into a
      // failed sign-in.
      response.setHeader("retry-after", String(outcome.retryAfterSeconds));
    }
    response.status(outcome.httpCode).json(
      outcome.message === undefined
        ? {}
        : {
            error: { http_code: outcome.httpCode, message: outcome.message },
          },
    );
  }
}
