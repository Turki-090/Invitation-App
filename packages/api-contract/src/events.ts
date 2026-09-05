import { EventStatus } from "@dawah/domain";
import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");
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
const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.url().optional(),
);

export const createEventSchema = z
  .object({
    nameAr: z.string().trim().min(2).max(120),
    nameEn: optionalText(120),
    eventType: z.string().trim().min(2).max(40),
    eventDate: isoDate,
    startTime: localTime,
    endTime: optionalTime,
    timezone: z.string().trim().min(1).default("Asia/Riyadh"),
    venueNameAr: z.string().trim().min(2).max(160),
    venueNameEn: optionalText(160),
    city: z.string().trim().min(2).max(80),
    mapUrl: optionalUrl,
    rsvpDeadline: optionalDate,
    allowRsvpEdits: z.boolean().default(true),
  })
  .refine((event) => !event.endTime || event.endTime > event.startTime, {
    message: "End time must be later than start time.",
    path: ["endTime"],
  })
  .refine(
    (event) => !event.rsvpDeadline || event.rsvpDeadline <= event.eventDate,
    {
      message: "The RSVP deadline cannot be after the event date.",
      path: ["rsvpDeadline"],
    },
  );

export type CreateEventInput = z.infer<typeof createEventSchema>;

export const eventSummarySchema = z.object({
  id: z.uuid(),
  nameAr: z.string(),
  nameEn: z.string().nullable(),
  eventType: z.string(),
  eventDate: isoDate,
  timezone: z.string(),
  venueNameAr: z.string(),
  city: z.string(),
  status: z.enum([
    EventStatus.DRAFT,
    EventStatus.ACTIVE,
    EventStatus.RSVP_OPEN,
    EventStatus.RSVP_CLOSED,
    EventStatus.EVENT_DAY,
    EventStatus.COMPLETED,
    EventStatus.ARCHIVED,
  ]),
  role: z.enum(["OWNER", "CO_HOST", "CHECK_IN_STAFF"]),
});

export type EventSummary = z.infer<typeof eventSummarySchema>;
