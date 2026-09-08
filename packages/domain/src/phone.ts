import {
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js/max";

export const GCC_PHONE_COUNTRIES = [
  "SA",
  "AE",
  "BH",
  "KW",
  "OM",
  "QA",
] as const;

export type GccPhoneCountry = (typeof GCC_PHONE_COUNTRIES)[number];

const gccPhoneCountries = new Set<CountryCode>(GCC_PHONE_COUNTRIES);

export interface NormalizedPhoneNumber {
  e164: string;
  countryCode: CountryCode;
  callingCode: string;
  nationalNumber: string;
  isGcc: boolean;
}

export class PhoneNormalizationError extends Error {
  public constructor(
    public readonly code: "PHONE_REQUIRED" | "PHONE_INVALID",
    message: string,
  ) {
    super(message);
    this.name = "PhoneNormalizationError";
  }
}

/**
 * Parses and validates a phone number with libphonenumber's full metadata.
 * National-format input is interpreted using the selected GCC country, while
 * international input may resolve to any country supported by libphonenumber.
 */
export function normalizePhoneNumber(
  input: string,
  defaultCountry: GccPhoneCountry = "SA",
): NormalizedPhoneNumber {
  const value = input.trim();
  if (value.length === 0) {
    throw new PhoneNormalizationError(
      "PHONE_REQUIRED",
      "A contact phone number is required.",
    );
  }

  const phoneNumber = parsePhoneNumberFromString(value, defaultCountry);
  if (!phoneNumber?.isValid() || !phoneNumber.country) {
    throw new PhoneNormalizationError(
      "PHONE_INVALID",
      "The contact phone number is not valid for the selected country.",
    );
  }

  return {
    e164: phoneNumber.number,
    countryCode: phoneNumber.country,
    callingCode: phoneNumber.countryCallingCode,
    nationalNumber: phoneNumber.nationalNumber,
    isGcc: gccPhoneCountries.has(phoneNumber.country),
  };
}

export function maskPhoneNumber(e164: string, visibleDigits = 4): string {
  if (!Number.isInteger(visibleDigits) || visibleDigits < 0) {
    throw new PhoneNormalizationError(
      "PHONE_INVALID",
      "The visible phone digit count must be a non-negative integer.",
    );
  }

  const parsed = parsePhoneNumberFromString(e164);
  if (!parsed?.isValid()) {
    throw new PhoneNormalizationError(
      "PHONE_INVALID",
      "Only a valid E.164 phone number can be masked.",
    );
  }

  const nationalNumber = parsed.nationalNumber;
  const suffixLength = Math.min(visibleDigits, nationalNumber.length);
  const hiddenLength = nationalNumber.length - suffixLength;
  const suffix = nationalNumber.slice(hiddenLength);
  return `+${parsed.countryCallingCode}${"•".repeat(hiddenLength)}${suffix}`;
}
