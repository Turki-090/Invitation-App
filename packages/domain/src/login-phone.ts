import {
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js/max";
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

/**
 * Supabase stores, and signs into access tokens, an identity's phone as bare
 * international digits. Restores the canonical E.164 form every other record
 * uses, or returns null for anything that is not already a valid number in
 * that canonical form, so a malformed claim can never match a stored phone.
 */
export function normalizeIdentityPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.trim().replace(/^\+/, "");
  if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
  try {
    const { e164 } = normalizePhoneNumber(`+${digits}`);
    return e164 === `+${digits}` ? e164 : null;
  } catch {
    return null;
  }
}

/**
 * The ISO country of a canonical login phone that can receive a sign-in SMS,
 * or null for any other number type. Premium-rate, shared-cost, fixed-line,
 * and similar numbers are how SMS-pumping fraud turns a login form into
 * revenue for someone else, so a code is never sent to one.
 */
export function smsLoginCountry(e164: string): CountryCode | null {
  const parsed = parsePhoneNumberFromString(e164);
  if (!parsed?.isValid() || !parsed.country || parsed.number !== e164) {
    return null;
  }
  const type = parsed.getType();
  return type === "MOBILE" || type === "FIXED_LINE_OR_MOBILE"
    ? parsed.country
    : null;
}
