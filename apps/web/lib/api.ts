import {
  type AcceptTeamInvitationResult,
  DEVELOPMENT_ACCESS_TOKEN,
  type BulkCancelInvitationsInput,
  type BulkCancelInvitationsResult,
  type ConfirmImportInput,
  type ConfirmImportResult,
  type CheckInDashboard,
  type CheckInResult,
  type CreateCheckInInput,
  type CreateExportInput,
  type CreditOverview,
  type CreateReminderRuleInput,
  type CreateInvitationTemplateInput,
  type CreatePreparationSnapshotsInput,
  type CreatePreparationSnapshotsResult,
  type CreateInvitationInput,
  type CreateTeamInvitationInput,
  type EventReport,
  type ExportJob,
  type GetImportJobQuery,
  type ImportJobDetailResponse,
  type ImportJobSummary,
  type ImportLimits,
  type InvitationDetail,
  type InvitationListResponse,
  type InvitationPreview,
  type InvitationPreviewRequest,
  type InvitationTemplate,
  type ListAssetsResponse,
  type ListImportJobsResponse,
  type ListInvitationsQuery,
  type ListNotificationsQuery,
  type ListNotificationsResponse,
  type ListCreditLedgerQuery,
  type ListCreditLedgerResponse,
  type ListExportJobsQuery,
  type ListExportJobsResponse,
  type ListReminderRunsResponse,
  type ReadinessResponse,
  type CreateSendBatchInput,
  type ListSendBatchesResponse,
  type MessageListQuery,
  type PublicInvitation,
  type PublicEntryPass,
  type PublicInvitationLocaleQuery,
  type ReminderReadinessRequest,
  type ReminderReadinessResponse,
  type ReminderRule,
  type ReminderRun,
  type ReminderRunDetail,
  type ResolveEntryPassInput,
  type ResolvedEntryPass,
  type ResendMessageInput,
  type ResendReadinessResponse,
  type SendBatch,
  type SendBatchDetail,
  type SendReadinessRequest,
  type SendReadinessResponse,
  type SendRemindersInput,
  type StoredAsset,
  type SearchCheckInPartiesQuery,
  type SearchCheckInPartiesResponse,
  type SubmitRsvpInput,
  type TeamInvitation,
  type TeamInvitationCredential,
  type TeamOverview,
  type TeamMember,
  type UpdateImportMappingInput,
  type UpdateImportRowInput,
  type UpdateInvitationTemplateInput,
  type UpdateInvitationInput,
  type UpdateReminderRuleInput,
  type UpdateTeamMemberInput,
  publicInvitationSchema,
  publicEntryPassSchema,
  rsvpResultSchema,
  type RsvpResult,
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

export const publicInvitationTokenPattern = /^[A-Za-z0-9_-]{43,256}$/;

export function isPublicInvitationToken(value: string): boolean {
  return publicInvitationTokenPattern.test(value);
}

export async function getPublicInvitation(
  token: string,
  locale: PublicInvitationLocaleQuery["locale"],
): Promise<PublicInvitation> {
  const response = await fetch(publicInvitationUrl(token, locale), {
    cache: "no-store",
    credentials: "omit",
    headers: { Accept: "application/json" },
    referrerPolicy: "no-referrer",
  });
  const payload = await response.json().catch(() => undefined);
  if (!response.ok) throwApiError(payload, response.status);
  const parsed = publicInvitationSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiClientError(
      "INVALID_PUBLIC_INVITATION_RESPONSE",
      "The invitation response could not be verified.",
      502,
    );
  }
  return parsed.data;
}

export async function submitPublicRsvp(
  token: string,
  locale: PublicInvitationLocaleQuery["locale"],
  input: SubmitRsvpInput,
): Promise<RsvpResult> {
  const response = await fetch(publicRsvpUrl(token, locale), {
    body: JSON.stringify(input),
    cache: "no-store",
    credentials: "omit",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
    referrerPolicy: "no-referrer",
  });
  const payload = await response.json().catch(() => undefined);
  if (!response.ok) throwApiError(payload, response.status);
  const parsed = rsvpResultSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiClientError(
      "INVALID_RSVP_RESPONSE",
      "The RSVP response could not be verified.",
      502,
    );
  }
  return parsed.data;
}

export async function issuePublicEntryPass(
  token: string,
): Promise<PublicEntryPass> {
  const response = await fetch(publicEntryPassUrl(token), {
    cache: "no-store",
    credentials: "omit",
    headers: { Accept: "application/json" },
    method: "POST",
    referrerPolicy: "no-referrer",
  });
  const payload = await response.json().catch(() => undefined);
  if (!response.ok) throwApiError(payload, response.status);
  const parsed = publicEntryPassSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiClientError(
      "INVALID_ENTRY_PASS_RESPONSE",
      "The entry pass response could not be verified.",
      502,
    );
  }
  return parsed.data;
}

function publicInvitationUrl(
  token: string,
  locale: PublicInvitationLocaleQuery["locale"],
): string {
  return publicCapabilityUrl(token, locale, "");
}

function publicRsvpUrl(
  token: string,
  locale: PublicInvitationLocaleQuery["locale"],
): string {
  return publicCapabilityUrl(token, locale, "/rsvp");
}

function publicEntryPassUrl(token: string): string {
  return `${apiBaseUrl}/public/invitations/${encodeURIComponent(token)}/entry-pass`;
}

function publicCapabilityUrl(
  token: string,
  locale: PublicInvitationLocaleQuery["locale"],
  suffix: "" | "/rsvp",
): string {
  const search = new URLSearchParams({ locale });
  return `${apiBaseUrl}/public/invitations/${encodeURIComponent(token)}${suffix}?${search.toString()}`;
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

export async function getEventReport(
  supabase: SupabaseClient | null,
  eventId: string,
): Promise<EventReport> {
  return requestAuthenticatedJson(supabase, `/events/${eventId}/reports`);
}

export async function createExportJob(
  supabase: SupabaseClient | null,
  eventId: string,
  input: CreateExportInput,
): Promise<ExportJob> {
  return requestAuthenticatedJson(
    supabase,
    `/events/${eventId}/exports`,
    jsonRequest("POST", input),
  );
}

export async function listExportJobs(
  supabase: SupabaseClient | null,
  eventId: string,
  query: ListExportJobsQuery = { page: 1, pageSize: 20 },
): Promise<ListExportJobsResponse> {
  const search = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  if (query.status) search.set("status", query.status);
  return requestAuthenticatedJson(
    supabase,
    `/events/${eventId}/exports?${search.toString()}`,
  );
}

export async function downloadExportJob(
  supabase: SupabaseClient | null,
  downloadUrl: string,
): Promise<Blob> {
  const parsed = new URL(downloadUrl, apiBaseUrl);
  const apiOrigin = new URL(apiBaseUrl).origin;
  if (parsed.origin !== apiOrigin || !parsed.pathname.startsWith("/api/v1/")) {
    throw new ApiClientError(
      "INVALID_EXPORT_DOWNLOAD_URL",
      "The export download URL could not be verified.",
      502,
    );
  }
  return requestAuthenticatedBlob(
    supabase,
    `${parsed.pathname.replace(/^\/api\/v1/, "")}${parsed.search}`,
  );
}

export async function resolveEntryPass(
  supabase: SupabaseClient | null,
  eventId: string,
  input: ResolveEntryPassInput,
): Promise<ResolvedEntryPass> {
  return requestAuthenticatedJson(
    supabase,
    `/events/${eventId}/check-ins/resolve`,
    jsonRequest("POST", input),
  );
}

export async function searchCheckInParties(
  supabase: SupabaseClient | null,
  eventId: string,
  query: SearchCheckInPartiesQuery,
): Promise<SearchCheckInPartiesResponse> {
  const search = new URLSearchParams({
    query: query.query,
    limit: String(query.limit),
  });
  return requestAuthenticatedJson(
    supabase,
    `/events/${eventId}/check-ins/search?${search.toString()}`,
  );
}

export async function getCheckInDashboard(
  supabase: SupabaseClient | null,
  eventId: string,
): Promise<CheckInDashboard> {
  return requestAuthenticatedJson(
    supabase,
    `/events/${eventId}/check-ins/dashboard`,
  );
}

export async function createCheckIn(
  supabase: SupabaseClient | null,
  eventId: string,
  input: CreateCheckInInput,
  idempotencyKey: string,
): Promise<CheckInResult> {
  return requestAuthenticatedJson(
    supabase,
    `/events/${eventId}/check-ins`,
    jsonRequest("POST", input, { "Idempotency-Key": idempotencyKey }),
  );
}

export async function getCreditOverview(
  supabase: SupabaseClient | null,
  eventId: string,
): Promise<CreditOverview> {
  return requestAuthenticatedJson(supabase, `/events/${eventId}/credits`);
}

export async function listCreditLedger(
  supabase: SupabaseClient | null,
  eventId: string,
  query: ListCreditLedgerQuery = { page: 1, pageSize: 20 },
): Promise<ListCreditLedgerResponse> {
  const search = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  if (query.entryType) search.set("entryType", query.entryType);
  return requestAuthenticatedJson(
    supabase,
    `/events/${eventId}/credits/ledger?${search.toString()}`,
  );
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

export async function getImportLimits(
  supabase: SupabaseClient | null,
  eventId: string,
): Promise<ImportLimits> {
  return requestAuthenticatedJson(
    supabase,
    `/events/${eventId}/imports/limits`,
  );
}

export async function listImportJobs(
  supabase: SupabaseClient | null,
  eventId: string,
): Promise<ListImportJobsResponse> {
  return requestAuthenticatedJson(supabase, `/events/${eventId}/imports`);
}

export async function createImportJob(
  supabase: SupabaseClient | null,
  eventId: string,
  file: File,
): Promise<ImportJobSummary> {
  const body = new FormData();
  body.append("file", file);
  return requestAuthenticatedJson(supabase, `/events/${eventId}/imports`, {
    body,
    method: "POST",
  });
}

export async function getImportJob(
  supabase: SupabaseClient | null,
  eventId: string,
  importJobId: string,
  query: GetImportJobQuery = { page: 1, pageSize: 50 },
): Promise<ImportJobDetailResponse> {
  const search = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  if (query.rowStatus) search.set("rowStatus", query.rowStatus);
  return requestAuthenticatedJson(
    supabase,
    `/events/${eventId}/imports/${importJobId}?${search.toString()}`,
  );
}

export async function updateImportMapping(
  supabase: SupabaseClient | null,
  eventId: string,
  importJobId: string,
  input: UpdateImportMappingInput,
): Promise<ImportJobSummary> {
  return requestAuthenticatedJson(
    supabase,
    `/events/${eventId}/imports/${importJobId}/mapping`,
    jsonRequest("PATCH", input),
  );
}

export async function updateImportRow(
  supabase: SupabaseClient | null,
  eventId: string,
  importJobId: string,
  rowId: string,
  input: UpdateImportRowInput,
): Promise<ImportJobSummary> {
  return requestAuthenticatedJson(
    supabase,
    `/events/${eventId}/imports/${importJobId}/rows/${rowId}`,
    jsonRequest("PATCH", input),
  );
}

export async function confirmImportJob(
  supabase: SupabaseClient | null,
  eventId: string,
  importJobId: string,
  input: ConfirmImportInput,
): Promise<ConfirmImportResult> {
  return requestAuthenticatedJson(
    supabase,
    `/events/${eventId}/imports/${importJobId}/confirm`,
    jsonRequest("POST", input),
  );
}

export async function cancelImportJob(
  supabase: SupabaseClient | null,
  eventId: string,
  importJobId: string,
): Promise<ImportJobSummary> {
  return requestAuthenticatedJson(
    supabase,
    `/events/${eventId}/imports/${importJobId}/cancel`,
    { method: "POST" },
  );
}

export async function listInvitationAssets(
  supabase: SupabaseClient | null,
  eventId: string,
): Promise<ListAssetsResponse> {
  return requestAuthenticatedJson(
    supabase,
    `/events/${eventId}/assets?kind=INVITATION_ASSET&includeArchived=false`,
  );
}

export async function uploadInvitationAsset(
  supabase: SupabaseClient | null,
  eventId: string,
  file: File,
): Promise<StoredAsset> {
  const body = new FormData();
  body.append("kind", "INVITATION_ASSET");
  body.append("file", file);
  return requestAuthenticatedJson(supabase, `/events/${eventId}/assets`, {
    body,
    method: "POST",
  });
}

export async function listInvitationTemplates(
  supabase: SupabaseClient | null,
  eventId: string,
): Promise<readonly InvitationTemplate[]> {
  const response = await requestAuthenticatedJson<
    { items: InvitationTemplate[] } | InvitationTemplate[]
  >(supabase, `/events/${eventId}/templates`);
  return Array.isArray(response) ? response : response.items;
}

export async function createInvitationTemplate(
  supabase: SupabaseClient | null,
  eventId: string,
  input: CreateInvitationTemplateInput,
): Promise<InvitationTemplate> {
  return requestAuthenticatedJson(
    supabase,
    `/events/${eventId}/templates`,
    jsonRequest("POST", input),
  );
}

export async function updateInvitationTemplate(
  supabase: SupabaseClient | null,
  eventId: string,
  templateId: string,
  input: UpdateInvitationTemplateInput,
): Promise<InvitationTemplate> {
  return requestAuthenticatedJson(
    supabase,
    `/events/${eventId}/templates/${templateId}`,
    jsonRequest("PATCH", input),
  );
}

export async function approveInvitationTemplate(
  supabase: SupabaseClient | null,
  eventId: string,
  templateId: string,
  expectedVersion: number,
): Promise<InvitationTemplate> {
  return requestAuthenticatedJson(
    supabase,
    `/events/${eventId}/templates/${templateId}/approve`,
    jsonRequest("POST", { expectedVersion }),
  );
}

export async function archiveInvitationTemplate(
  supabase: SupabaseClient | null,
  eventId: string,
  templateId: string,
): Promise<InvitationTemplate> {
  return requestAuthenticatedJson(
    supabase,
    `/events/${eventId}/templates/${templateId}/archive`,
    { method: "POST" },
  );
}

export async function previewInvitation(
  supabase: SupabaseClient | null,
  eventId: string,
  input: InvitationPreviewRequest,
): Promise<InvitationPreview> {
  return requestAuthenticatedJson(
    supabase,
    `/events/${eventId}/preparation/preview`,
    jsonRequest("POST", input),
  );
}

export async function getPreparationReadiness(
  supabase: SupabaseClient | null,
  eventId: string,
  templateId: string,
): Promise<ReadinessResponse> {
  const search = new URLSearchParams({
    templateId,
    page: "1",
    pageSize: "50",
  });
  return requestAuthenticatedJson(
    supabase,
    `/events/${eventId}/preparation/readiness?${search.toString()}`,
  );
}

export async function createPreparationSnapshots(
  supabase: SupabaseClient | null,
  eventId: string,
  input: CreatePreparationSnapshotsInput,
): Promise<CreatePreparationSnapshotsResult> {
  return requestAuthenticatedJson(
    supabase,
    `/events/${eventId}/preparation/snapshots`,
    jsonRequest("POST", input),
  );
}

export async function getSendReadiness(
  supabase: SupabaseClient | null,
  eventId: string,
  input: SendReadinessRequest,
): Promise<SendReadinessResponse> {
  return requestAuthenticatedJson(
    supabase,
    `/events/${eventId}/sending/readiness`,
    jsonRequest("POST", input),
  );
}

export async function createSendBatch(
  supabase: SupabaseClient | null,
  eventId: string,
  input: CreateSendBatchInput,
  idempotencyKey: string,
): Promise<SendBatch> {
  return requestAuthenticatedJson(
    supabase,
    `/events/${eventId}/send-batches`,
    jsonRequest("POST", input, { "Idempotency-Key": idempotencyKey }),
  );
}

export async function listSendBatches(
  supabase: SupabaseClient | null,
  eventId: string,
): Promise<ListSendBatchesResponse> {
  return requestAuthenticatedJson(
    supabase,
    `/events/${eventId}/send-batches?page=1&pageSize=20`,
  );
}

export async function getSendBatch(
  supabase: SupabaseClient | null,
  eventId: string,
  batchId: string,
  query: MessageListQuery = { page: 1, pageSize: 100 },
): Promise<SendBatchDetail> {
  const search = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  if (query.status) search.set("status", query.status);
  return requestAuthenticatedJson(
    supabase,
    `/events/${eventId}/send-batches/${batchId}?${search.toString()}`,
  );
}

export async function getResendReadiness(
  supabase: SupabaseClient | null,
  eventId: string,
  messageId: string,
): Promise<ResendReadinessResponse> {
  return requestAuthenticatedJson(
    supabase,
    `/events/${eventId}/messages/${messageId}/resend-readiness`,
    { method: "POST" },
  );
}

export async function resendMessage(
  supabase: SupabaseClient | null,
  eventId: string,
  messageId: string,
  input: ResendMessageInput,
  idempotencyKey: string,
): Promise<SendBatch> {
  return requestAuthenticatedJson(
    supabase,
    `/events/${eventId}/messages/${messageId}/resend`,
    jsonRequest("POST", input, { "Idempotency-Key": idempotencyKey }),
  );
}

export async function getReminderReadiness(
  supabase: SupabaseClient | null,
  eventId: string,
  input: ReminderReadinessRequest,
): Promise<ReminderReadinessResponse> {
  return requestAuthenticatedJson(
    supabase,
    `/events/${eventId}/reminders/readiness`,
    jsonRequest("POST", input),
  );
}

export async function sendReminders(
  supabase: SupabaseClient | null,
  eventId: string,
  input: SendRemindersInput,
  idempotencyKey: string,
): Promise<ReminderRun> {
  return requestAuthenticatedJson(
    supabase,
    `/events/${eventId}/reminders/send`,
    jsonRequest("POST", input, { "Idempotency-Key": idempotencyKey }),
  );
}

export async function listReminderRuns(
  supabase: SupabaseClient | null,
  eventId: string,
  page = 1,
  pageSize = 20,
): Promise<ListReminderRunsResponse> {
  const search = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  return requestAuthenticatedJson(
    supabase,
    `/events/${eventId}/reminders/runs?${search.toString()}`,
  );
}

export async function getReminderRun(
  supabase: SupabaseClient | null,
  eventId: string,
  runId: string,
): Promise<ReminderRunDetail> {
  return requestAuthenticatedJson(
    supabase,
    `/events/${eventId}/reminders/runs/${runId}`,
  );
}

export async function listReminderRules(
  supabase: SupabaseClient | null,
  eventId: string,
): Promise<readonly ReminderRule[]> {
  return requestAuthenticatedJson(
    supabase,
    `/events/${eventId}/reminders/rules`,
  );
}

export async function createReminderRule(
  supabase: SupabaseClient | null,
  eventId: string,
  input: CreateReminderRuleInput,
): Promise<ReminderRule> {
  return requestAuthenticatedJson(
    supabase,
    `/events/${eventId}/reminders/rules`,
    jsonRequest("POST", input),
  );
}

export async function updateReminderRule(
  supabase: SupabaseClient | null,
  eventId: string,
  ruleId: string,
  input: UpdateReminderRuleInput,
): Promise<ReminderRule> {
  return requestAuthenticatedJson(
    supabase,
    `/events/${eventId}/reminders/rules/${ruleId}`,
    jsonRequest("PATCH", input),
  );
}

export async function getTeamOverview(
  supabase: SupabaseClient | null,
  eventId: string,
): Promise<TeamOverview> {
  return requestAuthenticatedJson(supabase, `/events/${eventId}/team`);
}

export async function createTeamInvitation(
  supabase: SupabaseClient | null,
  eventId: string,
  input: CreateTeamInvitationInput,
): Promise<TeamInvitationCredential> {
  return requestAuthenticatedJson(
    supabase,
    `/events/${eventId}/team-invitations`,
    jsonRequest("POST", input),
  );
}

export async function resendTeamInvitation(
  supabase: SupabaseClient | null,
  eventId: string,
  invitationId: string,
): Promise<TeamInvitationCredential> {
  return requestAuthenticatedJson(
    supabase,
    `/events/${eventId}/team-invitations/${invitationId}/resend`,
    { method: "POST" },
  );
}

export async function revokeTeamInvitation(
  supabase: SupabaseClient | null,
  eventId: string,
  invitationId: string,
): Promise<TeamInvitation> {
  return requestAuthenticatedJson(
    supabase,
    `/events/${eventId}/team-invitations/${invitationId}/revoke`,
    { method: "POST" },
  );
}

export async function updateTeamMember(
  supabase: SupabaseClient | null,
  eventId: string,
  membershipId: string,
  input: UpdateTeamMemberInput,
): Promise<TeamMember> {
  return requestAuthenticatedJson(
    supabase,
    `/events/${eventId}/memberships/${membershipId}`,
    jsonRequest("PATCH", input),
  );
}

export async function revokeTeamMember(
  supabase: SupabaseClient | null,
  eventId: string,
  membershipId: string,
): Promise<TeamMember> {
  return requestAuthenticatedJson(
    supabase,
    `/events/${eventId}/memberships/${membershipId}/revoke`,
    { method: "POST" },
  );
}

export async function acceptTeamInvitation(
  supabase: SupabaseClient | null,
  token: string,
): Promise<AcceptTeamInvitationResult> {
  return requestAuthenticatedJson(
    supabase,
    "/team-invitations/accept",
    jsonRequest("POST", { token }),
  );
}

export async function listNotifications(
  supabase: SupabaseClient | null,
  query: ListNotificationsQuery,
): Promise<ListNotificationsResponse> {
  const search = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
    unreadOnly: String(query.unreadOnly),
  });
  if (query.eventId) search.set("eventId", query.eventId);
  return requestAuthenticatedJson(
    supabase,
    `/notifications?${search.toString()}`,
  );
}

export async function markNotificationRead(
  supabase: SupabaseClient | null,
  notificationId: string,
): Promise<void> {
  await requestAuthenticatedJson(
    supabase,
    `/notifications/${notificationId}/read`,
    { method: "POST" },
  );
}

function jsonRequest(
  method: "PATCH" | "POST",
  body: unknown,
  additionalHeaders?: HeadersInit,
): RequestInit {
  return {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      ...Object.fromEntries(new Headers(additionalHeaders)),
    },
    method,
  };
}

async function requestAuthenticatedJson<T>(
  supabase: SupabaseClient | null,
  path: string,
  init: RequestInit = {},
): Promise<T> {
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

  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers });
  const payload = await response.json().catch(() => undefined);
  if (!response.ok) throwApiError(payload, response.status);
  return payload as T;
}

async function requestAuthenticatedBlob(
  supabase: SupabaseClient | null,
  path: string,
): Promise<Blob> {
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
  const response = await fetch(`${apiBaseUrl}${path}`, {
    cache: "no-store",
    headers: {
      Accept: "application/octet-stream",
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => undefined);
    throwApiError(payload, response.status);
  }
  return response.blob();
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
