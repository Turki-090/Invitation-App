import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import type {
  ObjectLocation,
  PrivateObjectStorage,
  PutObjectRequest,
  StoredObject,
  StoredObjectInfo,
  StorageOperation,
} from "./types";
import { StorageProviderError } from "./types";
import {
  normalizeMetadata,
  validateObjectBody,
  validateObjectLocation,
} from "./validation";

export type S3ObjectStorageClient = Pick<S3Client, "send">;

/**
 * S3-compatible adapter. Custom endpoints and path-style addressing are passed
 * through the normal S3ClientConfig by createS3ObjectStorage.
 */
export class S3ObjectStorage implements PrivateObjectStorage {
  public constructor(private readonly client: S3ObjectStorageClient) {}

  public async putObject(request: PutObjectRequest): Promise<StoredObjectInfo> {
    const location = validateObjectLocation(request);
    const body = validateObjectBody(request.body);
    const metadata = normalizeMetadata(request.metadata);

    try {
      const output = await this.client.send(
        new PutObjectCommand({
          Bucket: location.bucket,
          Key: location.key,
          Body: body,
          ...(request.contentType === undefined
            ? {}
            : { ContentType: request.contentType }),
          ...(Object.keys(metadata).length === 0 ? {} : { Metadata: metadata }),
        }),
      );

      return Object.freeze({
        ...location,
        size: body.byteLength,
        ...(request.contentType === undefined
          ? {}
          : { contentType: request.contentType }),
        ...(output.ETag === undefined ? {} : { eTag: output.ETag }),
        metadata,
      });
    } catch (error) {
      throw providerError("put", location, error);
    }
  }

  public async getObject(
    locationInput: ObjectLocation,
  ): Promise<StoredObject | null> {
    const location = validateObjectLocation(locationInput);

    try {
      const output = await this.client.send(
        new GetObjectCommand({ Bucket: location.bucket, Key: location.key }),
      );
      if (!output.Body) {
        throw new Error("The S3 provider returned an object without a body.");
      }

      const body = Uint8Array.from(await output.Body.transformToByteArray());
      const metadata = normalizeMetadata(output.Metadata);
      return Object.freeze({
        ...location,
        body,
        size: output.ContentLength ?? body.byteLength,
        ...(output.ContentType === undefined
          ? {}
          : { contentType: output.ContentType }),
        ...(output.ETag === undefined ? {} : { eTag: output.ETag }),
        ...(output.LastModified === undefined
          ? {}
          : { lastModified: new Date(output.LastModified.getTime()) }),
        metadata,
      });
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw providerError("get", location, error);
    }
  }

  public async headObject(
    locationInput: ObjectLocation,
  ): Promise<StoredObjectInfo | null> {
    const location = validateObjectLocation(locationInput);

    try {
      const output = await this.client.send(
        new HeadObjectCommand({ Bucket: location.bucket, Key: location.key }),
      );
      return Object.freeze({
        ...location,
        size: output.ContentLength ?? 0,
        ...(output.ContentType === undefined
          ? {}
          : { contentType: output.ContentType }),
        ...(output.ETag === undefined ? {} : { eTag: output.ETag }),
        ...(output.LastModified === undefined
          ? {}
          : { lastModified: new Date(output.LastModified.getTime()) }),
        metadata: normalizeMetadata(output.Metadata),
      });
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw providerError("head", location, error);
    }
  }

  public async deleteObject(locationInput: ObjectLocation): Promise<void> {
    const location = validateObjectLocation(locationInput);

    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: location.bucket, Key: location.key }),
      );
    } catch (error) {
      throw providerError("delete", location, error);
    }
  }
}

export function createS3ObjectStorage(config: S3ClientConfig): S3ObjectStorage {
  return new S3ObjectStorage(new S3Client(config));
}

function providerError(
  operation: StorageOperation,
  location: ObjectLocation,
  error: unknown,
): StorageProviderError {
  return error instanceof StorageProviderError
    ? error
    : new StorageProviderError(operation, location, error);
}

function isNotFoundError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as {
    readonly name?: unknown;
    readonly $metadata?: { readonly httpStatusCode?: unknown };
  };
  return (
    candidate.name === "NoSuchKey" ||
    candidate.name === "NotFound" ||
    candidate.$metadata?.httpStatusCode === 404
  );
}
