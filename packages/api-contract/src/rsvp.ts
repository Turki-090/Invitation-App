import { InvitationType, RsvpStatus } from "@dawah/domain";
import { z } from "zod";
import { EVENT_TYPES } from "./events";
import { preparationLocaleSchema } from "./preparation";

const rsvpInvitationTypeSchema = z.enum([
  InvitationType.SINGLE,
  InvitationType.NAMED_GROUP,
  InvitationType.PRIMARY_WITH_COMPANIONS,
]);
const rsvpStatusSchema = z.enum([
  RsvpStatus.PENDING,
  RsvpStatus.ACCEPTED,
  RsvpStatus.PARTIALLY_ACCEPTED,
  RsvpStatus.DECLINED,
]);

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Use a valid calendar date.");
const localTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm.");
const timestampSchema = z.iso.datetime({ offset: true });
const nonnegativeAttendanceSchema = z.number().int().min(0).max(200);
const canonicalUuidSchema = z.uuid().transform((value) => value.toLowerCase());

const attendingMemberIdsSchema = z
  .array(canonicalUuidSchema)
  .max(100)
  .refine((memberIds) => new Set(memberIds).size === memberIds.length, {
    message: "An attending member can be selected only once.",
  });

export const publicInvitationLocaleQuerySchema = z
  .object({
    locale: preparationLocaleSchema.default("ar-SA"),
  })
  .strict();

export type PublicInvitationLocaleQuery = z.infer<
  typeof publicInvitationLocaleQuerySchema
>;

export const submitRsvpSchema = z
  .object({
    submissionId: canonicalUuidSchema,
    attendingMemberIds: attendingMemberIdsSchema,
    companionCount: z.number().int().min(0).max(100),
  })
  .strict();

export type SubmitRsvpInput = z.infer<typeof submitRsvpSchema>;

export const publicInvitationMemberSchema = z
  .object({
    id: z.uuid(),
    name: z.string().min(1).max(120),
    isPrimary: z.boolean(),
    position: z.number().int().positive(),
  })
  .strict();

export const publicRsvpStateSchema = z
  .object({
    status: rsvpStatusSchema,
    attendingMemberIds: attendingMemberIdsSchema,
    companionCount: z.number().int().min(0).max(100),
    expectedAttendees: nonnegativeAttendanceSchema,
    respondedAt: timestampSchema,
    updatedAt: timestampSchema,
    isEdited: z.boolean(),
  })
  .strict();

const guestRsvpLifecycleStateSchema = z.enum(["OPEN", "CLOSED", "COMPLETED"]);

const guestRsvpPolicyReasonSchema = z.enum([
  "INITIAL_RESPONSE_AVAILABLE",
  "EDITS_AVAILABLE",
  "EDITS_DISABLED",
  "RSVP_NOT_OPEN",
  "RSVP_CLOSED",
  "DEADLINE_PASSED",
  "EVENT_STARTED",
  "EVENT_COMPLETED",
  "EVENT_ARCHIVED",
]);

export const publicInvitationSchema = z
  .object({
    locale: preparationLocaleSchema,
    event: z
      .object({
        name: z.string().min(1).max(120),
        eventType: z.enum(EVENT_TYPES),
        eventDate: isoDateSchema,
        startTime: localTimeSchema,
        endTime: localTimeSchema.nullable(),
        timezone: z.string().min(1).max(80),
        venueName: z.string().min(1).max(160),
        city: z.string().min(1).max(80),
        mapUrl: z.url().nullable(),
        rsvpDeadline: isoDateSchema.nullable(),
      })
      .strict(),
    invitation: z
      .object({
        displayName: z.string().min(1).max(160),
        invitationType: rsvpInvitationTypeSchema,
        maxCompanions: z.number().int().min(0).max(100),
        members: z.array(publicInvitationMemberSchema).min(1).max(100),
      })
      .strict(),
    currentRsvp: publicRsvpStateSchema.nullable(),
    policy: z
      .object({
        lifecycleState: guestRsvpLifecycleStateSchema,
        canRespond: z.boolean(),
        canEdit: z.boolean(),
        reason: guestRsvpPolicyReasonSchema,
      })
      .strict(),
  })
  .strict();

export type PublicInvitation = z.infer<typeof publicInvitationSchema>;

export const rsvpResultSchema = z
  .object({
    submissionId: z.uuid(),
    status: rsvpStatusSchema,
    attendingMemberIds: attendingMemberIdsSchema,
    companionCount: z.number().int().min(0).max(100),
    expectedAttendees: nonnegativeAttendanceSchema,
    respondedAt: timestampSchema,
    isEdited: z.boolean(),
    changed: z.boolean(),
    confirmationQueued: z.boolean(),
  })
  .strict();

export type RsvpResult = z.infer<typeof rsvpResultSchema>;

const rsvpSourceSchema = z.enum([
  "WHATSAPP",
  "GUEST_WEB",
  "HOST_MANUAL",
  "SYSTEM",
]);

const historicalRsvpResponseSchema = z
  .object({
    status: rsvpStatusSchema,
    attendingMemberIds: attendingMemberIdsSchema,
    companionCount: z.number().int().min(0).max(100),
    expectedAttendees: nonnegativeAttendanceSchema,
  })
  .strict();

const rsvpHistoryEntrySchema = z
  .object({
    id: z.uuid(),
    previousStatus: rsvpStatusSchema,
    newStatus: rsvpStatusSchema,
    previousCount: nonnegativeAttendanceSchema,
    newCount: nonnegativeAttendanceSchema,
    previousResponse: historicalRsvpResponseSchema,
    newResponse: historicalRsvpResponseSchema,
    source: rsvpSourceSchema,
    actorReference: z.string().min(1).max(255).nullable(),
    createdAt: timestampSchema,
  })
  .strict();

export const hostRsvpDetailSchema = z
  .object({
    eventId: z.uuid(),
    invitationId: z.uuid(),
    displayName: z.string().min(1).max(160),
    invitationType: rsvpInvitationTypeSchema,
    maxCompanions: z.number().int().min(0).max(100),
    members: z.array(publicInvitationMemberSchema).min(1).max(100),
    currentRsvp: publicRsvpStateSchema
      .extend({
        source: rsvpSourceSchema,
      })
      .strict()
      .nullable(),
    history: z.array(rsvpHistoryEntrySchema).max(1_000),
  })
  .strict();

export type HostRsvpDetail = z.infer<typeof hostRsvpDetailSchema>;

export const issuePublicInvitationCapabilitySchema = z
  .object({
    expiresAt: timestampSchema.optional(),
  })
  .strict();

export type IssuePublicInvitationCapabilityInput = z.infer<
  typeof issuePublicInvitationCapabilitySchema
>;

export const publicInvitationCapabilityStatusSchema = z
  .object({
    active: z.boolean(),
    createdAt: timestampSchema.nullable(),
    expiresAt: timestampSchema.nullable(),
    revokedAt: timestampSchema.nullable(),
  })
  .strict();

export type PublicInvitationCapabilityStatus = z.infer<
  typeof publicInvitationCapabilityStatusSchema
>;

export const issuedPublicInvitationCapabilitySchema = z
  .object({
    active: z.literal(true),
    token: z
      .string()
      .min(43)
      .max(256)
      .regex(/^[A-Za-z0-9_-]+$/),
    createdAt: timestampSchema,
    expiresAt: timestampSchema.nullable(),
    revokedAt: z.null(),
  })
  .strict();

export type IssuedPublicInvitationCapability = z.infer<
  typeof issuedPublicInvitationCapabilitySchema
>;
