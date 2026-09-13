import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EventsModule } from "../events/events.module";
import { PrismaModule } from "../prisma/prisma.module";
import {
  EventTeamController,
  TeamInvitationAcceptanceController,
} from "./team.controller";
import { TeamService } from "./team.service";

@Module({
  imports: [AuthModule, EventsModule, PrismaModule],
  controllers: [EventTeamController, TeamInvitationAcceptanceController],
  providers: [TeamService],
})
export class TeamModule {}
