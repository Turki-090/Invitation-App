import type { components } from "@dawah/api-client";
import { describe, expectTypeOf, it } from "vitest";
import type { ApiError, Readiness } from "./shared";
import type {
  CreateEventInput,
  EventDashboardSummary,
  EventDetail,
  EventSummary,
  TransitionEventStatusInput,
  UpdateEventInput,
} from "./events";
import type {
  BulkCancelInvitationsInput,
  BulkCancelInvitationsResult,
  CreateInvitationInput,
  DuplicateInvitationConflict,
  InvitationDetail,
  InvitationListItem,
  InvitationListResponse,
  InvitationMember,
  InvitationMemberInput,
  UpdateInvitationInput,
} from "./invitations";

type OpenApiCreateEvent = components["schemas"]["CreateEvent"];
type OpenApiUpdateEvent = components["schemas"]["UpdateEvent"];
type OpenApiEventSummary = components["schemas"]["EventSummary"];
type OpenApiEventDetail = components["schemas"]["EventDetail"];
type OpenApiTransitionEventStatus =
  components["schemas"]["TransitionEventStatus"];
type OpenApiEventDashboardSummary =
  components["schemas"]["EventDashboardSummary"];
type OpenApiCreateInvitation = components["schemas"]["CreateInvitation"];
type OpenApiUpdateInvitation = components["schemas"]["UpdateInvitation"];
type OpenApiInvitationMemberInput =
  components["schemas"]["InvitationMemberInput"];
type OpenApiInvitationMember = components["schemas"]["InvitationMember"];
type OpenApiInvitationListItem = components["schemas"]["InvitationListItem"];
type OpenApiInvitationDetail = components["schemas"]["InvitationDetail"];
type OpenApiInvitationListResponse =
  components["schemas"]["InvitationListResponse"];
type OpenApiBulkCancelInvitations =
  components["schemas"]["BulkCancelInvitations"];
type OpenApiBulkCancelInvitationsResult =
  components["schemas"]["BulkCancelInvitationsResult"];
type OpenApiDuplicateInvitationConflict =
  components["schemas"]["DuplicateInvitationConflict"];
type OpenApiError = components["schemas"]["ApiError"];
type OpenApiReadiness = components["schemas"]["Readiness"];

function assertAssignable<Expected, _Actual extends Expected>(): void {}

describe("OpenAPI runtime contract compatibility", () => {
  it("keeps event request and response types aligned with the canonical schema", () => {
    assertAssignable<OpenApiCreateEvent, CreateEventInput>();
    assertAssignable<CreateEventInput, OpenApiCreateEvent>();
    assertAssignable<OpenApiUpdateEvent, UpdateEventInput>();
    assertAssignable<UpdateEventInput, OpenApiUpdateEvent>();
    assertAssignable<OpenApiEventSummary, EventSummary>();
    assertAssignable<EventSummary, OpenApiEventSummary>();
    assertAssignable<OpenApiEventDetail, EventDetail>();
    assertAssignable<EventDetail, OpenApiEventDetail>();
    assertAssignable<
      OpenApiTransitionEventStatus,
      TransitionEventStatusInput
    >();
    assertAssignable<
      TransitionEventStatusInput,
      OpenApiTransitionEventStatus
    >();
    assertAssignable<OpenApiEventDashboardSummary, EventDashboardSummary>();
    assertAssignable<EventDashboardSummary, OpenApiEventDashboardSummary>();
  });

  it("keeps invitation request and response types aligned with the canonical schema", () => {
    assertAssignable<OpenApiCreateInvitation, CreateInvitationInput>();
    assertAssignable<CreateInvitationInput, OpenApiCreateInvitation>();
    assertAssignable<OpenApiUpdateInvitation, UpdateInvitationInput>();
    assertAssignable<UpdateInvitationInput, OpenApiUpdateInvitation>();
    assertAssignable<OpenApiInvitationMemberInput, InvitationMemberInput>();
    assertAssignable<InvitationMemberInput, OpenApiInvitationMemberInput>();
    assertAssignable<OpenApiInvitationMember, InvitationMember>();
    assertAssignable<InvitationMember, OpenApiInvitationMember>();
    assertAssignable<OpenApiInvitationListItem, InvitationListItem>();
    assertAssignable<InvitationListItem, OpenApiInvitationListItem>();
    assertAssignable<OpenApiInvitationDetail, InvitationDetail>();
    assertAssignable<InvitationDetail, OpenApiInvitationDetail>();
    assertAssignable<OpenApiInvitationListResponse, InvitationListResponse>();
    assertAssignable<InvitationListResponse, OpenApiInvitationListResponse>();
    assertAssignable<
      OpenApiBulkCancelInvitations,
      BulkCancelInvitationsInput
    >();
    assertAssignable<
      BulkCancelInvitationsInput,
      OpenApiBulkCancelInvitations
    >();
    assertAssignable<
      OpenApiBulkCancelInvitationsResult,
      BulkCancelInvitationsResult
    >();
    assertAssignable<
      BulkCancelInvitationsResult,
      OpenApiBulkCancelInvitationsResult
    >();
    assertAssignable<
      OpenApiDuplicateInvitationConflict,
      DuplicateInvitationConflict
    >();
    assertAssignable<
      DuplicateInvitationConflict,
      OpenApiDuplicateInvitationConflict
    >();
  });

  it("keeps the shared error envelope aligned", () => {
    expectTypeOf<ApiError>().toMatchTypeOf<OpenApiError>();
    expectTypeOf<OpenApiError>().toMatchTypeOf<ApiError>();
  });

  it("keeps API readiness aligned", () => {
    expectTypeOf<Readiness>().toMatchTypeOf<OpenApiReadiness>();
    expectTypeOf<OpenApiReadiness>().toMatchTypeOf<Readiness>();
  });
});
