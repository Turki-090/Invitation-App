import { z } from "zod";

export const CHECK_IN_SOURCES = ["QR", "MANUAL"] as const;
export const CHECK_IN_PARTY_STATUSES = [
  "NOT_ARRIVED",
  "PARTIALLY_CHECKED_IN",
  "CHECKED_IN",
] as const;
export const CHECK_IN_OUTCOMES = [
  "PARTIALLY_CHECKED_IN",
  "CHECKED_IN",
  "ALREADY_CHECKED_IN",
] as const;

const timestampSchema = z.iso.datetime({ offset: true });
/** One party's attendance, bounded by the largest invitation a host can create. */
const attendanceSchema = z.number().int().min(0).max(200);
/** Event-wide attendance totals, which are the sum of every party. */
const eventAttendanceSchema = z.number().int().min(0);
const positiveAttendanceSchema = z.number().int().min(1).max(200);
const canonicalUuidSchema = z.uuid().transform((value) => value.toLowerCase());
const optionalDeviceIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[\x20-\x7E]+$/, "Device IDs must use visible ASCII characters.")
  .optional();

export const entryPassTokenSchema = z
  .string()
  .regex(/^ep1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/);

export const checkInIdempotencyKeySchema = z
  .string()
  .min(8)
  .max(200)
  .regex(/^[!-~]+$/, "Use visible ASCII characters without spaces.");

export const publicEntryPassSchema = z
  .object({
    token: entryPassTokenSchema,
    qrPayload: entryPassTokenSchema,
    issuedAt: timestampSchema,
    expiresAt: timestampSchema.nullable(),
  })
  .strict()
  .refine((value) => value.token === value.qrPayload, {
    message: "The QR payload must be the issued opaque pass token.",
    path: ["qrPayload"],
  });
export type PublicEntryPass = z.infer<typeof publicEntryPassSchema>;

export const resolveEntryPassSchema = z
  .object({ token: entryPassTokenSchema })
  .strict();
export type ResolveEntryPassInput = z.infer<typeof resolveEntryPassSchema>;

export const checkInPartySchema = z
  .object({
    invitationGroupId: canonicalUuidSchema,
    displayName: z.string().min(1).max(160),
    phoneDisplay: z.string().min(1).max(40).nullable(),
    phoneMasked: z.boolean(),
    confirmedAttendance: positiveAttendanceSchema,
    checkedInAttendance: attendanceSchema,
    remainingAttendance: attendanceSchema,
    status: z.enum(CHECK_IN_PARTY_STATUSES),
    firstCheckedInAt: timestampSchema.nullable(),
    lastCheckedInAt: timestampSchema.nullable(),
    lastCheckedInBy: z.string().min(1).max(160).nullable(),
    lastDeviceId: z.string().min(1).max(128).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.remainingAttendance !==
      Math.max(value.confirmedAttendance - value.checkedInAttendance, 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "Checked-in and remaining attendance must reconcile.",
        path: ["remainingAttendance"],
      });
    }
    const expectedStatus =
      value.checkedInAttendance === 0
        ? "NOT_ARRIVED"
        : value.checkedInAttendance >= value.confirmedAttendance
          ? "CHECKED_IN"
          : "PARTIALLY_CHECKED_IN";
    if (value.status !== expectedStatus) {
      context.addIssue({
        code: "custom",
        message: "The party status must match its attendance counts.",
        path: ["status"],
      });
    }
  });
export type CheckInParty = z.infer<typeof checkInPartySchema>;

export const resolvedEntryPassSchema = checkInPartySchema.extend({
  resolvedAt: timestampSchema,
});
export type ResolvedEntryPass = z.infer<typeof resolvedEntryPassSchema>;

export const searchCheckInPartiesQuerySchema = z
  .object({
    query: z.string().trim().min(2).max(120),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export type SearchCheckInPartiesQuery = z.infer<
  typeof searchCheckInPartiesQuerySchema
>;

export const searchCheckInPartiesResponseSchema = z
  .object({
    items: z.array(checkInPartySchema).max(50),
  })
  .strict();
export type SearchCheckInPartiesResponse = z.infer<
  typeof searchCheckInPartiesResponseSchema
>;

export const createCheckInSchema = z
  .object({
    invitationGroupId: canonicalUuidSchema,
    attendeeCount: positiveAttendanceSchema,
    source: z.enum(CHECK_IN_SOURCES),
    deviceId: optionalDeviceIdSchema,
  })
  .strict();
export type CreateCheckInInput = z.infer<typeof createCheckInSchema>;

export const checkInResultSchema = z
  .object({
    outcome: z.enum(CHECK_IN_OUTCOMES),
    invitationGroupId: canonicalUuidSchema,
    displayName: z.string().min(1).max(160),
    confirmedAttendance: positiveAttendanceSchema,
    previousCheckedInAttendance: attendanceSchema,
    checkedInAttendance: attendanceSchema,
    remainingAttendance: attendanceSchema,
    incrementedBy: attendanceSchema,
    checkedInAt: timestampSchema.nullable(),
    checkedInBy: z.string().min(1).max(160).nullable(),
    deviceId: z.string().min(1).max(128).nullable(),
    recordId: canonicalUuidSchema.nullable(),
    idempotentReplay: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.remainingAttendance !==
      Math.max(value.confirmedAttendance - value.checkedInAttendance, 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "The check-in result counts must reconcile.",
        path: ["remainingAttendance"],
      });
    }
    if (
      value.outcome === "ALREADY_CHECKED_IN" &&
      (value.incrementedBy !== 0 || value.recordId !== null)
    ) {
      context.addIssue({
        code: "custom",
        message: "A duplicate scan cannot create an attendance increment.",
        path: ["incrementedBy"],
      });
    }
  });
export type CheckInResult = z.infer<typeof checkInResultSchema>;

export const recentCheckInSchema = z
  .object({
    recordId: canonicalUuidSchema,
    invitationGroupId: canonicalUuidSchema,
    displayName: z.string().min(1).max(160),
    attendeeCount: positiveAttendanceSchema,
    checkedInAttendance: positiveAttendanceSchema,
    confirmedAttendance: positiveAttendanceSchema,
    source: z.enum(CHECK_IN_SOURCES),
    checkedInAt: timestampSchema,
    checkedInBy: z.string().min(1).max(160).nullable(),
    deviceId: z.string().min(1).max(128).nullable(),
  })
  .strict();
export type RecentCheckIn = z.infer<typeof recentCheckInSchema>;

export const checkInDashboardSchema = z
  .object({
    eventId: canonicalUuidSchema,
    expectedAttendance: eventAttendanceSchema,
    checkedInAttendance: eventAttendanceSchema,
    remainingAttendance: eventAttendanceSchema,
    checkInPercentage: z.number().int().min(0).max(100),
    invitationGroups: z.number().int().nonnegative(),
    fullyCheckedInGroups: z.number().int().nonnegative(),
    partiallyCheckedInGroups: z.number().int().nonnegative(),
    notArrivedGroups: z.number().int().nonnegative(),
    duplicateAttempts: z.number().int().nonnegative(),
    recentArrivals: z.array(recentCheckInSchema).max(50),
    calculatedAt: timestampSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.remainingAttendance !==
      Math.max(value.expectedAttendance - value.checkedInAttendance, 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "Dashboard attendance totals must reconcile.",
        path: ["remainingAttendance"],
      });
    }
    if (
      value.fullyCheckedInGroups +
        value.partiallyCheckedInGroups +
        value.notArrivedGroups !==
      value.invitationGroups
    ) {
      context.addIssue({
        code: "custom",
        message: "Dashboard invitation-group totals must reconcile.",
        path: ["invitationGroups"],
      });
    }
  });
export type CheckInDashboard = z.infer<typeof checkInDashboardSchema>;
