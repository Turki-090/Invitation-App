import { DEVELOPMENT_ACCESS_TOKEN } from "@dawah/api-contract";
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
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

type CreateEvent = components["schemas"]["CreateEvent"];
type EventSummary = components["schemas"]["EventSummary"];

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

function throwApiError(
  payload: components["schemas"]["ApiError"] | undefined,
  status: number,
): never {
  throw new ApiClientError(
    payload?.error.code ?? "REQUEST_FAILED",
    payload?.error.message ?? "تعذر إكمال الطلب.",
    status,
  );
}
