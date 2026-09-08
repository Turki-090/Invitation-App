import {
  DEVELOPMENT_ACCESS_TOKEN,
  type BulkCancelInvitationsInput,
  type BulkCancelInvitationsResult,
  type CreateInvitationInput,
  type InvitationDetail,
  type InvitationListResponse,
  type ListInvitationsQuery,
  type UpdateInvitationInput,
} from "@dawah/api-contract";
import { createDawahApiClient, type components } from "@dawah/api-client";
import type { SupabaseClient } from "@supabase/supabase-js";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export const developmentAuthBypassEnabled =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_DAWAH_DEV_AUTH_BYPASS === "true";

export class ApiClientError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

type CreateEvent = components["schemas"]["CreateEvent"];
type EventSummary = components["schemas"]["EventSummary"];
type UpdateEvent = components["schemas"]["UpdateEvent"];
type EventDetail = components["schemas"]["EventDetail"];
type EventDashboardSummary = components["schemas"]["EventDashboardSummary"];
type EventStatus = components["schemas"]["EventStatus"];

export async function listEvents(
  supabase: SupabaseClient | null,
): Promise<readonly EventSummary[]> {
  const client = await authenticatedClient(supabase);
  const { data, error, response } = await client.GET("/events");
  if (!data) throwApiError(error, response.status);
  return data;
}

export async function createEvent(
  supabase: SupabaseClient | null,
  input: CreateEvent,
): Promise<EventSummary> {
  const client = await authenticatedClient(supabase);
  const { data, error, response } = await client.POST("/events", {
    body: input,
  });
  if (!data) throwApiError(error, response.status);
  return data;
}

export async function getEvent(
  supabase: SupabaseClient | null,
  eventId: string,
): Promise<EventDetail> {
  const client = await authenticatedClient(supabase);
  const { data, error, response } = await client.GET("/events/{eventId}", {
    params: { path: { eventId } },
  });
  if (!data) throwApiError(error, response.status);
  return data;
}

export async function getEventDashboard(
  supabase: SupabaseClient | null,
  eventId: string,
): Promise<EventDashboardSummary> {
  const client = await authenticatedClient(supabase);
  const { data, error, response } = await client.GET(
    "/events/{eventId}/dashboard",
    { params: { path: { eventId } } },
  );
  if (!data) throwApiError(error, response.status);
  return data;
}

export async function listInvitations(
  supabase: SupabaseClient | null,
  eventId: string,
  query: ListInvitationsQuery,
): Promise<InvitationListResponse> {
  const client = await authenticatedClient(supabase);
  const { data, error, response } = await client.GET(
    "/events/{eventId}/invitations",
    { params: { path: { eventId }, query } },
  );
  if (!data) throwApiError(error, response.status);
  return data;
}

export async function createInvitation(
  supabase: SupabaseClient | null,
  eventId: string,
  input: CreateInvitationInput,
): Promise<InvitationDetail> {
  const client = await authenticatedClient(supabase);
  const { data, error, response } = await client.POST(
    "/events/{eventId}/invitations",
    { params: { path: { eventId } }, body: input },
  );
  if (!data) throwApiError(error, response.status);
  return data;
}

export async function bulkCancelInvitations(
  supabase: SupabaseClient | null,
  eventId: string,
  input: BulkCancelInvitationsInput,
): Promise<BulkCancelInvitationsResult> {
  const client = await authenticatedClient(supabase);
  const { data, error, response } = await client.POST(
    "/events/{eventId}/invitations/bulk-cancel",
    { params: { path: { eventId } }, body: input },
  );
  if (!data) throwApiError(error, response.status);
  return data;
}

export async function getInvitation(
  supabase: SupabaseClient | null,
  eventId: string,
  invitationId: string,
): Promise<InvitationDetail> {
  const client = await authenticatedClient(supabase);
  const { data, error, response } = await client.GET(
    "/events/{eventId}/invitations/{invitationId}",
    { params: { path: { eventId, invitationId } } },
  );
  if (!data) throwApiError(error, response.status);
  return data;
}

export async function cancelInvitation(
  supabase: SupabaseClient | null,
  eventId: string,
  invitationId: string,
): Promise<InvitationDetail> {
  const client = await authenticatedClient(supabase);
  const { data, error, response } = await client.POST(
    "/events/{eventId}/invitations/{invitationId}/cancel",
    { params: { path: { eventId, invitationId } } },
  );
  if (!data) throwApiError(error, response.status);
  return data;
}

export async function updateInvitation(
  supabase: SupabaseClient | null,
  eventId: string,
  invitationId: string,
  input: UpdateInvitationInput,
): Promise<InvitationDetail> {
  const client = await authenticatedClient(supabase);
  const { data, error, response } = await client.PATCH(
    "/events/{eventId}/invitations/{invitationId}",
    { params: { path: { eventId, invitationId } }, body: input },
  );
  if (!data) throwApiError(error, response.status);
  return data;
}

export async function updateEvent(
  supabase: SupabaseClient | null,
  eventId: string,
  input: UpdateEvent,
): Promise<EventDetail> {
  const client = await authenticatedClient(supabase);
  const { data, error, response } = await client.PATCH("/events/{eventId}", {
    params: { path: { eventId } },
    body: input,
  });
  if (!data) throwApiError(error, response.status);
  return data;
}

export async function archiveEvent(
  supabase: SupabaseClient | null,
  eventId: string,
): Promise<EventDetail> {
  const client = await authenticatedClient(supabase);
  const { data, error, response } = await client.POST(
    "/events/{eventId}/archive",
    { params: { path: { eventId } } },
  );
  if (!data) throwApiError(error, response.status);
  return data;
}

export async function recoverEvent(
  supabase: SupabaseClient | null,
  eventId: string,
): Promise<EventDetail> {
  const client = await authenticatedClient(supabase);
  const { data, error, response } = await client.POST(
    "/events/{eventId}/recovery-request",
    { params: { path: { eventId } } },
  );
  if (!data) throwApiError(error, response.status);
  return data;
}

export async function transitionEventStatus(
  supabase: SupabaseClient | null,
  eventId: string,
  status: Exclude<EventStatus, "ARCHIVED">,
): Promise<EventDetail> {
  const client = await authenticatedClient(supabase);
  const { data, error, response } = await client.POST(
    "/events/{eventId}/status-transitions",
    { params: { path: { eventId } }, body: { status } },
  );
  if (!data) throwApiError(error, response.status);
  return data;
}

async function authenticatedClient(supabase: SupabaseClient | null) {
  const accessToken = developmentAuthBypassEnabled
    ? DEVELOPMENT_ACCESS_TOKEN
    : (await supabase?.auth.getSession())?.data.session?.access_token;
  if (!accessToken) {
    throw new ApiClientError(
      "AUTH_REQUIRED",
      "يلزم تسجيل الدخول للمتابعة.",
      401,
    );
  }

  return createDawahApiClient({
    baseUrl: apiBaseUrl,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

function throwApiError(payload: unknown, status: number): never {
  const error =
    payload && typeof payload === "object" && "error" in payload
      ? payload.error
      : undefined;
  const code =
    error && typeof error === "object" && "code" in error
      ? error.code
      : undefined;
  const message =
    error && typeof error === "object" && "message" in error
      ? error.message
      : undefined;
  const details =
    error && typeof error === "object" && "details" in error
      ? error.details
      : undefined;
  throw new ApiClientError(
    typeof code === "string" ? code : "REQUEST_FAILED",
    typeof message === "string" ? message : "تعذر إكمال الطلب.",
    status,
    details,
  );
}
