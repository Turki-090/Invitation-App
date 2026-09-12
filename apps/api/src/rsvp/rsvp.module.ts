import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EventsModule } from "../events/events.module";
import { MessagingModule } from "../messaging/messaging.module";
import { HostRsvpController, PublicRsvpController } from "./rsvp.controller";
import { RsvpService } from "./rsvp.service";

@Module({
  imports: [AuthModule, EventsModule, MessagingModule],
  controllers: [PublicRsvpController, HostRsvpController],
  providers: [RsvpService],
  exports: [RsvpService],
})
export class RsvpModule {}
