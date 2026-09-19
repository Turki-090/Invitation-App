import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export interface OtpAttempt {
  fingerprint: string;
  httpCode: number | null;
}

/** Persist before sending. Never reclaim an unfinished attempt: a crash or
 * timeout cannot tell us whether the provider already accepted the SMS. */
@Injectable()
export class OtpAttemptStore {
  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  public async claim(
    key: string,
    fingerprint: string,
  ): Promise<OtpAttempt | null> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET LOCAL statement_timeout = '300ms'`;
        const inserted = await tx.$executeRaw`
        INSERT INTO otp_delivery_attempts (key, fingerprint)
        VALUES (${key}, ${fingerprint}) ON CONFLICT (key) DO NOTHING`;
        if (inserted === 1) return null;
        const rows = await tx.$queryRaw<OtpAttempt[]>`
        SELECT fingerprint, http_code AS "httpCode" FROM otp_delivery_attempts WHERE key = ${key}`;
        if (!rows[0]) throw new Error("OTP attempt unavailable.");
        return rows[0];
      },
      { maxWait: 250, timeout: 500 },
    );
  }

  public async complete(key: string, httpCode: number): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET LOCAL statement_timeout = '300ms'`;
        await tx.$executeRaw`UPDATE otp_delivery_attempts SET http_code = ${httpCode} WHERE key = ${key}`;
      },
      { maxWait: 250, timeout: 500 },
    );
  }
}
