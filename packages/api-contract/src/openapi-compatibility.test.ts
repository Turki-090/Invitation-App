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

type OpenApiCreateEvent = components["schemas"]["CreateEvent"];
type OpenApiUpdateEvent = components["schemas"]["UpdateEvent"];
type OpenApiEventSummary = components["schemas"]["EventSummary"];
type OpenApiEventDetail = components["schemas"]["EventDetail"];
type OpenApiTransitionEventStatus =
  components["schemas"]["TransitionEventStatus"];
type OpenApiEventDashboardSummary =
  components["schemas"]["EventDashboardSummary"];
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

  it("keeps the shared error envelope aligned", () => {
    expectTypeOf<ApiError>().toMatchTypeOf<OpenApiError>();
    expectTypeOf<OpenApiError>().toMatchTypeOf<ApiError>();
  });

  it("keeps API readiness aligned", () => {
    expectTypeOf<Readiness>().toMatchTypeOf<OpenApiReadiness>();
    expectTypeOf<OpenApiReadiness>().toMatchTypeOf<Readiness>();
  });
});
