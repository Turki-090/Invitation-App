import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EventsModule } from "../events/events.module";
import { PrismaModule } from "../prisma/prisma.module";
import { StorageModule } from "../storage/storage.module";
import { ExportsController } from "./exports.controller";
import { ExportsQueueService } from "./exports-queue.service";
import { ExportsService } from "./exports.service";

@Module({
  imports: [AuthModule, EventsModule, PrismaModule, StorageModule],
  controllers: [ExportsController],
  providers: [ExportsQueueService, ExportsService],
})
export class ExportsModule {}

