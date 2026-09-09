import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { S3ObjectStorage, type S3ObjectStorageClient } from "./s3";
import { StorageProviderError } from "./types";

function mockClient(send: ReturnType<typeof vi.fn>): S3ObjectStorageClient {
  return { send } as unknown as S3ObjectStorageClient;
}

describe("S3ObjectStorage", () => {
  it("maps a put to the S3-compatible API without a public ACL", async () => {
    const send = vi.fn().mockResolvedValue({ ETag: '"provider-etag"' });
    const storage = new S3ObjectStorage(mockClient(send));
    const body = Uint8Array.from([4, 5]);

    await expect(
      storage.putObject({
        bucket: "dawah-private",
        key: "imports/event_1/import_1/file.csv",
        body,
        contentType: "text/csv",
        metadata: { "event-id": "event_1" },
      }),
    ).resolves.toMatchObject({ size: 2, eTag: '"provider-etag"' });

    const command = send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect((command as PutObjectCommand).input).toEqual({
      Bucket: "dawah-private",
      Key: "imports/event_1/import_1/file.csv",
      Body: body,
      ContentType: "text/csv",
      Metadata: { "event-id": "event_1" },
    });
    expect((command as PutObjectCommand).input).not.toHaveProperty("ACL");
  });

  it("materializes streamed S3 bodies into provider-neutral bytes", async () => {
    const transformToByteArray = vi
      .fn()
      .mockResolvedValue(Uint8Array.from([7, 8, 9]));
    const modified = new Date("2026-09-08T08:00:00.000Z");
    const send = vi.fn().mockResolvedValue({
      Body: { transformToByteArray },
      ContentLength: 3,
      ContentType: "image/webp",
      ETag: '"image-etag"',
      LastModified: modified,
      Metadata: { "event-id": "event_1" },
    });
    const storage = new S3ObjectStorage(mockClient(send));

    await expect(
      storage.getObject({
        bucket: "dawah-private",
        key: "event-images/event_1/image.webp",
      }),
    ).resolves.toMatchObject({
      body: Uint8Array.from([7, 8, 9]),
      size: 3,
      contentType: "image/webp",
      eTag: '"image-etag"',
      lastModified: modified,
      metadata: { "event-id": "event_1" },
    });
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(GetObjectCommand);
    expect(transformToByteArray).toHaveBeenCalledOnce();
  });

  it("returns null for provider-independent not-found responses", async () => {
    const notFound = Object.assign(new Error("missing"), {
      name: "NotFound",
      $metadata: { httpStatusCode: 404 },
    });
    const send = vi.fn().mockRejectedValue(notFound);
    const storage = new S3ObjectStorage(mockClient(send));
    const location = {
      bucket: "dawah-private",
      key: "generated-files/event_1/export/file.csv",
    };

    await expect(storage.getObject(location)).resolves.toBeNull();
    await expect(storage.headObject(location)).resolves.toBeNull();
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(GetObjectCommand);
    expect(send.mock.calls[1]?.[0]).toBeInstanceOf(HeadObjectCommand);
  });

  it("uses idempotent S3 deletion and validates before sending", async () => {
    const send = vi.fn().mockResolvedValue({});
    const storage = new S3ObjectStorage(mockClient(send));
    await storage.deleteObject({
      bucket: "dawah-private",
      key: "invitation-assets/event_1/template_1/file.svg",
    });
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(DeleteObjectCommand);

    await expect(
      storage.deleteObject({
        bucket: "dawah-private",
        key: "../unsafe",
      }),
    ).rejects.toMatchObject({ code: "INVALID_STORAGE_KEY" });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("wraps provider failures in the vendor-neutral error", async () => {
    const providerFailure = new Error("endpoint unavailable");
    const send = vi.fn().mockRejectedValue(providerFailure);
    const storage = new S3ObjectStorage(mockClient(send));

    const result = storage.headObject({
      bucket: "dawah-private",
      key: "imports/event_1/import_1/file.csv",
    });
    await expect(result).rejects.toBeInstanceOf(StorageProviderError);
    await expect(result).rejects.toMatchObject({
      operation: "head",
      cause: providerFailure,
    });
  });
});
