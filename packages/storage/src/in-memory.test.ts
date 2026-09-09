import { describe, expect, it } from "vitest";
import { InMemoryObjectStorage } from "./in-memory";

describe("InMemoryObjectStorage", () => {
  it("round-trips private objects and metadata with defensive copies", async () => {
    const now = new Date("2026-09-08T08:00:00.000Z");
    const storage = new InMemoryObjectStorage({ now: () => now });
    const source = Uint8Array.from([1, 2, 3]);
    const metadata = { "event-id": "event_1" };

    const stored = await storage.putObject({
      bucket: "dawah-private",
      key: "imports/event_1/import_1/file.csv",
      body: source,
      contentType: "text/csv",
      metadata,
    });
    source[0] = 99;
    metadata["event-id"] = "changed";

    expect(stored).toMatchObject({
      size: 3,
      contentType: "text/csv",
      eTag: '"memory-1"',
      lastModified: now,
      metadata: { "event-id": "event_1" },
    });

    const firstRead = await storage.getObject({
      bucket: "dawah-private",
      key: "imports/event_1/import_1/file.csv",
    });
    expect(firstRead?.body).toEqual(Uint8Array.from([1, 2, 3]));
    if (firstRead) firstRead.body[1] = 88;
    expect(
      (
        await storage.getObject({
          bucket: "dawah-private",
          key: "imports/event_1/import_1/file.csv",
        })
      )?.body,
    ).toEqual(Uint8Array.from([1, 2, 3]));
  });

  it("isolates identical keys in different buckets", async () => {
    const storage = new InMemoryObjectStorage();
    const key = "event-images/event_1/image.png";
    await storage.putObject({
      bucket: "event-images-a",
      key,
      body: Uint8Array.of(1),
    });
    await storage.putObject({
      bucket: "event-images-b",
      key,
      body: Uint8Array.of(2),
    });

    expect(
      (await storage.getObject({ bucket: "event-images-a", key }))?.body,
    ).toEqual(Uint8Array.of(1));
    expect(
      (await storage.getObject({ bucket: "event-images-b", key }))?.body,
    ).toEqual(Uint8Array.of(2));
  });

  it("has nullable reads and idempotent deletes", async () => {
    const storage = new InMemoryObjectStorage();
    const location = {
      bucket: "dawah-private",
      key: "generated-files/event_1/export/file.csv",
    };
    expect(await storage.headObject(location)).toBeNull();
    await storage.deleteObject(location);
    await storage.putObject({ ...location, body: new Uint8Array() });
    expect(await storage.headObject(location)).toMatchObject({ size: 0 });
    await storage.deleteObject(location);
    await storage.deleteObject(location);
    expect(await storage.getObject(location)).toBeNull();
  });

  it("validates locations, bodies, and metadata before mutation", async () => {
    const storage = new InMemoryObjectStorage();
    await expect(
      storage.putObject({
        bucket: "INVALID",
        key: "imports/event/file.csv",
        body: Uint8Array.of(1),
      }),
    ).rejects.toMatchObject({ code: "INVALID_STORAGE_BUCKET" });
    await expect(
      storage.putObject({
        bucket: "dawah-private",
        key: "imports/../file.csv",
        body: Uint8Array.of(1),
      }),
    ).rejects.toMatchObject({ code: "INVALID_STORAGE_KEY" });
    await expect(
      storage.putObject({
        bucket: "dawah-private",
        key: "imports/event/file.csv",
        body: "not-bytes" as unknown as Uint8Array,
      }),
    ).rejects.toMatchObject({ code: "INVALID_STORAGE_BODY" });
    expect(storage.objectCount).toBe(0);
  });
});
