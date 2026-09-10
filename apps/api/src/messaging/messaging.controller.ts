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
  UseGuards,
} from "@nestjs/common";
import {
  createSendBatchSchema,
  idempotencyKeySchema,
  listSendBatchesQuerySchema,
  messageListQuerySchema,
  resendMessageSchema,
  sendReadinessRequestSchema,
  type CreateSendBatchInput,
  type ListSendBatchesQuery,
  type ListSendBatchesResponse,
  type MessageListQuery,
  type ResendMessageInput,
  type ResendReadinessResponse,
  type SendBatch,
  type SendBatchDetail,
  type SendReadinessRequest,
  type SendReadinessResponse,
} from "@dawah/api-contract";
import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { ZodValidationPipe } from "../shared/zod-validation.pipe";
import { MessagingService } from "./messaging.service";

@UseGuards(AuthGuard)
@Controller("events/:eventId")
export class MessagingController {
  public constructor(
    @Inject(MessagingService)
    private readonly messaging: MessagingService,
  ) {}

  @Post("sending/readiness")
  @HttpCode(HttpStatus.OK)
  public readiness(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Body(new ZodValidationPipe(sendReadinessRequestSchema))
    input: SendReadinessRequest,
  ): Promise<SendReadinessResponse> {
    return this.messaging.readiness(request.user, eventId, input);
  }

  @Post("send-batches")
  @HttpCode(HttpStatus.ACCEPTED)
  public createBatch(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Headers("idempotency-key") idempotencyKeyValue: string | undefined,
    @Body(new ZodValidationPipe(createSendBatchSchema))
    input: CreateSendBatchInput,
  ): Promise<SendBatch> {
    return this.messaging.createBatch(
      request.user,
      eventId,
      input,
      parseIdempotencyKey(idempotencyKeyValue),
    );
  }

  @Get("send-batches")
  public listBatches(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Query(new ZodValidationPipe(listSendBatchesQuerySchema))
    query: ListSendBatchesQuery,
  ): Promise<ListSendBatchesResponse> {
    return this.messaging.listBatches(request.user, eventId, query);
  }

  @Get("send-batches/:batchId")
  public getBatch(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Param("batchId", new ParseUUIDPipe({ version: "4" })) batchId: string,
    @Query(new ZodValidationPipe(messageListQuerySchema))
    query: MessageListQuery,
  ): Promise<SendBatchDetail> {
    return this.messaging.getBatch(request.user, eventId, batchId, query);
  }

  @Post("messages/:messageId/resend-readiness")
  @HttpCode(HttpStatus.OK)
  public resendReadiness(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Param("messageId", new ParseUUIDPipe({ version: "4" })) messageId: string,
  ): Promise<ResendReadinessResponse> {
    return this.messaging.resendReadiness(request.user, eventId, messageId);
  }

  @Post("messages/:messageId/resend")
  @HttpCode(HttpStatus.ACCEPTED)
  public resend(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Param("messageId", new ParseUUIDPipe({ version: "4" })) messageId: string,
    @Headers("idempotency-key") idempotencyKeyValue: string | undefined,
    @Body(new ZodValidationPipe(resendMessageSchema))
    input: ResendMessageInput,
  ): Promise<SendBatch> {
    return this.messaging.resend(
      request.user,
      eventId,
      messageId,
      input,
      parseIdempotencyKey(idempotencyKeyValue),
    );
  }
}

function parseIdempotencyKey(value: string | undefined): string {
  return new ZodValidationPipe(idempotencyKeySchema).transform(value);
}
