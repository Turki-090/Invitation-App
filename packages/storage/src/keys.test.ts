import { describe, expect, it } from "vitest";
import { createStorageKeyFactory, storageKeyScopes } from "./keys";

describe("scoped storage keys", () => {
  const keys = createStorageKeyFactory(() => "generated-id");

  it("generates purpose-scoped keys for every private object category", () => {
    expect(
      keys.importFile({
        eventId: "event_1",
        importId: "import_1",
        filename: "Guests.XLSX",
      }),
    ).toBe("imports/event_1/import_1/generated-id.xlsx");
    expect(
      keys.eventImage({ eventId: "event_1", filename: "photo.JPEG" }),
    ).toBe("event-images/event_1/generated-id.jpeg");
    expect(
      keys.invitationAsset({
        eventId: "event_1",
        templateId: "template_1",
        filename: "invite.SVG",
      }),
    ).toBe("invitation-assets/event_1/template_1/generated-id.svg");
    expect(
      keys.generatedFile({
        eventId: "event_1",
        kind: "guest-export",
        filename: "guest-list.CSV",
      }),
    ).toBe("generated-files/event_1/guest-export/generated-id.csv");
    expect(Object.values(storageKeyScopes)).toEqual([
      "imports",
      "event-images",
      "invitation-assets",
      "generated-files",
    ]);
  });

  it("does not leak a source basename into the generated key", () => {
    const key = keys.importFile({
      eventId: "event_1",
      importId: "import_1",
      filename: "Turki wedding guest names.csv",
    });
    expect(key).toBe("imports/event_1/import_1/generated-id.csv");
    expect(key).not.toContain("Turki");
  });

  it.each([
    () =>
      keys.importFile({
        eventId: "../event",
        importId: "import_1",
        filename: "guests.csv",
      }),
    () => keys.eventImage({ eventId: "event_1", filename: "../photo.png" }),
    () =>
      keys.generatedFile({
        eventId: "event_1",
        kind: "guest export",
        filename: "guests.csv",
      }),
  ])("rejects invalid scope data and filenames", (generate) => {
    expect(generate).toThrow();
  });

  it("validates IDs produced by a caller-provided generator", () => {
    const unsafeFactory = createStorageKeyFactory(() => "../collision");
    expect(() =>
      unsafeFactory.eventImage({ eventId: "event_1", filename: "photo.png" }),
    ).toThrowError(
      expect.objectContaining({ code: "INVALID_STORAGE_KEY_SEGMENT" }),
    );
  });
});
