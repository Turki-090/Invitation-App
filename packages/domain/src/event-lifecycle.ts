import { EventStatus, type EventStatus as EventStatusValue } from "./types";

const transitions: Readonly<
  Record<EventStatusValue, readonly EventStatusValue[]>
> = {
  [EventStatus.DRAFT]: [EventStatus.ACTIVE],
  [EventStatus.ACTIVE]: [
    EventStatus.RSVP_OPEN,
    EventStatus.EVENT_DAY,
    EventStatus.COMPLETED,
  ],
  [EventStatus.RSVP_OPEN]: [
    EventStatus.RSVP_CLOSED,
    EventStatus.EVENT_DAY,
    EventStatus.COMPLETED,
  ],
  [EventStatus.RSVP_CLOSED]: [
    EventStatus.RSVP_OPEN,
    EventStatus.EVENT_DAY,
    EventStatus.COMPLETED,
  ],
  [EventStatus.EVENT_DAY]: [EventStatus.COMPLETED],
  [EventStatus.COMPLETED]: [],
  [EventStatus.ARCHIVED]: [],
};

/**
 * Returns ordinary lifecycle transitions. Archival and recovery deliberately use
 * their own audited operations and therefore never appear in this list.
 */
export function allowedEventStatusTransitions(
  status: EventStatusValue,
): readonly EventStatusValue[] {
  return transitions[status];
}

export function canTransitionEventStatus(
  from: EventStatusValue,
  to: EventStatusValue,
): boolean {
  return transitions[from].includes(to);
}

export function isEventStatus(value: unknown): value is EventStatusValue {
  return (
    typeof value === "string" &&
    Object.values(EventStatus).includes(value as EventStatusValue)
  );
}
