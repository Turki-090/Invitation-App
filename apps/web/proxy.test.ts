import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

function request(pathname: string, acceptLanguage?: string) {
  return new NextRequest(`https://dawah.test${pathname}`, {
    headers: acceptLanguage ? { "accept-language": acceptLanguage } : undefined,
  });
}

describe("locale proxy", () => {
  it("redirects unprefixed routes to the preferred supported locale", () => {
    const response = proxy(request("/events?view=active", "en-US,ar;q=0.8"));
    const location = new URL(response.headers.get("location") ?? "");
    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/en/events");
    expect(location.search).toBe("?view=active");
  });

  it("uses Arabic when English is explicitly unacceptable", () => {
    const response = proxy(request("/", "en;q=0,ar-SA;q=0.9"));
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe(
      "/ar-SA",
    );
  });

  it("preserves a private invitation capability while adding the locale", () => {
    const token = "a".repeat(43);
    const response = proxy(request(`/i/${token}?source=whatsapp`, "en-US"));
    const location = new URL(response.headers.get("location") ?? "");
    expect(response.status).toBe(307);
    expect(location.pathname).toBe(`/en/i/${token}`);
    expect(location.search).toBe("?source=whatsapp");
  });

  it("passes localized routes and static assets through unchanged", () => {
    for (const pathname of ["/ar-SA/events", "/en/events", "/logo.svg"]) {
      const response = proxy(request(pathname));
      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
  });
});
