import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
} from "@nestjs/common";
import type { WhatsappWebhookAcknowledgement } from "@dawah/api-contract";
import { DIALOG360_WEBHOOK_TOKEN_HEADER } from "@dawah/messaging";
import { SkipThrottle } from "@nestjs/throttler";
import type { Request } from "express";
import { WhatsappWebhookService } from "./whatsapp-webhook.service";

type RawBodyRequest = Request & { rawBody?: Buffer };

/**
 * 360dialog has no subscription handshake: the URL and its token header are
 * registered through 360dialog's API, so only the delivery route exists.
 */
@Controller("webhooks/whatsapp")
export class WhatsappWebhookController {
  public constructor(
    @Inject(WhatsappWebhookService)
    private readonly webhook: WhatsappWebhookService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  public receive(
    @Req() request: RawBodyRequest,
    @Headers(DIALOG360_WEBHOOK_TOKEN_HEADER) webhookToken: string | undefined,
    @Body() payload: unknown,
  ): Promise<WhatsappWebhookAcknowledgement> {
    return this.webhook.ingest(request.rawBody, webhookToken, payload);
  }
}
