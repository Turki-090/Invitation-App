import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EventsModule } from "../events/events.module";
import { MessagingModule } from "../messaging/messaging.module";
import { RemindersController } from "./reminders.controller";
import { RemindersService } from "./reminders.service";

@Module({
  imports: [AuthModule, EventsModule, MessagingModule],
  controllers: [RemindersController],
  providers: [RemindersService],
})
export class RemindersModule {}
