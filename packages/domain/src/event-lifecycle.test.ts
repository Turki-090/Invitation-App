import { describe, expect, it } from "vitest";
import {
  allowedEventStatusTransitions,
  canTransitionEventStatus,
  isEventStatus,
} from "./event-lifecycle";
import { EventStatus } from "./types";

describe("event lifecycle", () => {
  it("uses an explicit forward lifecycle with a deliberate RSVP reopen", () => {
    expect(allowedEventStatusTransitions(EventStatus.DRAFT)).toEqual([
      EventStatus.ACTIVE,
    ]);
    expect(
      canTransitionEventStatus(EventStatus.RSVP_CLOSED, EventStatus.RSVP_OPEN),
    ).toBe(true);
    expect(
      canTransitionEventStatus(EventStatus.COMPLETED, EventStatus.ACTIVE),
    ).toBe(false);
  });

  it("keeps archive and recovery outside ordinary status transitions", () => {
    expect(
      canTransitionEventStatus(EventStatus.ACTIVE, EventStatus.ARCHIVED),
    ).toBe(false);
    expect(allowedEventStatusTransitions(EventStatus.ARCHIVED)).toEqual([]);
  });

  it("recognizes only canonical event statuses", () => {
    expect(isEventStatus(EventStatus.EVENT_DAY)).toBe(true);
    expect(isEventStatus("event-day")).toBe(false);
    expect(isEventStatus(null)).toBe(false);
  });
});
