export interface ObjectLocation {
  readonly bucket: string;
  readonly key: string;
}

export interface PutObjectRequest extends ObjectLocation {
  readonly body: Uint8Array;
  readonly contentType?: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface StoredObjectInfo extends ObjectLocation {
  readonly size: number;
  readonly contentType?: string;
  readonly eTag?: string;
  readonly lastModified?: Date;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface StoredObject extends StoredObjectInfo {
  readonly body: Uint8Array;
}

/**
 * Vendor-neutral access to objects held in private buckets.
 *
 * Implementations deliberately expose no public-ACL or public-URL operation.
 * Bucket policies remain deployment infrastructure and must deny public access.
 */
export interface PrivateObjectStorage {
  putObject(request: PutObjectRequest): Promise<StoredObjectInfo>;
  getObject(location: ObjectLocation): Promise<StoredObject | null>;
  headObject(location: ObjectLocation): Promise<StoredObjectInfo | null>;
  deleteObject(location: ObjectLocation): Promise<void>;
}

export type StorageOperation = "put" | "get" | "head" | "delete";

export class StorageProviderError extends Error {
  public constructor(
    public readonly operation: StorageOperation,
    public readonly location: ObjectLocation,
    cause: unknown,
  ) {
    super(
      `Private object storage ${operation} failed for ${location.bucket}/${location.key}.`,
      { cause },
    );
    this.name = "StorageProviderError";
  }
}
