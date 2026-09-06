import { Controller, Get, Inject } from "@nestjs/common";
import type { Readiness } from "@dawah/api-contract";
import { HealthService } from "./health.service";

@Controller("health")
export class HealthController {
  public constructor(
    @Inject(HealthService) private readonly health: HealthService,
  ) {}

  @Get("live")
  public live(): { status: "ok" } {
    return { status: "ok" };
  }

  @Get("ready")
  public ready(): Promise<Readiness> {
    return this.health.ready();
  }
}
