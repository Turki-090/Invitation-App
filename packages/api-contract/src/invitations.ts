import {
  GCC_PHONE_COUNTRIES,
  InvitationInvariantError,
  InvitationType,
  normalizePhoneNumber,
  RsvpStatus,
  validateInvitationAggregate,
} from "@dawah/domain";
import { z } from "zod";

export const INVITATION_CANCELLATION_FILTERS = [
  "ACTIVE",
  "CANCELLED",
  "ALL",
] as const;
export const INVITATION_SORT_FIELDS = [
  "DISPLAY_NAME",
  "CREATED_AT",
  "UPDATED_AT",
  "EXPECTED_ATTENDEES",
] as const;
export const SORT_ORDERS = ["ASC", "DESC"] as const;

export const invitationTypeSchema = z.enum([
  InvitationType.SINGLE,
  InvitationType.NAMED_GROUP,
  InvitationType.PRIMARY_WITH_COMPANIONS,
]);
export const invitationRsvpStatusSchema = z.enum([
  RsvpStatus.PENDING,
  RsvpStatus.ACCEPTED,
  RsvpStatus.PARTIALLY_ACCEPTED,
  RsvpStatus.DECLINED,
]);
export const gccPhoneCountrySchema = z.enum(GCC_PHONE_COUNTRIES);

export const invitationMemberInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  isPrimary: z.boolean(),
});

export type InvitationMemberInput = z.infer<typeof invitationMemberInputSchema>;

const displayNameSchema = z.string().trim().min(1).max(160);
const contactNameSchema = z.string().trim().min(1).max(120);
const phoneNumberSchema = z.string().trim().min(3).max(40);
const internalNoteSchema = z.string().trim().max(1_000);
const memberInputsSchema = z.array(invitationMemberInputSchema).min(1).max(100);
const maxCompanionsSchema = z.number().int().min(0).max(100);

function addPhoneIssue(
  value: {
    phoneNumber: string;
    phoneCountry: z.infer<typeof gccPhoneCountrySchema>;
  },
  context: z.RefinementCtx,
): void {
  try {
    normalizePhoneNumber(value.phoneNumber, value.phoneCountry);
  } catch (error) {
    context.addIssue({
      code: "custom",
      message:
        error instanceof Error ? error.message : "The phone number is invalid.",
      path: ["phoneNumber"],
    });
  }
}

function addInvitationStructureIssue(
  value: {
    invitationType: z.infer<typeof invitationTypeSchema>;
    members: readonly InvitationMemberInput[];
    maxCompanions: number;
  },
  context: z.RefinementCtx,
): void {
  try {
    validateInvitationAggregate(value);
  } catch (error) {
    context.addIssue({
      code: "custom",
      message:
        error instanceof InvitationInvariantError
          ? error.message
          : "The invitation structure is invalid.",
      path: ["members"],
    });
  }
}

export const createInvitationSchema = z
  .object({
    displayName: displayNameSchema,
    contactName: contactNameSchema,
    phoneNumber: phoneNumberSchema,
    phoneCountry: gccPhoneCountrySchema,
    invitationType: invitationTypeSchema,
    maxCompanions: maxCompanionsSchema,
    internalNote: internalNoteSchema.optional(),
    members: memberInputsSchema,
    duplicateOverride: z.boolean(),
  })
  .superRefine((value, context) => {
    addPhoneIssue(value, context);
    addInvitationStructureIssue(value, context);
  });

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

export const updateInvitationSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    contactName: contactNameSchema.optional(),
    phoneNumber: phoneNumberSchema.optional(),
    phoneCountry: gccPhoneCountrySchema.optional(),
    invitationType: invitationTypeSchema.optional(),
    maxCompanions: maxCompanionsSchema.optional(),
    internalNote: z.union([internalNoteSchema, z.null()]).optional(),
    members: memberInputsSchema.optional(),
    duplicateOverride: z.boolean(),
  })
  .superRefine((value, context) => {
    const mutableFields = Object.keys(value).filter(
      (field) => field !== "duplicateOverride",
    );
    if (mutableFields.length === 0) {
      context.addIssue({
        code: "custom",
        message: "Provide at least one invitation field to update.",
      });
    }

    if (
      (value.phoneNumber === undefined) !==
      (value.phoneCountry === undefined)
    ) {
      context.addIssue({
        code: "custom",
        message: "Phone number and country must be updated together.",
        path: [
          value.phoneNumber === undefined ? "phoneNumber" : "phoneCountry",
        ],
      });
    } else if (value.phoneNumber && value.phoneCountry) {
      addPhoneIssue(
        { phoneNumber: value.phoneNumber, phoneCountry: value.phoneCountry },
        context,
      );
    }

    if (value.members) {
      const primaryCount = value.members.filter(
        (member) => member.isPrimary,
      ).length;
      if (primaryCount > 1) {
        context.addIssue({
          code: "custom",
          message: "An invitation cannot contain more than one primary member.",
          path: ["members"],
        });
      }
    }

    if (
      value.invitationType !== undefined &&
      value.members !== undefined &&
      value.maxCompanions !== undefined
    ) {
      addInvitationStructureIssue(
        {
          invitationType: value.invitationType,
          members: value.members,
          maxCompanions: value.maxCompanions,
        },
        context,
      );
    }
  });

export type UpdateInvitationInput = z.infer<typeof updateInvitationSchema>;

export const listInvitationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().trim().min(1).max(120).optional(),
  ),
  invitationType: invitationTypeSchema.optional(),
  rsvpStatus: invitationRsvpStatusSchema.optional(),
  cancellationStatus: z.enum(INVITATION_CANCELLATION_FILTERS).default("ACTIVE"),
  sortBy: z.enum(INVITATION_SORT_FIELDS).default("CREATED_AT"),
  sortOrder: z.enum(SORT_ORDERS).default("DESC"),
});

export type ListInvitationsQuery = z.infer<typeof listInvitationsQuerySchema>;

const e164PhoneSchema = z.string().regex(/^\+[1-9]\d{7,14}$/);
const countryCodeSchema = z.string().regex(/^[A-Z]{2}$/);

export const invitationPhoneSchema = z.object({
  phoneE164: e164PhoneSchema.nullable(),
  phoneMasked: z.string().min(1),
  phoneCountry: countryCodeSchema,
  phoneIsMasked: z.boolean(),
});

export type InvitationPhone = z.infer<typeof invitationPhoneSchema>;

export const invitationMemberSchema = invitationMemberInputSchema.extend({
  id: z.uuid(),
  position: z.number().int().min(1),
});

export type InvitationMember = z.infer<typeof invitationMemberSchema>;

export const invitationListItemSchema = invitationPhoneSchema.extend({
  id: z.uuid(),
  eventId: z.uuid(),
  displayName: z.string(),
  contactName: z.string(),
  invitationType: invitationTypeSchema,
  maxCompanions: z.number().int().nonnegative(),
  namedGuestCount: z.number().int().positive(),
  maximumAttendees: z.number().int().positive(),
  expectedAttendees: z.number().int().nonnegative(),
  rsvpStatus: invitationRsvpStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  cancelledAt: z.string().nullable(),
});

export type InvitationListItem = z.infer<typeof invitationListItemSchema>;

export const invitationDetailSchema = invitationListItemSchema.extend({
  internalNote: z.string().nullable(),
  members: z.array(invitationMemberSchema).min(1),
});

export type InvitationDetail = z.infer<typeof invitationDetailSchema>;

export const invitationListResponseSchema = z.object({
  items: z.array(invitationListItemSchema),
  totals: z.object({
    invitationGroups: z.number().int().nonnegative(),
    namedGuests: z.number().int().nonnegative(),
    expectedAttendees: z.number().int().nonnegative(),
  }),
  pagination: z.object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(100),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});

export type InvitationListResponse = z.infer<
  typeof invitationListResponseSchema
>;

export const bulkCancelInvitationsSchema = z.object({
  invitationIds: z.array(z.uuid()).min(1).max(100),
});

export type BulkCancelInvitationsInput = z.infer<
  typeof bulkCancelInvitationsSchema
>;

export const bulkCancelInvitationsResultSchema = z.object({
  requestedCount: z.number().int().positive(),
  cancelledCount: z.number().int().nonnegative(),
  alreadyCancelledCount: z.number().int().nonnegative(),
  cancelledIds: z.array(z.uuid()),
  alreadyCancelledIds: z.array(z.uuid()),
});

export type BulkCancelInvitationsResult = z.infer<
  typeof bulkCancelInvitationsResultSchema
>;

export const duplicateInvitationSummarySchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  phoneMasked: z.string().min(1),
});

export const duplicateInvitationConflictDetailsSchema = z.object({
  duplicateCount: z.number().int().positive(),
  duplicates: z.array(duplicateInvitationSummarySchema).min(1),
  overrideRequired: z.literal(true),
});

export type DuplicateInvitationConflictDetails = z.infer<
  typeof duplicateInvitationConflictDetailsSchema
>;

export const duplicateInvitationConflictSchema = z.object({
  error: z.object({
    code: z.literal("DUPLICATE_PHONE_REQUIRES_OVERRIDE"),
    message: z.string(),
    details: duplicateInvitationConflictDetailsSchema,
  }),
});

export type DuplicateInvitationConflict = z.infer<
  typeof duplicateInvitationConflictSchema
>;
