import { describe, expect, it } from "vitest";
import arSA from "./dictionaries/ar-SA";
import en from "./dictionaries/en";
import { localeDirection } from "./config";
import {
  localizePathname,
  pathnameLocale,
  preferredLocale,
  replacePathnameLocale,
} from "./routing";

function keys(value: object, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === "object" ? keys(child, path) : [path];
  });
}

describe("locale routing", () => {
  it("prefers Arabic while respecting weighted English browser preferences", () => {
    expect(preferredLocale(null)).toBe("ar-SA");
    expect(preferredLocale("en-US,en;q=0.9,ar;q=0.5")).toBe("en");
    expect(preferredLocale("fr,ar-SA;q=0.9,en;q=0.8")).toBe("ar-SA");
    expect(preferredLocale("en;q=0,ar;q=0.7")).toBe("ar-SA");
    expect(preferredLocale("en;q=0")).toBe("ar-SA");
  });

  it("adds and replaces locale route segments", () => {
    expect(localizePathname("/", "ar-SA")).toBe("/ar-SA");
    expect(localizePathname("/events", "en")).toBe("/en/events");
    expect(pathnameLocale("/ar-SA/events")).toBe("ar-SA");
    expect(replacePathnameLocale("/ar-SA/events", "en")).toBe("/en/events");
  });

  it("derives document direction from the route locale", () => {
    expect(localeDirection("ar-SA")).toBe("rtl");
    expect(localeDirection("en")).toBe("ltr");
  });

  it("keeps Arabic and English dictionaries structurally identical", () => {
    expect(keys(en)).toEqual(keys(arSA));
  });
});
