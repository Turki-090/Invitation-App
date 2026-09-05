import {
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

  public constructor(config: ConfigService) {
    const supabaseUrl =
      config.get<string>("SUPABASE_URL")?.replace(/\/$/, "") ?? null;
    this.issuer = supabaseUrl ? `${supabaseUrl}/auth/v1` : null;
    this.audience =
      config.get<string>("SUPABASE_JWT_AUDIENCE") ?? "authenticated";
    this.jwks = supabaseUrl
      ? createRemoteJWKSet(
          new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`),
        )
      : null;
  }

  public async verify(accessToken: string): Promise<AuthPrincipal> {
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
      throw new UnauthorizedException({
        code: "AUTH_TOKEN_INVALID",
        message: "The access token is invalid or expired.",
      });
    }
  }
}
