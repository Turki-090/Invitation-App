import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

@ApiTags("health")
@Controller("health")
export class HealthController {
  @Get("live")
  @ApiOperation({ summary: "Process liveness" })
  public live(): { status: "ok" } {
    return { status: "ok" };
  }
}
