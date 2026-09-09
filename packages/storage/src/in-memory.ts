import type {
  ObjectLocation,
  PrivateObjectStorage,
  PutObjectRequest,
  StoredObject,
  StoredObjectInfo,
} from "./types";
import {
  normalizeMetadata,
  validateObjectBody,
  validateObjectLocation,
} from "./validation";

interface MemoryEntry {
  readonly info: StoredObjectInfo;
  readonly body: Uint8Array;
}

export interface InMemoryObjectStorageOptions {
  readonly now?: () => Date;
}

/** A behaviorally equivalent test double that always returns defensive copies. */
export class InMemoryObjectStorage implements PrivateObjectStorage {
  readonly #objects = new Map<string, MemoryEntry>();
  readonly #now: () => Date;
  #version = 0;

  public constructor(options: InMemoryObjectStorageOptions = {}) {
    this.#now = options.now ?? (() => new Date());
  }

  public get objectCount(): number {
    return this.#objects.size;
  }

  public async putObject(request: PutObjectRequest): Promise<StoredObjectInfo> {
    const location = validateObjectLocation(request);
    const body = validateObjectBody(request.body).slice();
    const metadata = normalizeMetadata(request.metadata);
    const lastModified = new Date(this.#now().getTime());
    this.#version += 1;

    const info: StoredObjectInfo = Object.freeze({
      ...location,
      size: body.byteLength,
      ...(request.contentType === undefined
        ? {}
        : { contentType: request.contentType }),
      eTag: `"memory-${this.#version.toString(16)}"`,
      lastModified,
      metadata,
    });
    this.#objects.set(storageMapKey(location), { info, body });
    return cloneInfo(info);
  }

  public async getObject(
    locationInput: ObjectLocation,
  ): Promise<StoredObject | null> {
    const location = validateObjectLocation(locationInput);
    const entry = this.#objects.get(storageMapKey(location));
    if (!entry) return null;
    return Object.freeze({
      ...cloneInfo(entry.info),
      body: entry.body.slice(),
    });
  }

  public async headObject(
    locationInput: ObjectLocation,
  ): Promise<StoredObjectInfo | null> {
    const location = validateObjectLocation(locationInput);
    const entry = this.#objects.get(storageMapKey(location));
    return entry ? cloneInfo(entry.info) : null;
  }

  public async deleteObject(locationInput: ObjectLocation): Promise<void> {
    const location = validateObjectLocation(locationInput);
    this.#objects.delete(storageMapKey(location));
  }

  public clear(): void {
    this.#objects.clear();
  }
}

function storageMapKey(location: ObjectLocation): string {
  return `${location.bucket}\u0000${location.key}`;
}

function cloneInfo(info: StoredObjectInfo): StoredObjectInfo {
  return Object.freeze({
    ...info,
    ...(info.lastModified === undefined
      ? {}
      : { lastModified: new Date(info.lastModified.getTime()) }),
    metadata: Object.freeze({ ...info.metadata }),
  });
}
