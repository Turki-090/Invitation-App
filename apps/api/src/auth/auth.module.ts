import { Module } from "@nestjs/common";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { OtpDeliveryController } from "./otp-delivery.controller";
import { OtpDeliveryService } from "./otp-delivery.service";
import { OtpAttemptStore } from "./otp-attempt-store";

@Module({
  controllers: [OtpDeliveryController],
  providers: [AuthService, AuthGuard, OtpDeliveryService, OtpAttemptStore],
  exports: [AuthGuard, AuthService],
})
export class AuthModule {}
