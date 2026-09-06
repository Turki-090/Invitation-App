import type { components } from "@dawah/api-client";
import { describe, expectTypeOf, it } from "vitest";
import type { ApiError, Readiness } from "./shared";
import type { CreateEventInput, EventSummary } from "./events";

type OpenApiCreateEvent = components["schemas"]["CreateEvent"];
type OpenApiEventSummary = components["schemas"]["EventSummary"];
type OpenApiError = components["schemas"]["ApiError"];
type OpenApiReadiness = components["schemas"]["Readiness"];

describe("OpenAPI runtime contract compatibility", () => {
  it("keeps event request and response types aligned with the canonical schema", () => {
    expectTypeOf<CreateEventInput>().toMatchTypeOf<OpenApiCreateEvent>();
    expectTypeOf<OpenApiCreateEvent>().toMatchTypeOf<CreateEventInput>();
    expectTypeOf<EventSummary>().toMatchTypeOf<OpenApiEventSummary>();
    expectTypeOf<OpenApiEventSummary>().toMatchTypeOf<EventSummary>();
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
