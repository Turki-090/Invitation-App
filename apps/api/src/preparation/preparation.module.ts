import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EventsModule } from "../events/events.module";
import { PrismaModule } from "../prisma/prisma.module";
import {
  PreparationController,
  TemplatesController,
} from "./preparation.controller";
import { PreparationService } from "./preparation.service";

@Module({
  imports: [AuthModule, EventsModule, PrismaModule],
  controllers: [TemplatesController, PreparationController],
  providers: [PreparationService],
})
export class PreparationModule {}
