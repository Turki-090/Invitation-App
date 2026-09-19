import { Module } from "@nestjs/common";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { OtpDeliveryController } from "./otp-delivery.controller";
import { OtpDeliveryService } from "./otp-delivery.service";

@Module({
  controllers: [OtpDeliveryController],
  providers: [AuthService, AuthGuard, OtpDeliveryService],
  exports: [AuthGuard, AuthService],
})
export class AuthModule {}
