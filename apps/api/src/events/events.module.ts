import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { EventAccessService } from "./event-access.service";
import { EventsController } from "./events.controller";
import { EventsService } from "./events.service";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [EventsController],
  providers: [EventAccessService, EventsService],
  exports: [EventAccessService],
})
export class EventsModule {}
