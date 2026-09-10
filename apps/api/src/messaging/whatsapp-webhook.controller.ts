import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import type { WhatsappWebhookAcknowledgement } from "@dawah/api-contract";
import { SkipThrottle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { WhatsappWebhookService } from "./whatsapp-webhook.service";

type RawBodyRequest = Request & { rawBody?: Buffer };

@Controller("webhooks/whatsapp")
export class WhatsappWebhookController {
  public constructor(
    @Inject(WhatsappWebhookService)
    private readonly webhook: WhatsappWebhookService,
  ) {}

  @Get()
  public verify(
    @Query("hub.mode") mode: string | undefined,
    @Query("hub.verify_token") token: string | undefined,
    @Query("hub.challenge") challenge: string | undefined,
    @Res() response: Response,
  ): void {
    const verifiedChallenge = this.webhook.verifyChallenge(
      mode,
      token,
      challenge,
    );
    response.status(HttpStatus.OK).type("text/plain").send(verifiedChallenge);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  public receive(
    @Req() request: RawBodyRequest,
    @Headers("x-hub-signature-256") signature: string | undefined,
    @Body() payload: unknown,
  ): Promise<WhatsappWebhookAcknowledgement> {
    return this.webhook.ingest(request.rawBody, signature, payload);
  }
}
