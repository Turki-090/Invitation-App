import { describe, expect, it } from "vitest";
import { listNotificationsQuerySchema } from "./notifications";

describe("notification query contract", () => {
  it.each([
    [undefined, false],
    ["false", false],
    ["true", true],
    [false, false],
    [true, true],
  ] as const)("parses unreadOnly=%s as %s", (input, expected) => {
    expect(
      listNotificationsQuerySchema.parse({
        page: "1",
        pageSize: "20",
        unreadOnly: input,
      }).unreadOnly,
    ).toBe(expected);
  });
});
