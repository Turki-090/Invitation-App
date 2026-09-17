import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { validateApiEnvironment, type ApiEnvironment } from "@dawah/config";
import { AuthModule } from "./auth/auth.module";
import { AssetsModule } from "./assets/assets.module";
import { CheckInsModule } from "./check-ins/check-ins.module";
import { CreditsModule } from "./credits/credits.module";
import { EventsModule } from "./events/events.module";
import { ExportsModule } from "./exports/exports.module";
import { HealthModule } from "./health/health.module";
import { InvitationsModule } from "./invitations/invitations.module";
import { ImportsModule } from "./imports/imports.module";
import { MessagingModule } from "./messaging/messaging.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { ObservabilityModule } from "./observability/observability.module";
import { PlatformModule } from "./platform/platform.module";
import { PrismaModule } from "./prisma/prisma.module";
import { PreparationModule } from "./preparation/preparation.module";
import { ReportsModule } from "./reports/reports.module";
import { RsvpModule } from "./rsvp/rsvp.module";
import { RemindersModule } from "./reminders/reminders.module";
import { ApiExceptionFilter } from "./shared/api-exception.filter";
import { TeamModule } from "./team/team.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      envFilePath: [".env.local", ".env", "../../.env.local", "../../.env"],
      isGlobal: true,
      validate: validateApiEnvironment,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<ApiEnvironment, true>) => [
        {
          name: "default",
          ttl: config.get("API_THROTTLE_TTL_SECONDS", { infer: true }) * 1_000,
          limit: config.get("API_THROTTLE_LIMIT", { infer: true }),
        },
      ],
    }),
    ObservabilityModule,
    PrismaModule,
    AuthModule,
    AssetsModule,
    HealthModule,
    PlatformModule,
    EventsModule,
    InvitationsModule,
    ImportsModule,
    MessagingModule,
    NotificationsModule,
    PreparationModule,
    RemindersModule,
    ReportsModule,
    ExportsModule,
    CheckInsModule,
    CreditsModule,
    RsvpModule,
    TeamModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Registered through the container so the filter can log and report with
    // the same redaction rules and correlation context as the rest of the API.
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}
