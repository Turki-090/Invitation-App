import { describe, expect, it } from "vitest";
import {
  StorageValidationError,
  validateBucketName,
  validateObjectKey,
} from "./validation";

describe("storage location validation", () => {
  it.each(["dawah-private", "assets.dawah", "a12"])(
    "accepts portable bucket name %s",
    (bucket) => {
      expect(validateBucketName(bucket)).toBe(bucket);
    },
  );

  it.each([
    "ab",
    "UPPERCASE",
    "-leading",
    "trailing-",
    "adjacent..dots",
    "label-.edge",
    "192.168.0.1",
    "xn--reserved",
    "reserved-s3alias",
  ])("rejects unsafe or provider-reserved bucket name %s", (bucket) => {
    expect(() => validateBucketName(bucket)).toThrowError(
      expect.objectContaining({ code: "INVALID_STORAGE_BUCKET" }),
    );
  });

  it.each([
    "",
    "/imports/event/file.csv",
    "imports/event/file.csv/",
    "imports//file.csv",
    "imports/../file.csv",
    "imports/.hidden/file.csv",
    "imports/event\\file.csv",
    "imports/event/a file.csv",
    `imports/event/${"a".repeat(252)}.csv`,
  ])("rejects ambiguous object key %j", (key) => {
    expect(() => validateObjectKey(key)).toThrowError(StorageValidationError);
  });

  it("accepts a scoped URL-safe object key", () => {
    const key = "invitation-assets/event_1/template-2/object-id.webp";
    expect(validateObjectKey(key)).toBe(key);
  });
});
