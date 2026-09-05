import type { SupabaseClient } from "@supabase/supabase-js";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

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

export async function apiRequest<T>(
  supabase: SupabaseClient,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken)
    throw new ApiClientError(
      "AUTH_REQUIRED",
      "يلزم تسجيل الدخول للمتابعة.",
      401,
    );

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...init.headers,
    },
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new ApiClientError(
      payload?.error?.code ?? "REQUEST_FAILED",
      payload?.error?.message ?? "تعذر إكمال الطلب.",
      response.status,
    );
  }

  return (await response.json()) as T;
}
