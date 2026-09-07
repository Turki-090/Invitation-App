import { describe, expect, it } from "vitest";
import { createEventSchema, isSafeMapUrl, updateEventSchema } from "./events";

const validEvent = {
  nameAr: "حفل زواج خالد ونورة",
  eventType: "WEDDING",
  eventDate: "2027-03-18",
  startTime: "20:30",
  timezone: "Asia/Riyadh",
  venueNameAr: "قاعة الماسة",
  city: "الرياض",
};

describe("event contracts", () => {
  it("accepts time-zone-safe event input and applies stable defaults", () => {
    expect(createEventSchema.parse(validEvent)).toMatchObject({
      allowRsvpEdits: true,
      qrEnabled: false,
      timezone: "Asia/Riyadh",
    });
  });

  it("rejects invalid calendar dates, unknown time zones, and incomplete coordinates", () => {
    expect(
      createEventSchema.safeParse({
        ...validEvent,
        eventDate: "2027-02-30",
      }).success,
    ).toBe(false);
    expect(
      createEventSchema.safeParse({
        ...validEvent,
        timezone: "Riyadh/local",
      }).success,
    ).toBe(false);
    expect(
      createEventSchema.safeParse({ ...validEvent, latitude: 24.7136 }).success,
    ).toBe(false);
  });

  it("accepts only HTTPS Google or Apple map destinations", () => {
    expect(isSafeMapUrl("https://maps.app.goo.gl/example")).toBe(true);
    expect(isSafeMapUrl("https://maps.apple.com/?q=Riyadh")).toBe(true);
    expect(isSafeMapUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeMapUrl("https://example.test/map")).toBe(false);
  });

  it("supports explicit clearing in patches and rejects empty patches", () => {
    expect(
      updateEventSchema.parse({ mapUrl: null, rsvpDeadline: null }),
    ).toEqual({ mapUrl: null, rsvpDeadline: null });
    expect(updateEventSchema.safeParse({}).success).toBe(false);
  });
});
