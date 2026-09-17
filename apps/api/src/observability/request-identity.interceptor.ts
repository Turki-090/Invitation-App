import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import { enrichRequestContext } from "@dawah/observability";
import type { Observable } from "rxjs";
import type { AuthenticatedRequest } from "../auth/auth.guard";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Attaches the resolved event to the correlation context once routing has
 * produced path parameters.
 *
 * Every operational question during an event night — "what happened to this
 * event's sends?" — is scoped to one event, so `eventId` belongs on every log
 * line the request produces. It is an internal identifier, never guest data,
 * which is what makes it safe to correlate on.
 */
@Injectable()
export class RequestIdentityInterceptor implements NestInterceptor {
  public intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    if (context.getType() === "http") {
      const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
      const eventId = request.params?.eventId;
      if (typeof eventId === "string" && uuidPattern.test(eventId)) {
        enrichRequestContext({ eventId });
      }
    }
    return next.handle();
  }
}
