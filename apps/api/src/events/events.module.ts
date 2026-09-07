import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EventAccessService } from "./event-access.service";
import { EventsController } from "./events.controller";
import { EventsService } from "./events.service";

@Module({
  imports: [AuthModule],
  controllers: [EventsController],
  providers: [EventAccessService, EventsService],
})
export class EventsModule {}
