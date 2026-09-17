import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CreditsModule } from "../credits/credits.module";
import { EventsModule } from "../events/events.module";
import { MessagingModule } from "../messaging/messaging.module";
import { RemindersController } from "./reminders.controller";
import { RemindersService } from "./reminders.service";

@Module({
  imports: [AuthModule, CreditsModule, EventsModule, MessagingModule],
  controllers: [RemindersController],
  providers: [RemindersService],
})
export class RemindersModule {}
