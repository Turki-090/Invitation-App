import { describe, expect, it } from "vitest";
import {
  applyImportColumnMapping,
  validateImportRow,
  type ImportColumnMapping,
} from "./import";

const mapping: ImportColumnMapping = {
  displayName: "Guest",
  contactName: "Contact",
  phoneNumber: "Phone",
  phoneCountry: "Country",
  invitationType: "Type",
  maxCompanions: "Companions",
  members: "Members",
  internalNote: "Note",
};

describe("guest import domain", () => {
  it("normalizes GCC single and companion invitations", () => {
    expect(
      validateImportRow(
        {
          Guest: "سارة القحطاني",
          Phone: "051 234 5678",
          Country: "SA",
        },
        mapping,
      ),
    ).toEqual({
      errors: [],
      normalized: {
        displayName: "سارة القحطاني",
        contactName: "سارة القحطاني",
        phoneE164: "+966512345678",
        phoneCountry: "SA",
        invitationType: "SINGLE",
        maxCompanions: 0,
        members: [{ name: "سارة القحطاني", isPrimary: true }],
        internalNote: null,
      },
    });

    const companions = validateImportRow(
      {
        Guest: "Ahmed",
        Contact: "Ahmed",
        Phone: "5001 2345",
        Country: "KW",
        Type: "person + companions",
        Companions: "2",
      },
      mapping,
    );
    expect(companions.normalized).toMatchObject({
      phoneE164: "+96550012345",
      invitationType: "PRIMARY_WITH_COMPANIONS",
      maxCompanions: 2,
    });
  });

  it("supports international-format phones and named Arabic groups", () => {
    const result = validateImportRow(
      {
        Guest: "عائلة الدوسري",
        Contact: "عبدالله",
        Phone: "+971 50 123 4567",
        Country: "SA",
        Type: "عائلة",
        Members: "عبدالله|منيرة|ريم",
      },
      mapping,
    );
    expect(result.errors).toEqual([]);
    expect(result.normalized).toMatchObject({
      phoneE164: "+971501234567",
      phoneCountry: "AE",
      invitationType: "NAMED_GROUP",
      members: [
        { name: "عبدالله", isPrimary: true },
        { name: "منيرة", isPrimary: false },
        { name: "ريم", isPrimary: false },
      ],
    });
  });

  it("returns stable field-level errors for malformed rows", () => {
    const result = validateImportRow(
      {
        Guest: "",
        Phone: "123",
        Country: "US",
        Type: "broadcast",
        Companions: "2.5",
        Members: "First||Third",
      },
      mapping,
    );
    expect(result.normalized).toBeNull();
    expect(result.errors.map(({ code, field }) => [code, field])).toEqual(
      expect.arrayContaining([
        ["FIELD_REQUIRED", "displayName"],
        ["INVITATION_TYPE_INVALID", "invitationType"],
        ["COMPANION_COUNT_INVALID", "maxCompanions"],
        ["MEMBER_NAME_REQUIRED", "members"],
        ["PHONE_COUNTRY_UNSUPPORTED", "phoneCountry"],
        ["PHONE_INVALID", "phoneNumber"],
      ]),
    );
  });

  it("rejects an empty named group and non-plain cell objects", () => {
    const emptyFamily = validateImportRow(
      {
        Guest: "Family",
        Phone: "0501234567",
        Type: "NAMED_GROUP",
      },
      mapping,
    );
    expect(emptyFamily.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "INVITATION_MEMBER_COUNT_INVALID" }),
      ]),
    );

    const formula = validateImportRow(
      {
        Guest: { formula: 'HYPERLINK("file:///etc/passwd")' },
        Phone: "0501234567",
      },
      mapping,
    );
    expect(formula.errors).toContainEqual(
      expect.objectContaining({
        code: "MALFORMED_CELL_VALUE",
        field: "displayName",
      }),
    );
  });

  it("projects source rows without inventing unmapped values", () => {
    expect(
      applyImportColumnMapping(
        { Guest: "Sarah", Phone: "0501234567", Ignored: "private" },
        mapping,
      ),
    ).toEqual({
      displayName: "Sarah",
      phoneNumber: "0501234567",
    });
  });
});
