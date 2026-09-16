import { Controller, Get, Inject } from "@nestjs/common";
import type { PlatformMetadata } from "@dawah/api-contract";
import { PlatformService } from "./platform.service";

@Controller("platform")
export class PlatformController {
  public constructor(
    @Inject(PlatformService) private readonly platform: PlatformService,
  ) {}

  @Get()
  public metadata(): PlatformMetadata {
    return this.platform.metadata();
  }
}
