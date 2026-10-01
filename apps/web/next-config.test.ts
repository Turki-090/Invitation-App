import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig, { privateInvitationHeaders } from "./next.config";

describe("private invitation response headers", () => {
  it("applies restrictive privacy headers to localized and redirect routes", async () => {
    const rules = await nextConfig.headers?.();
    const privateRules = rules?.filter((rule) =>
      ["/i/:token", "/:locale(ar-SA|en)/i/:token"].includes(rule.source),
    );

    expect(privateRules).toHaveLength(2);
    for (const rule of privateRules ?? []) {
      expect(rule.headers).toEqual([...privateInvitationHeaders]);
    }
    expect(privateInvitationHeaders).toEqual(
      expect.arrayContaining([
        {
          key: "Cache-Control",
          value: "private, no-store, no-cache, max-age=0, must-revalidate",
        },
        {
          key: "X-Robots-Tag",
          value: "noindex, nofollow, noarchive",
        },
        { key: "Referrer-Policy", value: "no-referrer" },
      ]),
    );
  });
});

describe("content security policy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function policy(): Promise<string> {
    vi.resetModules();
    const { default: config } = await import("./next.config");
    const rules = await config.headers?.();
    const header = rules
      ?.find((rule) => rule.source === "/:path*")
      ?.headers.find(({ key }) => key === "Content-Security-Policy");
    return header?.value ?? "";
  }

  it("admits the Turnstile script and frame only when a site key is set", async () => {
    expect(await policy()).not.toContain("challenges.cloudflare.com");
    expect(await policy()).not.toContain("frame-src");

    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "0x4AAAAAAAtestsitekey");
    const withCaptcha = await policy();
    expect(withCaptcha).toMatch(
      /script-src [^;]*https:\/\/challenges\.cloudflare\.com/,
    );
    expect(withCaptcha).toContain(
      "frame-src 'self' https://challenges.cloudflare.com",
    );
  });
});
