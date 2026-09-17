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
import type {
  CreateSendBatchInput,
  ListSendBatchesResponse,
  MessageSummary,
  ResendReadinessResponse,
  SendBatch,
  SendBatchDetail,
  SendReadinessRequest,
  SendReadinessResponse,
  WhatsappWebhookAcknowledgement,
} from "./messaging";
import type {
  CheckInDashboard,
  CheckInParty,
  CheckInResult,
  CreateCheckInInput,
  PublicEntryPass,
  ResolveEntryPassInput,
  ResolvedEntryPass,
  SearchCheckInPartiesResponse,
} from "./check-ins";
import type {
  CreditLedgerEntry,
  CreditOverview,
  CreditReconciliation,
  ListCreditLedgerResponse,
} from "./credits";
import type {
  CreateExportInput,
  ExportJob,
  ListExportJobsResponse,
} from "./exports";
import type { ListNotificationsResponse, Notification } from "./notifications";
import type { PlatformMetadata } from "./platform";
import type { EventReport } from "./reports";
import type {
  CreateInvitationTemplateInput,
  InvitationTemplate,
} from "./preparation";
import type {
  CreateReminderRuleInput,
  ListReminderRunsResponse,
  ReminderReadinessRequest,
  ReminderReadinessResponse,
  ReminderRule,
  ReminderRun,
  ReminderRunDetail,
  SendRemindersInput,
  UpdateReminderRuleInput,
} from "./reminders";
import type {
  AcceptTeamInvitationInput,
  AcceptTeamInvitationResult,
  CreateTeamInvitationInput,
  TeamInvitation,
  TeamInvitationCredential,
  TeamMember,
  TeamOverview,
  UpdateTeamMemberInput,
} from "./team";

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
type OpenApiSendReadinessRequest =
  components["schemas"]["SendReadinessRequest"];
type OpenApiSendReadinessResponse =
  components["schemas"]["SendReadinessResponse"];
type OpenApiCreateSendBatch = components["schemas"]["CreateSendBatch"];
type OpenApiSendBatch = components["schemas"]["SendBatch"];
type OpenApiListSendBatchesResponse =
  components["schemas"]["ListSendBatchesResponse"];
type OpenApiMessageSummary = components["schemas"]["MessageSummary"];
type OpenApiSendBatchDetail = components["schemas"]["SendBatchDetail"];
type OpenApiResendReadinessResponse =
  components["schemas"]["ResendReadinessResponse"];
type OpenApiWebhookAcknowledgement =
  components["schemas"]["WhatsappWebhookAcknowledgement"];
type OpenApiCreateInvitationTemplate =
  components["schemas"]["CreateInvitationTemplate"];
type OpenApiInvitationTemplate = components["schemas"]["InvitationTemplate"];
type OpenApiReminderReadinessRequest =
  components["schemas"]["ReminderReadinessRequest"];
type OpenApiReminderReadinessResponse =
  components["schemas"]["ReminderReadinessResponse"];
type OpenApiSendReminders = components["schemas"]["SendReminders"];
type OpenApiReminderRule = components["schemas"]["ReminderRule"];
type OpenApiCreateReminderRule = components["schemas"]["CreateReminderRule"];
type OpenApiUpdateReminderRule = components["schemas"]["UpdateReminderRule"];
type OpenApiReminderRun = components["schemas"]["ReminderRun"];
type OpenApiReminderRunDetail = components["schemas"]["ReminderRunDetail"];
type OpenApiListReminderRunsResponse =
  components["schemas"]["ListReminderRunsResponse"];
type OpenApiTeamMember = components["schemas"]["TeamMember"];
type OpenApiTeamInvitation = components["schemas"]["TeamInvitation"];
type OpenApiTeamOverview = components["schemas"]["TeamOverview"];
type OpenApiCreateTeamInvitation =
  components["schemas"]["CreateTeamInvitation"];
type OpenApiTeamInvitationCredential =
  components["schemas"]["TeamInvitationCredential"];
type OpenApiUpdateTeamMember = components["schemas"]["UpdateTeamMember"];
type OpenApiAcceptTeamInvitation =
  components["schemas"]["AcceptTeamInvitation"];
type OpenApiAcceptTeamInvitationResult =
  components["schemas"]["AcceptTeamInvitationResult"];
type OpenApiPlatformMetadata = components["schemas"]["PlatformMetadata"];
type OpenApiEventReport = components["schemas"]["EventReport"];
type OpenApiCreateExport = components["schemas"]["CreateExport"];
type OpenApiExportJob = components["schemas"]["ExportJob"];
type OpenApiListExportJobsResponse =
  components["schemas"]["ListExportJobsResponse"];
type OpenApiPublicEntryPass = components["schemas"]["PublicEntryPass"];
type OpenApiResolveEntryPass = components["schemas"]["ResolveEntryPass"];
type OpenApiCheckInParty = components["schemas"]["CheckInParty"];
type OpenApiResolvedEntryPass = components["schemas"]["ResolvedEntryPass"];
type OpenApiSearchCheckInPartiesResponse =
  components["schemas"]["SearchCheckInPartiesResponse"];
type OpenApiCreateCheckIn = components["schemas"]["CreateCheckIn"];
type OpenApiCheckInResult = components["schemas"]["CheckInResult"];
type OpenApiCheckInDashboard = components["schemas"]["CheckInDashboard"];
type OpenApiCreditOverview = components["schemas"]["CreditOverview"];
type OpenApiCreditReconciliation =
  components["schemas"]["CreditReconciliation"];
type OpenApiCreditLedgerEntry = components["schemas"]["CreditLedgerEntry"];
type OpenApiListCreditLedgerResponse =
  components["schemas"]["ListCreditLedgerResponse"];
type OpenApiNotification = components["schemas"]["Notification"];
type OpenApiListNotificationsResponse =
  components["schemas"]["ListNotificationsResponse"];

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

  it("keeps Stage 6 messaging contracts aligned", () => {
    assertAssignable<OpenApiSendReadinessRequest, SendReadinessRequest>();
    assertAssignable<SendReadinessRequest, OpenApiSendReadinessRequest>();
    assertAssignable<OpenApiSendReadinessResponse, SendReadinessResponse>();
    assertAssignable<SendReadinessResponse, OpenApiSendReadinessResponse>();
    assertAssignable<OpenApiCreateSendBatch, CreateSendBatchInput>();
    assertAssignable<CreateSendBatchInput, OpenApiCreateSendBatch>();
    assertAssignable<OpenApiSendBatch, SendBatch>();
    assertAssignable<SendBatch, OpenApiSendBatch>();
    assertAssignable<OpenApiListSendBatchesResponse, ListSendBatchesResponse>();
    assertAssignable<ListSendBatchesResponse, OpenApiListSendBatchesResponse>();
    assertAssignable<OpenApiMessageSummary, MessageSummary>();
    assertAssignable<MessageSummary, OpenApiMessageSummary>();
    assertAssignable<OpenApiSendBatchDetail, SendBatchDetail>();
    assertAssignable<SendBatchDetail, OpenApiSendBatchDetail>();
    assertAssignable<OpenApiResendReadinessResponse, ResendReadinessResponse>();
    assertAssignable<ResendReadinessResponse, OpenApiResendReadinessResponse>();
    assertAssignable<
      OpenApiWebhookAcknowledgement,
      WhatsappWebhookAcknowledgement
    >();
    assertAssignable<
      WhatsappWebhookAcknowledgement,
      OpenApiWebhookAcknowledgement
    >();
  });

  it("keeps template-purpose contracts aligned", () => {
    assertAssignable<
      OpenApiCreateInvitationTemplate,
      CreateInvitationTemplateInput
    >();
    assertAssignable<
      CreateInvitationTemplateInput,
      OpenApiCreateInvitationTemplate
    >();
    assertAssignable<OpenApiInvitationTemplate, InvitationTemplate>();
    assertAssignable<InvitationTemplate, OpenApiInvitationTemplate>();
  });

  it("keeps Stage 8 reminder contracts aligned", () => {
    assertAssignable<
      OpenApiReminderReadinessRequest,
      ReminderReadinessRequest
    >();
    assertAssignable<
      ReminderReadinessRequest,
      OpenApiReminderReadinessRequest
    >();
    assertAssignable<
      OpenApiReminderReadinessResponse,
      ReminderReadinessResponse
    >();
    assertAssignable<
      ReminderReadinessResponse,
      OpenApiReminderReadinessResponse
    >();
    assertAssignable<OpenApiSendReminders, SendRemindersInput>();
    assertAssignable<SendRemindersInput, OpenApiSendReminders>();
    assertAssignable<OpenApiReminderRule, ReminderRule>();
    assertAssignable<ReminderRule, OpenApiReminderRule>();
    assertAssignable<OpenApiCreateReminderRule, CreateReminderRuleInput>();
    assertAssignable<CreateReminderRuleInput, OpenApiCreateReminderRule>();
    assertAssignable<OpenApiUpdateReminderRule, UpdateReminderRuleInput>();
    assertAssignable<UpdateReminderRuleInput, OpenApiUpdateReminderRule>();
    assertAssignable<OpenApiReminderRun, ReminderRun>();
    assertAssignable<ReminderRun, OpenApiReminderRun>();
    assertAssignable<OpenApiReminderRunDetail, ReminderRunDetail>();
    assertAssignable<ReminderRunDetail, OpenApiReminderRunDetail>();
    assertAssignable<
      OpenApiListReminderRunsResponse,
      ListReminderRunsResponse
    >();
    assertAssignable<
      ListReminderRunsResponse,
      OpenApiListReminderRunsResponse
    >();
  });

  it("keeps Stage 8 collaboration contracts aligned", () => {
    assertAssignable<OpenApiTeamMember, TeamMember>();
    assertAssignable<TeamMember, OpenApiTeamMember>();
    assertAssignable<OpenApiTeamInvitation, TeamInvitation>();
    assertAssignable<TeamInvitation, OpenApiTeamInvitation>();
    assertAssignable<OpenApiTeamOverview, TeamOverview>();
    assertAssignable<TeamOverview, OpenApiTeamOverview>();
    assertAssignable<OpenApiCreateTeamInvitation, CreateTeamInvitationInput>();
    assertAssignable<CreateTeamInvitationInput, OpenApiCreateTeamInvitation>();
    assertAssignable<
      OpenApiTeamInvitationCredential,
      TeamInvitationCredential
    >();
    assertAssignable<
      TeamInvitationCredential,
      OpenApiTeamInvitationCredential
    >();
    assertAssignable<OpenApiUpdateTeamMember, UpdateTeamMemberInput>();
    assertAssignable<UpdateTeamMemberInput, OpenApiUpdateTeamMember>();
    assertAssignable<OpenApiAcceptTeamInvitation, AcceptTeamInvitationInput>();
    assertAssignable<AcceptTeamInvitationInput, OpenApiAcceptTeamInvitation>();
    assertAssignable<
      OpenApiAcceptTeamInvitationResult,
      AcceptTeamInvitationResult
    >();
    assertAssignable<
      AcceptTeamInvitationResult,
      OpenApiAcceptTeamInvitationResult
    >();
  });

  it("keeps Stage 9 reporting and export contracts aligned", () => {
    assertAssignable<OpenApiPlatformMetadata, PlatformMetadata>();
    assertAssignable<PlatformMetadata, OpenApiPlatformMetadata>();
    assertAssignable<OpenApiEventReport, EventReport>();
    assertAssignable<EventReport, OpenApiEventReport>();
    assertAssignable<OpenApiCreateExport, CreateExportInput>();
    assertAssignable<CreateExportInput, OpenApiCreateExport>();
    assertAssignable<OpenApiExportJob, ExportJob>();
    assertAssignable<ExportJob, OpenApiExportJob>();
    assertAssignable<OpenApiListExportJobsResponse, ListExportJobsResponse>();
    assertAssignable<ListExportJobsResponse, OpenApiListExportJobsResponse>();
  });

  it("keeps Stage 9 check-in contracts aligned", () => {
    assertAssignable<OpenApiPublicEntryPass, PublicEntryPass>();
    assertAssignable<PublicEntryPass, OpenApiPublicEntryPass>();
    assertAssignable<OpenApiResolveEntryPass, ResolveEntryPassInput>();
    assertAssignable<ResolveEntryPassInput, OpenApiResolveEntryPass>();
    assertAssignable<OpenApiCheckInParty, CheckInParty>();
    assertAssignable<CheckInParty, OpenApiCheckInParty>();
    assertAssignable<OpenApiResolvedEntryPass, ResolvedEntryPass>();
    assertAssignable<ResolvedEntryPass, OpenApiResolvedEntryPass>();
    assertAssignable<
      OpenApiSearchCheckInPartiesResponse,
      SearchCheckInPartiesResponse
    >();
    assertAssignable<
      SearchCheckInPartiesResponse,
      OpenApiSearchCheckInPartiesResponse
    >();
    assertAssignable<OpenApiCreateCheckIn, CreateCheckInInput>();
    assertAssignable<CreateCheckInInput, OpenApiCreateCheckIn>();
    assertAssignable<OpenApiCheckInResult, CheckInResult>();
    assertAssignable<CheckInResult, OpenApiCheckInResult>();
    assertAssignable<OpenApiCheckInDashboard, CheckInDashboard>();
    assertAssignable<CheckInDashboard, OpenApiCheckInDashboard>();
  });

  it("keeps Stage 9 credit contracts aligned", () => {
    assertAssignable<OpenApiCreditReconciliation, CreditReconciliation>();
    assertAssignable<CreditReconciliation, OpenApiCreditReconciliation>();
    assertAssignable<OpenApiCreditOverview, CreditOverview>();
    assertAssignable<CreditOverview, OpenApiCreditOverview>();
    assertAssignable<OpenApiCreditLedgerEntry, CreditLedgerEntry>();
    assertAssignable<CreditLedgerEntry, OpenApiCreditLedgerEntry>();
    assertAssignable<
      OpenApiListCreditLedgerResponse,
      ListCreditLedgerResponse
    >();
    assertAssignable<
      ListCreditLedgerResponse,
      OpenApiListCreditLedgerResponse
    >();
  });

  it("keeps Stage 8 notification contracts aligned", () => {
    assertAssignable<OpenApiNotification, Notification>();
    assertAssignable<Notification, OpenApiNotification>();
    assertAssignable<
      OpenApiListNotificationsResponse,
      ListNotificationsResponse
    >();
    assertAssignable<
      ListNotificationsResponse,
      OpenApiListNotificationsResponse
    >();
  });
});
