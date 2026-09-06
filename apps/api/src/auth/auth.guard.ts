import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "./auth.service";
import type { AuthPrincipal } from "./auth.types";

export type AuthenticatedRequest = Request & { user: AuthPrincipal };

@Injectable()
export class AuthGuard implements CanActivate {
  public constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthPrincipal }>();
    const authorization = request.headers.authorization;
    const [scheme, token] = authorization?.split(" ") ?? [];
    if (scheme !== "Bearer" || !token) {
      throw new UnauthorizedException({
        code: "AUTH_REQUIRED",
        message: "A bearer access token is required.",
      });
    }
    request.user = await this.auth.verify(token);
    return true;
  }
}
