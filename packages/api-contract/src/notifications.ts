import { z } from "zod";

export const notificationKindSchema = z.enum([
  "MESSAGE_BATCH_COMPLETED",
  "MESSAGE_BATCH_FAILED",
  "REMINDER_BATCH_COMPLETED",
  "TEAM_MEMBER_JOINED",
  "EXPORT_READY",
  "EXPORT_FAILED",
]);
export type NotificationKind = z.infer<typeof notificationKindSchema>;

export const notificationSchema = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  kind: notificationKindSchema,
  sourceType: z.string(),
  sourceId: z.uuid(),
  data: z.record(z.string(), z.unknown()),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Notification = z.infer<typeof notificationSchema>;

const queryBooleanSchema = z.preprocess((value) => {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}, z.boolean());

export const listNotificationsQuerySchema = z.object({
  eventId: z.uuid().optional(),
  unreadOnly: queryBooleanSchema.default(false),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListNotificationsQuery = z.infer<
  typeof listNotificationsQuerySchema
>;

export const listNotificationsResponseSchema = z.object({
  items: z.array(notificationSchema),
  unreadCount: z.number().int().nonnegative(),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});
export type ListNotificationsResponse = z.infer<
  typeof listNotificationsResponseSchema
>;
