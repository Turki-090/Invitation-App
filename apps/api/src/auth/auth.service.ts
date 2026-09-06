import { DEVELOPMENT_ACCESS_TOKEN } from "@dawah/api-contract";
import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { AuthPrincipal } from "./auth.types";

@Injectable()
export class AuthService {
  private readonly issuer: string | null;
  private readonly audience: string;
  private readonly jwks: JWTVerifyGetKey | null;
  private readonly developmentBypassEnabled: boolean;

  public constructor(@Inject(ConfigService) config: ConfigService) {
    const supabaseUrl =
      config.get<string>("SUPABASE_URL")?.replace(/\/$/, "") ?? null;
    this.issuer = supabaseUrl ? `${supabaseUrl}/auth/v1` : null;
    this.audience =
      config.get<string>("SUPABASE_JWT_AUDIENCE") ?? "authenticated";
    const developmentBypass = config.get<boolean | string>(
      "DAWAH_DEV_AUTH_BYPASS",
    );
    this.developmentBypassEnabled =
      config.get<string>("NODE_ENV") === "development" &&
      (developmentBypass === true || developmentBypass === "true");
    this.jwks = supabaseUrl
      ? createRemoteJWKSet(
          new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`),
        )
      : null;
  }

  public async verify(accessToken: string): Promise<AuthPrincipal> {
    if (accessToken === DEVELOPMENT_ACCESS_TOKEN) {
      if (!this.developmentBypassEnabled) {
        throw this.invalidTokenError();
      }

      return {
        subject: "dawah-local-development-host",
        email: "developer@localhost",
      };
    }

    if (!this.jwks || !this.issuer) {
      throw new ServiceUnavailableException({
        code: "AUTH_PROVIDER_NOT_CONFIGURED",
        message: "Host authentication is not configured.",
      });
    }

    try {
      const { payload } = await jwtVerify(accessToken, this.jwks, {
        audience: this.audience,
        issuer: this.issuer,
      });
      if (!payload.sub) throw new Error("Token subject is missing.");
      return {
        subject: payload.sub,
        ...(typeof payload.email === "string" ? { email: payload.email } : {}),
        ...(typeof payload.phone === "string" ? { phone: payload.phone } : {}),
      };
    } catch {
      throw this.invalidTokenError();
    }
  }

  private invalidTokenError(): UnauthorizedException {
    return new UnauthorizedException({
      code: "AUTH_TOKEN_INVALID",
      message: "The access token is invalid or expired.",
    });
  }
}
