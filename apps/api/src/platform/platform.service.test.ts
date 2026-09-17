import type { ConfigService } from "@nestjs/config";
import type { ApiEnvironment } from "@dawah/config";
import { describe, expect, it, vi } from "vitest";
import { PlatformService } from "./platform.service";

describe("PlatformService", () => {
  it("publishes the current API version and enabled features", () => {
    const metadata = new PlatformService(
      configMock({
        BILLING_ENABLED: true,
        CHECK_IN_ENABLED: true,
        PAYMENTS_ENABLED: false,
      }),
    ).metadata();

    expect(metadata).toEqual({
      apiVersion: "v1",
      minimumSupportedApiVersion: "v1",
      features: {
        reportsEnabled: true,
        exportsEnabled: true,
        checkInEnabled: true,
        billingEnabled: true,
        paymentsEnabled: false,
      },
      nativeClients: {
        ios: { minimumSupportedVersion: null, latestVersion: null },
        android: { minimumSupportedVersion: null, latestVersion: null },
      },
    });
  });

  it("reports feature-flagged capabilities as disabled", () => {
    const metadata = new PlatformService(
      configMock({
        BILLING_ENABLED: false,
        CHECK_IN_ENABLED: false,
        PAYMENTS_ENABLED: false,
      }),
    ).metadata();

    expect(metadata.features).toMatchObject({
      billingEnabled: false,
      checkInEnabled: false,
      paymentsEnabled: false,
    });
  });
});

function configMock(
  values: Record<string, boolean>,
): ConfigService<ApiEnvironment, true> {
  return {
    get: vi.fn((key: string) => values[key] ?? false),
  } as unknown as ConfigService<ApiEnvironment, true>;
}
