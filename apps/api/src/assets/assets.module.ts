import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EventsModule } from "../events/events.module";
import { PrismaModule } from "../prisma/prisma.module";
import { StorageModule } from "../storage/storage.module";
import { AssetsController } from "./assets.controller";
import { AssetsService } from "./assets.service";

@Module({
  imports: [AuthModule, EventsModule, PrismaModule, StorageModule],
  controllers: [AssetsController],
  providers: [AssetsService],
})
export class AssetsModule {}
