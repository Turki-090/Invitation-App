import { describe, expect, it } from "vitest";
import {
  CURRENT_API_VERSION,
  MINIMUM_SUPPORTED_API_VERSION,
  MINIMUM_SUPPORTED_NATIVE_CLIENT_VERSION,
  platformMetadataSchema,
} from "./platform";

describe("platform metadata contract", () => {
  it("exports stable API and not-yet-released native version constants", () => {
    expect(CURRENT_API_VERSION).toBe("v1");
    expect(MINIMUM_SUPPORTED_API_VERSION).toBe("v1");
    expect(MINIMUM_SUPPORTED_NATIVE_CLIENT_VERSION).toBeNull();
  });

  it("validates feature flags and per-platform version metadata", () => {
    const parsed = platformMetadataSchema.parse({
      apiVersion: CURRENT_API_VERSION,
      minimumSupportedApiVersion: MINIMUM_SUPPORTED_API_VERSION,
      features: {
        reportsEnabled: true,
        exportsEnabled: true,
        checkInEnabled: false,
        billingEnabled: false,
        paymentsEnabled: false,
      },
      nativeClients: {
        ios: { minimumSupportedVersion: null, latestVersion: null },
        android: { minimumSupportedVersion: null, latestVersion: null },
      },
    });

    expect(parsed.features.checkInEnabled).toBe(false);
    expect(
      platformMetadataSchema.safeParse({
        ...parsed,
        apiVersion: "v2",
      }).success,
    ).toBe(false);
    expect(
      platformMetadataSchema.safeParse({
        ...parsed,
        nativeClients: {
          ...parsed.nativeClients,
          ios: { minimumSupportedVersion: "1", latestVersion: null },
        },
      }).success,
    ).toBe(false);
  });
});
