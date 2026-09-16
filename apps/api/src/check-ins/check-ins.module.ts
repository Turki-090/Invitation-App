import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EventsModule } from "../events/events.module";
import { PrismaModule } from "../prisma/prisma.module";
import {
  CheckInsController,
  PublicEntryPassController,
} from "./check-ins.controller";
import { CheckInsService } from "./check-ins.service";

@Module({
  imports: [AuthModule, EventsModule, PrismaModule],
  controllers: [CheckInsController, PublicEntryPassController],
  providers: [CheckInsService],
})
export class CheckInsModule {}
