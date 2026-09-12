export const InvitationType = {
  SINGLE: "SINGLE",
  NAMED_GROUP: "NAMED_GROUP",
  PRIMARY_WITH_COMPANIONS: "PRIMARY_WITH_COMPANIONS",
} as const;

export type InvitationType =
  (typeof InvitationType)[keyof typeof InvitationType];

export const RsvpStatus = {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  PARTIALLY_ACCEPTED: "PARTIALLY_ACCEPTED",
  DECLINED: "DECLINED",
} as const;

export type RsvpStatus = (typeof RsvpStatus)[keyof typeof RsvpStatus];

export const RsvpSource = {
  WHATSAPP: "WHATSAPP",
  GUEST_WEB: "GUEST_WEB",
  HOST_MANUAL: "HOST_MANUAL",
  SYSTEM: "SYSTEM",
} as const;

export type RsvpSource = (typeof RsvpSource)[keyof typeof RsvpSource];

export const EventStatus = {
  DRAFT: "DRAFT",
  ACTIVE: "ACTIVE",
  RSVP_OPEN: "RSVP_OPEN",
  RSVP_CLOSED: "RSVP_CLOSED",
  EVENT_DAY: "EVENT_DAY",
  COMPLETED: "COMPLETED",
  ARCHIVED: "ARCHIVED",
} as const;

export type EventStatus = (typeof EventStatus)[keyof typeof EventStatus];

export const MembershipRole = {
  OWNER: "OWNER",
  CO_HOST: "CO_HOST",
  CHECK_IN_STAFF: "CHECK_IN_STAFF",
} as const;

export type MembershipRole =
  (typeof MembershipRole)[keyof typeof MembershipRole];
