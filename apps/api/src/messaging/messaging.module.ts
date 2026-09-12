import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EventsModule } from "../events/events.module";
import { StorageModule } from "../storage/storage.module";
import { MessagingController } from "./messaging.controller";
import { MessagingMediaController } from "./messaging-media.controller";
import { MessagingMediaService } from "./messaging-media.service";
import { MessagingQueueService } from "./messaging-queue.service";
import { MessagingService } from "./messaging.service";
import { WhatsappWebhookController } from "./whatsapp-webhook.controller";
import { WhatsappWebhookService } from "./whatsapp-webhook.service";

@Module({
  imports: [AuthModule, EventsModule, StorageModule],
  controllers: [
    MessagingController,
    MessagingMediaController,
    WhatsappWebhookController,
  ],
  providers: [
    MessagingMediaService,
    MessagingQueueService,
    MessagingService,
    WhatsappWebhookService,
  ],
  exports: [MessagingQueueService],
})
export class MessagingModule {}
