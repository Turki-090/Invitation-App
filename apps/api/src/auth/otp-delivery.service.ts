import { Inject, Injectable } from "@nestjs/common";
import { createHash, createHmac } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import type { ApiEnvironment } from "@dawah/config";
import {
  AuthenticaError,
  AuthenticaOtpProvider,
  parseSupabaseSendSmsHookPayload,
  SupabaseAuthHookPayloadError,
  verifySupabaseAuthHookSignature,
} from "@dawah/messaging";
import type { Logger } from "@dawah/observability";
import { LOGGER } from "../observability/observability.tokens";
import { OtpAttemptStore } from "./otp-attempt-store";

export interface OtpDeliverySignatureHeaders {
  readonly id: string | undefined;
  readonly timestamp: string | undefined;
  readonly signature: string | undefined;
}

/**
 * What the hook answers Supabase with. A failure is reported in Supabase's own
 * envelope rather than thrown, because the platform exception filter would
 * reshape it into a body Supabase cannot read.
 */
export interface OtpDeliveryOutcome {
  readonly httpCode: number;
  readonly message?: string;
  readonly retryAfterSeconds?: number;
}

const delivered: OtpDeliveryOutcome = { httpCode: 200 };

@Injectable()
export class OtpDeliveryService {
  private readonly enabled: boolean;
  private readonly hookSecret: string | undefined;
  private readonly method: "whatsapp" | "sms";
  private readonly templateId: number;
  private readonly provider: AuthenticaOtpProvider;

  public constructor(
    @Inject(ConfigService) config: ConfigService<ApiEnvironment, true>,
    @Inject(LOGGER) private readonly logger: Logger,
    @Inject(OtpAttemptStore) private readonly attempts: OtpAttemptStore,
  ) {
    this.enabled = config.get("AUTHENTICA_OTP_ENABLED", { infer: true });
    this.hookSecret = config.get("SUPABASE_SEND_SMS_HOOK_SECRET", {
      infer: true,
    });
    this.method = config.get("AUTHENTICA_OTP_METHOD", { infer: true });
    this.templateId = config.get("AUTHENTICA_OTP_TEMPLATE_ID", { infer: true });
    this.provider = new AuthenticaOtpProvider({
      apiKey: config.get("AUTHENTICA_API_KEY", { infer: true }),
      baseUrl: config.get("AUTHENTICA_BASE_URL", { infer: true }),
      requestTimeoutMilliseconds: config.get("AUTHENTICA_REQUEST_TIMEOUT_MS", {
        infer: true,
      }),
    });
  }

  /**
   * Delivers a Supabase-issued sign-in code through Authentica.
   *
   * Authentication comes first and unconditionally: the code inside the body
   * is only trusted once the signature proves Supabase sent it, otherwise this
   * endpoint would be an open relay for sending codes to any number on the
   * account's balance.
   */
  public async deliver(
    rawBody: Buffer | undefined,
    headers: OtpDeliverySignatureHeaders,
    _payload: unknown,
  ): Promise<OtpDeliveryOutcome> {
    if (!this.enabled || !this.hookSecret) {
      this.logger.error("auth.otp.delivery_not_configured");
      return {
        httpCode: 503,
        message: "Sign-in code delivery is not configured.",
        retryAfterSeconds: 30,
      };
    }

    if (
      !rawBody ||
      !verifySupabaseAuthHookSignature(rawBody, headers, this.hookSecret)
    ) {
      this.logger.warn("auth.otp.hook_signature_rejected");
      return { httpCode: 401, message: "The hook signature is not valid." };
    }

    let request;
    try {
      request = parseSupabaseSendSmsHookPayload(
        JSON.parse(rawBody.toString("utf8")),
      );
    } catch (error) {
      if (
        !(error instanceof SupabaseAuthHookPayloadError) &&
        !(error instanceof SyntaxError)
      )
        throw error;
      this.logger.warn("auth.otp.hook_payload_rejected");
      return { httpCode: 400, message: "The hook payload is not supported." };
    }

    const key = createHash("sha256").update(headers.id!).digest("hex");
    // A keyed digest prevents brute-forcing a short OTP from a stored hash.
    const fingerprint = createHmac("sha256", this.hookSecret)
      .update(rawBody)
      .digest("hex");
    try {
      const previous = await this.attempts.claim(key, fingerprint);
      if (previous) {
        if (previous.fingerprint !== fingerprint)
          return { httpCode: 400, message: "The hook identifier was reused." };
        if (previous.httpCode === 200) return delivered;
        return {
          httpCode: previous.httpCode ?? 409,
          message:
            "The code delivery attempt cannot be repeated. Request a new code.",
        };
      }
    } catch {
      this.logger.error("auth.otp.deduplication_unavailable");
      return {
        httpCode: 503,
        message: "Sign-in code delivery is temporarily unavailable.",
      };
    }

    let outcome: OtpDeliveryOutcome = delivered;
    try {
      await this.provider.sendOtp({
        method: this.method,
        otp: request.otp,
        phone: request.phone,
        templateId: this.templateId,
      });
    } catch (error) {
      outcome =
        error instanceof AuthenticaError
          ? this.deliveryFailure(error)
          : { httpCode: 502, message: "The code could not be delivered." };
    }

    try {
      await this.attempts.complete(key, outcome.httpCode);
    } catch {
      this.logger.error("auth.otp.outcome_persistence_failed");
      return {
        httpCode: 503,
        message:
          "The delivery outcome could not be confirmed. Request a new code.",
      };
    }
    if (outcome.httpCode === 200)
      this.logger.info("auth.otp.accepted", { channel: this.method });
    return outcome;
  }

  /** No automatic resend: provider acceptance may precede a failed response. */
  private deliveryFailure(error: AuthenticaError): OtpDeliveryOutcome {
    this.logger.error("auth.otp.delivery_failed", {
      providerCode: error.providerCode,
      providerStatus: error.httpStatus,
      retryable: error.retryable,
      channel: this.method,
    });
    return error.providerCode === "PROVIDER_RATE_LIMITED"
      ? {
          httpCode: 429,
          message:
            "Code delivery is rate limited. Wait before requesting another code.",
        }
      : { httpCode: 502, message: "The code could not be delivered." };
  }
}
