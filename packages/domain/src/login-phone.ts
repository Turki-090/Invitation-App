import { normalizePhoneNumber } from "./phone";

/** Accept Saudi national input and international input, without extracting a
 * number from arbitrary text or silently repairing a malformed country code. */
export function normalizeLoginPhone(input: string): string {
  if (!/^[+\d\s()-]+$/.test(input)) throw new Error("Invalid phone number.");
  let value = input.trim().replace(/[\s()-]/g, "");
  if (value.startsWith("00")) value = `+${value.slice(2)}`;
  if (value.startsWith("966")) value = `+${value}`;
  if (value.startsWith("+9660")) throw new Error("Invalid phone number.");
  const normalized = normalizePhoneNumber(value, "SA");
  if (
    normalized.countryCode === "SA" &&
    !/^\+9665\d{8}$/.test(normalized.e164)
  ) {
    throw new Error("A mobile phone number is required.");
  }
  return normalized.e164;
}
