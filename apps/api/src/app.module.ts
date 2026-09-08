import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { validateApiEnvironment } from "@dawah/config";
import { AuthModule } from "./auth/auth.module";
import { EventsModule } from "./events/events.module";
import { HealthModule } from "./health/health.module";
import { InvitationsModule } from "./invitations/invitations.module";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      envFilePath: [".env.local", ".env", "../../.env.local", "../../.env"],
      isGlobal: true,
      validate: validateApiEnvironment,
    }),
    ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AuthModule,
    HealthModule,
    EventsModule,
    InvitationsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
