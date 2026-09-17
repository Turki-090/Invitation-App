// Deterministic identities shared by `load/seed/seed-load-fixtures.mjs` and the
// k6 scenarios. Both sides read `load/fixtures.json` so a row the seed writes
// and a row a scenario addresses can never drift apart.
//
// `open()` is an init-context function, so this module must only ever be
// imported at the top level of a scenario file.

const fixtures = JSON.parse(open("../../fixtures.json"));

export const FIXTURES = fixtures;

/** Builds the deterministic UUID the seed assigns to row `index` of a table. */
export function fixtureId(prefix, index) {
  return `${prefix}-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

export function invitationGroupId(index) {
  return fixtureId(fixtures.idPrefixes.invitationGroup, index);
}

/**
 * Band layout of the seeded invitation groups. The seed writes the same three
 * leading bands in the same order, so a scenario can address a row by index
 * without querying the database first.
 *
 * - `checkIn`   groups every check-in scenario contends over
 * - `messaged`  groups that already carry one INVITATION message
 * - `sendable`  groups with a current snapshot and no message yet
 * - everything after `sendable` is the unprepared remainder
 */
export const BANDS = {
  checkIn: { start: 0, count: fixtures.checkInTargets },
  messaged: { start: fixtures.checkInTargets, count: fixtures.messagedGroups },
  sendable: {
    start: fixtures.checkInTargets + fixtures.messagedGroups,
    count: fixtures.sendableGroups,
  },
};

/** Invitation groups the concurrent check-in scenario contends over. */
export function checkInTargetIds(count) {
  const total = Math.min(count || BANDS.checkIn.count, BANDS.checkIn.count);
  const ids = [];
  for (let offset = 0; offset < total; offset += 1) {
    ids.push(invitationGroupId(BANDS.checkIn.start + offset));
  }
  return ids;
}

/**
 * A contiguous slice of the sendable band. Each send-batch iteration claims its
 * own slice so two launches never compete for the same invitation group, which
 * is what the one-initial-invitation unique index enforces at the database.
 */
export function sendableSlice(sliceIndex, sliceSize) {
  const offset = sliceIndex * sliceSize;
  if (offset + sliceSize > BANDS.sendable.count) return null;
  const ids = [];
  for (let position = 0; position < sliceSize; position += 1) {
    ids.push(invitationGroupId(BANDS.sendable.start + offset + position));
  }
  return ids;
}

/** Number of whole slices of `sliceSize` the sendable band can serve. */
export function sendableSliceCount(sliceSize) {
  return Math.floor(BANDS.sendable.count / sliceSize);
}
