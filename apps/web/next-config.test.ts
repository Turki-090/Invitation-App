import { describe, expect, it } from "vitest";
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
