import type { Response } from "express";
import { describe, expect, it, vi } from "vitest";
import type { RsvpService } from "./rsvp.service";
import {
  getPublicCapabilityTracker,
  PublicRsvpController,
} from "./rsvp.controller";

describe("PublicRsvpController", () => {
  it("uses tighter per-minute limits for public reads and writes", () => {
    expect(
      Reflect.getMetadata(
        "THROTTLER:LIMITdefault",
        PublicRsvpController.prototype.getInvitation,
      ),
    ).toBe(30);
    expect(
      Reflect.getMetadata(
        "THROTTLER:TTLdefault",
        PublicRsvpController.prototype.getInvitation,
      ),
    ).toBe(60_000);
    expect(
      Reflect.getMetadata(
        "THROTTLER:LIMITdefault",
        PublicRsvpController.prototype.submit,
      ),
    ).toBe(10);

    const readTracker = Reflect.getMetadata(
      "THROTTLER:TRACKERdefault",
      PublicRsvpController.prototype.getInvitation,
    ) as typeof getPublicCapabilityTracker;
    const writeTracker = Reflect.getMetadata(
      "THROTTLER:TRACKERdefault",
      PublicRsvpController.prototype.submit,
    ) as typeof getPublicCapabilityTracker;

    expect(readTracker).toBe(getPublicCapabilityTracker);
    expect(writeTracker).toBe(getPublicCapabilityTracker);
  });

  it("isolates public limits by client and opaque capability fingerprint", () => {
    const first = getPublicCapabilityTracker({
      ip: "203.0.113.10",
      params: { token: "private-token-one" },
    });
    const second = getPublicCapabilityTracker({
      ip: "203.0.113.10",
      params: { token: "private-token-two" },
    });
    const anotherClient = getPublicCapabilityTracker({
      ip: "203.0.113.11",
      params: { token: "private-token-one" },
    });

    expect(first).not.toBe(second);
    expect(first).not.toBe(anotherClient);
    expect(first).not.toContain("private-token-one");
  });

  it("returns invitation data with private, non-indexable response headers", async () => {
    const getPublicInvitation = vi.fn().mockResolvedValue({ locale: "ar-SA" });
    const controller = new PublicRsvpController({
      getPublicInvitation,
    } as unknown as RsvpService);
    const response = responseStub();

    await expect(
      controller.getInvitation("private-token", { locale: "ar-SA" }, response),
    ).resolves.toEqual({ locale: "ar-SA" });

    expect(getPublicInvitation).toHaveBeenCalledWith("private-token", "ar-SA");
    expect(response.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "private, no-store, max-age=0, must-revalidate",
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      "X-Robots-Tag",
      "noindex, nofollow, noarchive",
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      "Referrer-Policy",
      "no-referrer",
    );
  });

  it("applies the same privacy headers to RSVP submissions", async () => {
    const submitGuest = vi.fn().mockResolvedValue({ changed: true });
    const controller = new PublicRsvpController({
      submitGuest,
    } as unknown as RsvpService);
    const response = responseStub();
    const input = {
      submissionId: "11111111-1111-4111-8111-111111111111",
      attendingMemberIds: ["22222222-2222-4222-8222-222222222222"],
      companionCount: 0,
    };

    await expect(
      controller.submit("private-token", { locale: "en" }, input, response),
    ).resolves.toEqual({ changed: true });

    expect(submitGuest).toHaveBeenCalledWith("private-token", "en", input);
    expect(response.setHeader).toHaveBeenCalledWith("Pragma", "no-cache");
    expect(response.setHeader).toHaveBeenCalledWith("Expires", "0");
    expect(response.setHeader).toHaveBeenCalledTimes(5);
  });
});

function responseStub(): Response {
  return {
    setHeader: vi.fn(),
  } as unknown as Response;
}
