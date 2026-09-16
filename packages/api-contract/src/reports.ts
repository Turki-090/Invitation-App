import { z } from "zod";

const countSchema = z.number().int().nonnegative();

export const reportMessageStatusCountsSchema = z.object({
  queued: countSchema,
  sending: countSchema,
  sent: countSchema,
  delivered: countSchema,
  read: countSchema,
  responded: countSchema,
  failed: countSchema,
  cancelled: countSchema,
});

export const eventReportSchema = z.object({
  eventId: z.uuid(),
  generatedAt: z.string(),
  invitationGroups: z.object({
    active: countSchema,
    cancelled: countSchema,
    withInitialInvitation: countSchema,
    withoutInitialInvitation: countSchema,
  }),
  namedGuests: countSchema,
  expectedAttendance: countSchema,
  rsvp: z.object({
    acceptedGroups: countSchema,
    partiallyAcceptedGroups: countSchema,
    declinedGroups: countSchema,
    pendingGroups: countSchema,
  }),
  invitationTypes: z.object({
    singleGroups: countSchema,
    namedGroupGroups: countSchema,
    primaryWithCompanionsGroups: countSchema,
  }),
  delivery: z.object({
    latestInvitationMessages: countSchema,
    notSentGroups: countSchema,
    byStatus: reportMessageStatusCountsSchema,
  }),
  checkIn: z.object({
    checkedInGroups: countSchema,
    checkedInAttendees: countSchema,
    notArrivedAttendees: countSchema,
    noShowAttendees: countSchema.nullable(),
  }),
});

export type EventReport = z.infer<typeof eventReportSchema>;
