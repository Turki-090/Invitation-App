import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  CURRENT_API_VERSION,
  MINIMUM_SUPPORTED_API_VERSION,
  MINIMUM_SUPPORTED_NATIVE_CLIENT_VERSION,
  platformMetadataSchema,
  type PlatformMetadata,
} from "@dawah/api-contract";
import type { ApiEnvironment } from "@dawah/config";

@Injectable()
export class PlatformService {
  public constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}

  public metadata(): PlatformMetadata {
    return platformMetadataSchema.parse({
      apiVersion: CURRENT_API_VERSION,
      minimumSupportedApiVersion: MINIMUM_SUPPORTED_API_VERSION,
      features: {
        reportsEnabled: true,
        exportsEnabled: true,
        checkInEnabled: this.config.get("CHECK_IN_ENABLED", { infer: true }),
        billingEnabled: this.config.get("BILLING_ENABLED", { infer: true }),
        paymentsEnabled: this.config.get("PAYMENTS_ENABLED", { infer: true }),
      },
      nativeClients: {
        ios: {
          minimumSupportedVersion: MINIMUM_SUPPORTED_NATIVE_CLIENT_VERSION,
          latestVersion: null,
        },
        android: {
          minimumSupportedVersion: MINIMUM_SUPPORTED_NATIVE_CLIENT_VERSION,
          latestVersion: null,
        },
      },
    });
  }
}
