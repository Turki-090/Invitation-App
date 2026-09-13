import { ALL_PERMISSIONS, EventStatus } from "@dawah/domain";
import { z } from "zod";

export const EVENT_TYPES = [
  "WEDDING",
  "ENGAGEMENT",
  "RECEPTION",
  "GRADUATION",
  "PRIVATE_EVENT",
  "OTHER",
] as const;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Use a valid calendar date.");
const localTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm.");
const optionalText = (maximum: number) =>
  z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().trim().min(2).max(maximum).optional(),
  );
const optionalDate = z.preprocess(
  (value) => (value === "" ? undefined : value),
  isoDate.optional(),
);
const optionalTime = z.preprocess(
  (value) => (value === "" ? undefined : value),
  localTime.optional(),
);

function isIanaTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function isSafeMapUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      (hostname === "google.com" ||
        hostname.endsWith(".google.com") ||
        hostname === "goo.gl" ||
        hostname.endsWith(".goo.gl") ||
        hostname === "maps.apple.com")
    );
  } catch {
    return false;
  }
}

const timeZone = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine(isIanaTimeZone, "Use a valid IANA time zone.");
const mapUrl = z
  .string()
  .trim()
  .url()
  .max(2_048)
  .refine(isSafeMapUrl, "Use an HTTPS Google Maps or Apple Maps link.");
const optionalMapUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  mapUrl.optional(),
);
const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);

const eventInputFields = {
  nameAr: z.string().trim().min(2).max(120),
  nameEn: optionalText(120),
  eventType: z.enum(EVENT_TYPES),
  eventDate: isoDate,
  startTime: localTime,
  endTime: optionalTime,
  timezone: timeZone.default("Asia/Riyadh"),
  venueNameAr: z.string().trim().min(2).max(160),
  venueNameEn: optionalText(160),
  city: z.string().trim().min(2).max(80),
  latitude: latitude.optional(),
  longitude: longitude.optional(),
  mapUrl: optionalMapUrl,
  rsvpDeadline: optionalDate,
  allowRsvpEdits: z.boolean().default(true),
  qrEnabled: z.boolean().default(false),
};

function validateEventRelationships(
  event: {
    eventDate?: string;
    startTime?: string;
    endTime?: string | null;
    rsvpDeadline?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  },
  context: z.RefinementCtx,
): void {
  if (event.startTime && event.endTime && event.endTime <= event.startTime) {
    context.addIssue({
      code: "custom",
      message: "End time must be later than start time.",
      path: ["endTime"],
    });
  }
  if (
    event.eventDate &&
    event.rsvpDeadline &&
    event.rsvpDeadline > event.eventDate
  ) {
    context.addIssue({
      code: "custom",
      message: "The RSVP deadline cannot be after the event date.",
      path: ["rsvpDeadline"],
    });
  }
  const hasLatitude = event.latitude !== undefined && event.latitude !== null;
  const hasLongitude =
    event.longitude !== undefined && event.longitude !== null;
  if (hasLatitude !== hasLongitude) {
    context.addIssue({
      code: "custom",
      message: "Latitude and longitude must be provided together.",
      path: [hasLatitude ? "longitude" : "latitude"],
    });
  }
}

export const createEventSchema = z
  .object(eventInputFields)
  .superRefine(validateEventRelationships);

export type CreateEventInput = z.infer<typeof createEventSchema>;

export const updateEventSchema = z
  .object({
    nameAr: eventInputFields.nameAr.optional(),
    nameEn: z.union([z.string().trim().min(2).max(120), z.null()]).optional(),
    eventType: eventInputFields.eventType.optional(),
    eventDate: eventInputFields.eventDate.optional(),
    startTime: eventInputFields.startTime.optional(),
    endTime: z.union([localTime, z.null()]).optional(),
    timezone: timeZone.optional(),
    venueNameAr: eventInputFields.venueNameAr.optional(),
    venueNameEn: z
      .union([z.string().trim().min(2).max(160), z.null()])
      .optional(),
    city: eventInputFields.city.optional(),
    latitude: z.union([latitude, z.null()]).optional(),
    longitude: z.union([longitude, z.null()]).optional(),
    mapUrl: z.union([mapUrl, z.null()]).optional(),
    rsvpDeadline: z.union([isoDate, z.null()]).optional(),
    allowRsvpEdits: z.boolean().optional(),
    qrEnabled: z.boolean().optional(),
  })
  .refine((event) => Object.keys(event).length > 0, {
    message: "Provide at least one event field to update.",
  });

export type UpdateEventInput = z.infer<typeof updateEventSchema>;

const eventStatusSchema = z.enum([
  EventStatus.DRAFT,
  EventStatus.ACTIVE,
  EventStatus.RSVP_OPEN,
  EventStatus.RSVP_CLOSED,
  EventStatus.EVENT_DAY,
  EventStatus.COMPLETED,
  EventStatus.ARCHIVED,
]);

const membershipRoleSchema = z.enum(["OWNER", "CO_HOST", "CHECK_IN_STAFF"]);
const eventPermissionSchema = z.enum(ALL_PERMISSIONS);

export const eventSummarySchema = z.object({
  id: z.uuid(),
  nameAr: z.string(),
  nameEn: z.string().nullable(),
  eventType: z.enum(EVENT_TYPES),
  eventDate: isoDate,
  timezone: z.string(),
  venueNameAr: z.string(),
  venueNameEn: z.string().nullable(),
  city: z.string(),
  status: eventStatusSchema,
  role: membershipRoleSchema,
  effectivePermissions: z.array(eventPermissionSchema),
  canViewGuests: z.boolean(),
  canManageGuests: z.boolean(),
  canPrepareInvitations: z.boolean(),
  canSendInvitations: z.boolean(),
  canSendReminders: z.boolean(),
  canManageTeam: z.boolean(),
  canEditEvent: z.boolean(),
  canArchiveEvent: z.boolean(),
});

export type EventSummary = z.infer<typeof eventSummarySchema>;

export const eventDetailSchema = eventSummarySchema.extend({
  startTime: localTime,
  endTime: localTime.nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  mapUrl: z.string().nullable(),
  rsvpDeadline: isoDate.nullable(),
  allowRsvpEdits: z.boolean(),
  qrEnabled: z.boolean(),
  availableTransitions: z.array(eventStatusSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().nullable(),
});

export type EventDetail = z.infer<typeof eventDetailSchema>;

export const transitionEventStatusSchema = z.object({
  status: eventStatusSchema.exclude([EventStatus.ARCHIVED]),
});

export type TransitionEventStatusInput = z.infer<
  typeof transitionEventStatusSchema
>;

export const eventDashboardSummarySchema = z.object({
  eventId: z.uuid(),
  invitationGroups: z.number().int().nonnegative(),
  namedGuests: z.number().int().nonnegative(),
  expectedAttendees: z.number().int().nonnegative(),
  rsvp: z.object({
    acceptedGroups: z.number().int().nonnegative(),
    partialGroups: z.number().int().nonnegative(),
    declinedGroups: z.number().int().nonnegative(),
    pendingGroups: z.number().int().nonnegative(),
  }),
});

export type EventDashboardSummary = z.infer<typeof eventDashboardSummarySchema>;
