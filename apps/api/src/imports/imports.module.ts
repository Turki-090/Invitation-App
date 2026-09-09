import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EventsModule } from "../events/events.module";
import { PrismaModule } from "../prisma/prisma.module";
import { StorageModule } from "../storage/storage.module";
import { ImportsController } from "./imports.controller";
import { ImportsQueueService } from "./imports-queue.service";
import { ImportsService } from "./imports.service";

@Module({
  imports: [AuthModule, EventsModule, PrismaModule, StorageModule],
  controllers: [ImportsController],
  providers: [ImportsQueueService, ImportsService],
})
export class ImportsModule {}
