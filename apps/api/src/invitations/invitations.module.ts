import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EventsModule } from "../events/events.module";
import { PrismaModule } from "../prisma/prisma.module";
import { InvitationsController } from "./invitations.controller";
import { InvitationsService } from "./invitations.service";

@Module({
  imports: [AuthModule, EventsModule, PrismaModule],
  controllers: [InvitationsController],
  providers: [InvitationsService],
})
export class InvitationsModule {}
