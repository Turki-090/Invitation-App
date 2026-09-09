import {
  InvitationInvariantError,
  validateInvitationAggregate,
} from "./invitation";
import {
  GCC_PHONE_COUNTRIES,
  normalizePhoneNumber,
  PhoneNormalizationError,
  type GccPhoneCountry,
} from "./phone";
import {
  InvitationType,
  type InvitationType as InvitationTypeValue,
} from "./types";

export const IMPORT_FIELDS = [
  "displayName",
  "contactName",
  "phoneNumber",
  "phoneCountry",
  "invitationType",
  "maxCompanions",
  "members",
  "internalNote",
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];
export type ImportSourceRow = Record<string, unknown>;

export interface ImportColumnMapping {
  displayName: string;
  phoneNumber: string;
  contactName?: string;
  phoneCountry?: string;
  invitationType?: string;
  maxCompanions?: string;
  members?: string;
  internalNote?: string;
}

export interface ImportedInvitationMember {
  name: string;
  isPrimary: boolean;
}

export interface NormalizedImportInvitation {
  displayName: string;
  contactName: string;
  phoneE164: string;
  phoneCountry: string;
  invitationType: InvitationTypeValue;
  maxCompanions: number;
  members: ImportedInvitationMember[];
  internalNote: string | null;
}

export interface ImportRowIssue {
  code: string;
  field: ImportField | "row";
  message: string;
}

export interface ImportRowValidation {
  normalized: NormalizedImportInvitation | null;
  errors: ImportRowIssue[];
}

const invitationTypeAliases = new Map<string, InvitationTypeValue>([
  ["single", InvitationType.SINGLE],
  ["single person", InvitationType.SINGLE],
  ["فردي", InvitationType.SINGLE],
  ["شخص واحد", InvitationType.SINGLE],
  ["named_group", InvitationType.NAMED_GROUP],
  ["named group", InvitationType.NAMED_GROUP],
  ["family", InvitationType.NAMED_GROUP],
  ["عائلة", InvitationType.NAMED_GROUP],
  ["مجموعة", InvitationType.NAMED_GROUP],
  ["primary_with_companions", InvitationType.PRIMARY_WITH_COMPANIONS],
  ["person + companions", InvitationType.PRIMARY_WITH_COMPANIONS],
  ["companions", InvitationType.PRIMARY_WITH_COMPANIONS],
  ["مرافقون", InvitationType.PRIMARY_WITH_COMPANIONS],
  ["شخص + مرافقون", InvitationType.PRIMARY_WITH_COMPANIONS],
]);

/**
 * Maps one persisted source row to the Stage 4 invitation aggregate. This
 * function is deliberately pure so the worker, correction endpoint, and
 * confirmation transaction all apply the same validation rules.
 */
export function validateImportRow(
  source: ImportSourceRow,
  mapping: ImportColumnMapping,
): ImportRowValidation {
  const errors: ImportRowIssue[] = [];
  const displayName = readText(
    source[mapping.displayName],
    "displayName",
    errors,
    { required: true, maximumLength: 160 },
  );
  const phoneNumber = readText(
    source[mapping.phoneNumber],
    "phoneNumber",
    errors,
    { required: true, maximumLength: 40 },
  );
  const contactName = readText(
    mapping.contactName ? source[mapping.contactName] : undefined,
    "contactName",
    errors,
    { maximumLength: 120 },
  );
  const internalNote = readText(
    mapping.internalNote ? source[mapping.internalNote] : undefined,
    "internalNote",
    errors,
    { maximumLength: 1_000 },
  );
  const invitationType = parseInvitationType(
    mapping.invitationType ? source[mapping.invitationType] : undefined,
    errors,
  );
  const maxCompanions = parseCompanionCount(
    mapping.maxCompanions ? source[mapping.maxCompanions] : undefined,
    invitationType,
    errors,
  );
  const memberNames = parseMemberNames(
    mapping.members ? source[mapping.members] : undefined,
    errors,
  );
  const members = buildMembers(
    invitationType,
    displayName,
    contactName,
    memberNames,
  );
  const defaultCountry = parsePhoneCountry(
    mapping.phoneCountry ? source[mapping.phoneCountry] : undefined,
    errors,
  );

  let phone: ReturnType<typeof normalizePhoneNumber> | undefined;
  if (phoneNumber) {
    try {
      phone = normalizePhoneNumber(phoneNumber, defaultCountry);
    } catch (error) {
      errors.push({
        code:
          error instanceof PhoneNormalizationError
            ? error.code
            : "PHONE_INVALID",
        field: "phoneNumber",
        message:
          error instanceof Error
            ? error.message
            : "The contact phone number is invalid.",
      });
    }
  }

  if (invitationType && maxCompanions !== null) {
    try {
      validateInvitationAggregate({
        invitationType,
        maxCompanions,
        members,
      });
    } catch (error) {
      errors.push({
        code:
          error instanceof InvitationInvariantError
            ? error.code
            : "INVITATION_STRUCTURE_INVALID",
        field:
          invitationType === InvitationType.NAMED_GROUP ? "members" : "row",
        message:
          error instanceof Error
            ? error.message
            : "The invitation structure is invalid.",
      });
    }
  }

  if (
    errors.length > 0 ||
    !displayName ||
    !phone ||
    !invitationType ||
    maxCompanions === null
  ) {
    return { normalized: null, errors };
  }

  return {
    normalized: {
      displayName,
      contactName: contactName || members[0]?.name || displayName,
      phoneE164: phone.e164,
      phoneCountry: phone.countryCode,
      invitationType,
      maxCompanions,
      members,
      internalNote: internalNote || null,
    },
    errors,
  };
}

export function applyImportColumnMapping(
  row: ImportSourceRow,
  mapping: ImportColumnMapping,
): Partial<Record<ImportField, unknown>> {
  const mapped: Partial<Record<ImportField, unknown>> = {};
  for (const field of IMPORT_FIELDS) {
    const header = mapping[field];
    if (header) mapped[field] = row[header];
  }
  return mapped;
}

function readText(
  value: unknown,
  field: ImportField,
  errors: ImportRowIssue[],
  options: { required?: boolean; maximumLength: number },
): string {
  if (value === null || value === undefined || value === "") {
    if (options.required) {
      errors.push({
        code: "FIELD_REQUIRED",
        field,
        message: "A value is required.",
      });
    }
    return "";
  }

  if (typeof value !== "string" && typeof value !== "number") {
    errors.push({
      code: "MALFORMED_CELL_VALUE",
      field,
      message: "Only plain text and numeric cell values are supported.",
    });
    return "";
  }

  const result = String(value).trim();
  if (!result && options.required) {
    errors.push({
      code: "FIELD_REQUIRED",
      field,
      message: "A value is required.",
    });
  }
  if (result.length > options.maximumLength) {
    errors.push({
      code: "FIELD_TOO_LONG",
      field,
      message: `The value cannot exceed ${options.maximumLength} characters.`,
    });
  }
  return result;
}

function parseInvitationType(
  value: unknown,
  errors: ImportRowIssue[],
): InvitationTypeValue | null {
  if (value === null || value === undefined || value === "") {
    return InvitationType.SINGLE;
  }
  if (typeof value !== "string") {
    errors.push({
      code: "INVITATION_TYPE_INVALID",
      field: "invitationType",
      message: "The invitation type is not supported.",
    });
    return null;
  }
  const normalized = value.trim().toLocaleLowerCase("en");
  const type = invitationTypeAliases.get(normalized);
  if (!type) {
    errors.push({
      code: "INVITATION_TYPE_INVALID",
      field: "invitationType",
      message: "Use single, named group, or person with companions.",
    });
    return null;
  }
  return type;
}

function parseCompanionCount(
  value: unknown,
  invitationType: InvitationTypeValue | null,
  errors: ImportRowIssue[],
): number | null {
  if (value === null || value === undefined || value === "") return 0;
  const count =
    typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isInteger(count) || count < 0 || count > 100) {
    errors.push({
      code: "COMPANION_COUNT_INVALID",
      field: "maxCompanions",
      message: "The companion count must be a whole number from 0 to 100.",
    });
    return null;
  }
  if (
    invitationType &&
    invitationType !== InvitationType.PRIMARY_WITH_COMPANIONS &&
    count !== 0
  ) {
    errors.push({
      code: "COMPANIONS_NOT_ALLOWED",
      field: "maxCompanions",
      message: "Only person-with-companions invitations allow companions.",
    });
  }
  return count;
}

function parseMemberNames(value: unknown, errors: ImportRowIssue[]): string[] {
  if (value === null || value === undefined || value === "") return [];
  if (typeof value !== "string" && typeof value !== "number") {
    errors.push({
      code: "MEMBERS_MALFORMED",
      field: "members",
      message: "Separate named members with a vertical bar (|).",
    });
    return [];
  }
  const rawParts = String(value).split("|");
  if (rawParts.some((part) => part.trim().length === 0)) {
    errors.push({
      code: "MEMBER_NAME_REQUIRED",
      field: "members",
      message: "Named-group members cannot contain an empty name.",
    });
  }
  const names = rawParts.map((part) => part.trim()).filter(Boolean);
  if (names.length > 100 || names.some((name) => name.length > 120)) {
    errors.push({
      code: "MEMBERS_LIMIT_EXCEEDED",
      field: "members",
      message: "Use at most 100 members with names up to 120 characters.",
    });
  }
  return names.slice(0, 100);
}

function buildMembers(
  invitationType: InvitationTypeValue | null,
  displayName: string,
  contactName: string,
  memberNames: readonly string[],
): ImportedInvitationMember[] {
  if (invitationType === InvitationType.NAMED_GROUP) {
    return memberNames.map((name, index) => ({
      name,
      isPrimary: index === 0,
    }));
  }
  const name = memberNames[0] || contactName || displayName;
  return name ? [{ name, isPrimary: true }] : [];
}

function parsePhoneCountry(
  value: unknown,
  errors: ImportRowIssue[],
): GccPhoneCountry {
  if (value === null || value === undefined || value === "") return "SA";
  if (typeof value !== "string") {
    errors.push({
      code: "PHONE_COUNTRY_UNSUPPORTED",
      field: "phoneCountry",
      message: "Use a supported two-letter GCC country code.",
    });
    return "SA";
  }
  const country = value.trim().toUpperCase();
  if (!(GCC_PHONE_COUNTRIES as readonly string[]).includes(country)) {
    errors.push({
      code: "PHONE_COUNTRY_UNSUPPORTED",
      field: "phoneCountry",
      message: "Use SA, AE, BH, KW, OM, or QA.",
    });
    return "SA";
  }
  return country as GccPhoneCountry;
}
