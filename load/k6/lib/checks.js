// Invariant helpers. A load run is only useful if it also proves that the
// answers stay correct under load, so each helper returns the list of broken
// invariants rather than a single boolean.

/**
 * Check-in result invariants taken directly from `checkInResultSchema` in
 * `packages/api-contract/src/check-ins.ts`. The first rule is the one the
 * concurrency scenario exists to defend: recorded attendance may never exceed
 * the confirmed attendance of the invitation group.
 */
export function checkInResultViolations(result) {
  const problems = [];
  if (!result || typeof result !== "object")
    return ["response body is not an object"];
  const confirmed = result.confirmedAttendance;
  const checkedIn = result.checkedInAttendance;
  const remaining = result.remainingAttendance;
  if (typeof confirmed !== "number" || typeof checkedIn !== "number") {
    return ["attendance fields are missing"];
  }
  if (checkedIn > confirmed) {
    problems.push(
      `checkedInAttendance ${checkedIn} exceeds confirmedAttendance ${confirmed}`,
    );
  }
  if (checkedIn < 0 || remaining < 0) {
    problems.push("attendance counts went negative");
  }
  if (checkedIn + remaining !== confirmed) {
    problems.push(
      `attendance does not reconcile: ${checkedIn} + ${remaining} !== ${confirmed}`,
    );
  }
  if (result.previousCheckedInAttendance > checkedIn) {
    problems.push("attendance moved backwards");
  }
  if (result.outcome === "ALREADY_CHECKED_IN" && result.incrementedBy !== 0) {
    problems.push("a duplicate scan recorded an increment");
  }
  if (result.outcome === "ALREADY_CHECKED_IN" && result.recordId !== null) {
    problems.push("a duplicate scan created a check-in record");
  }
  return problems;
}

/** Dashboard totals must reconcile the same way the contract schema demands. */
export function dashboardViolations(body) {
  const problems = [];
  if (!body || typeof body !== "object")
    return ["response body is not an object"];
  if (
    body.checkedInAttendance + body.remainingAttendance !==
    body.expectedAttendance
  ) {
    problems.push("attendance totals do not reconcile");
  }
  const groups =
    body.fullyCheckedInGroups +
    body.partiallyCheckedInGroups +
    body.notArrivedGroups;
  if (groups !== body.invitationGroups) {
    problems.push("invitation-group totals do not reconcile");
  }
  if (body.checkedInAttendance > body.expectedAttendance) {
    problems.push("checked-in attendance exceeds expected attendance");
  }
  return problems;
}

/** Report totals that must hold whatever the row count is. */
export function reportViolations(body) {
  const problems = [];
  if (!body || typeof body !== "object")
    return ["response body is not an object"];
  const groups = body.invitationGroups;
  const rsvp = body.rsvp;
  if (!groups || !rsvp || !body.checkIn || !body.delivery) {
    return ["report sections are missing"];
  }
  const rsvpTotal =
    rsvp.acceptedGroups +
    rsvp.partiallyAcceptedGroups +
    rsvp.declinedGroups +
    rsvp.pendingGroups;
  if (rsvpTotal !== groups.active) {
    problems.push(
      `RSVP buckets ${rsvpTotal} do not sum to ${groups.active} active groups`,
    );
  }
  const types = body.invitationTypes;
  const typeTotal =
    types.singleGroups +
    types.namedGroupGroups +
    types.primaryWithCompanionsGroups;
  if (typeTotal !== groups.active) {
    problems.push(
      `invitation types ${typeTotal} do not sum to ${groups.active} active groups`,
    );
  }
  if (
    groups.withInitialInvitation + groups.withoutInitialInvitation !==
    groups.active
  ) {
    problems.push("initial-invitation split does not sum to the active groups");
  }
  if (body.checkIn.checkedInAttendees > body.expectedAttendance) {
    problems.push("checked-in attendees exceed expected attendance");
  }
  return problems;
}

/** Formats violations for a k6 check label without losing the detail. */
export function firstViolation(problems) {
  return problems.length === 0 ? "" : problems[0];
}
