import {
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  listNotificationsQuerySchema,
  type ListNotificationsQuery,
  type ListNotificationsResponse,
  type Notification,
} from "@dawah/api-contract";
import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { ZodValidationPipe } from "../shared/zod-validation.pipe";
import { NotificationsService } from "./notifications.service";

@UseGuards(AuthGuard)
@Controller("notifications")
export class NotificationsController {
  public constructor(
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService,
  ) {}

  @Get()
  public list(
    @Req() request: AuthenticatedRequest,
    @Query(new ZodValidationPipe(listNotificationsQuerySchema))
    query: ListNotificationsQuery,
  ): Promise<ListNotificationsResponse> {
    return this.notifications.list(request.user, query);
  }

  @Post(":notificationId/read")
  public markRead(
    @Req() request: AuthenticatedRequest,
    @Param("notificationId", new ParseUUIDPipe({ version: "4" }))
    notificationId: string,
  ): Promise<Notification> {
    return this.notifications.markRead(request.user, notificationId);
  }
}
