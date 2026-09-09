import {
  InvitationInvariantError,
  validateInvitationAggregate,
} from "./invitation";
import { normalizePhoneNumber, PhoneNormalizationError } from "./phone";
import {
  InvitationType,
  type InvitationType as InvitationTypeValue,
} from "./types";

/**
 * Locales supported by invitation content. These are transport/UI locale tags;
 * persistence layers may map them to their own enum representation.
 */
export const InvitationContentLocale = {
  AR_SA: "ar-SA",
  EN: "en",
} as const;

export type InvitationContentLocale =
  (typeof InvitationContentLocale)[keyof typeof InvitationContentLocale];

/**
 * Stable, language-neutral keys allowed inside invitation message templates.
 * User-facing editors can localize their labels without changing these keys.
 */
export const ALLOWED_MESSAGE_VARIABLES = [
  "guest_name",
  "event_name",
  "event_date",
  "event_time",
  "venue",
  "allowed_companions",
] as const;

export type MessageVariable = (typeof ALLOWED_MESSAGE_VARIABLES)[number];
export type MessageVariableValues = Partial<
  Readonly<Record<MessageVariable, string>>
>;

const allowedMessageVariables = new Set<string>(ALLOWED_MESSAGE_VARIABLES);
const placeholderNamePattern = /^[a-z][a-z0-9_]*$/;
const placeholderPattern = /\{\{([a-z][a-z0-9_]*)\}\}/g;

export const MessageTemplateIssueCode = {
  MALFORMED_PLACEHOLDER: "MALFORMED_PLACEHOLDER",
  UNKNOWN_VARIABLE: "UNKNOWN_VARIABLE",
} as const;

export type MessageTemplateIssueCode =
  (typeof MessageTemplateIssueCode)[keyof typeof MessageTemplateIssueCode];

export interface MessageTemplateValidationIssue {
  code: MessageTemplateIssueCode;
  index: number;
  placeholder: string;
  variable?: string;
  message: string;
}

export interface MessageTemplateValidationResult {
  valid: boolean;
  /** Unique variables in first-use order. */
  variables: readonly MessageVariable[];
  issues: readonly MessageTemplateValidationIssue[];
}

export const InvitationPreparationErrorCode = {
  MESSAGE_TEMPLATE_INVALID: "MESSAGE_TEMPLATE_INVALID",
  MESSAGE_VARIABLE_VALUE_MISSING: "MESSAGE_VARIABLE_VALUE_MISSING",
  INVITATION_MEMBER_NAME_REQUIRED: "INVITATION_MEMBER_NAME_REQUIRED",
  INVITATION_LOCALE_UNSUPPORTED: "INVITATION_LOCALE_UNSUPPORTED",
  INVITATION_NOT_READY: "INVITATION_NOT_READY",
  SNAPSHOT_NOT_SERIALIZABLE: "SNAPSHOT_NOT_SERIALIZABLE",
} as const;

export type InvitationPreparationErrorCode =
  (typeof InvitationPreparationErrorCode)[keyof typeof InvitationPreparationErrorCode];

export class InvitationPreparationError extends Error {
  public constructor(
    public readonly code: InvitationPreparationErrorCode,
    message: string,
    public readonly details: readonly unknown[] = [],
  ) {
    super(message);
    this.name = "InvitationPreparationError";
  }
}

export function messageVariablePlaceholder(variable: MessageVariable): string {
  return `{{${variable}}}`;
}

/**
 * Validates the canonical `{{variable_name}}` syntax without evaluating or
 * executing template content. Single braces remain ordinary message text.
 */
export function validateMessageTemplate(
  template: string,
): MessageTemplateValidationResult {
  const issues: MessageTemplateValidationIssue[] = [];
  const variables: MessageVariable[] = [];
  const seenVariables = new Set<MessageVariable>();
  let cursor = 0;

  while (cursor < template.length) {
    const openingIndex = template.indexOf("{{", cursor);
    const closingIndex = template.indexOf("}}", cursor);

    if (
      closingIndex >= 0 &&
      (openingIndex < 0 || closingIndex < openingIndex)
    ) {
      issues.push({
        code: MessageTemplateIssueCode.MALFORMED_PLACEHOLDER,
        index: closingIndex,
        placeholder: "}}",
        message:
          "A closing placeholder delimiter has no matching opening delimiter.",
      });
      cursor = closingIndex + 2;
      continue;
    }

    if (openingIndex < 0) break;

    const endIndex = template.indexOf("}}", openingIndex + 2);
    if (endIndex < 0) {
      issues.push({
        code: MessageTemplateIssueCode.MALFORMED_PLACEHOLDER,
        index: openingIndex,
        placeholder: template.slice(openingIndex),
        message:
          "An opening placeholder delimiter has no matching closing delimiter.",
      });
      break;
    }

    const placeholder = template.slice(openingIndex, endIndex + 2);
    const variable = template.slice(openingIndex + 2, endIndex);
    if (
      !placeholderNamePattern.test(variable) ||
      variable.includes("{") ||
      variable.includes("}")
    ) {
      issues.push({
        code: MessageTemplateIssueCode.MALFORMED_PLACEHOLDER,
        index: openingIndex,
        placeholder,
        ...(variable ? { variable } : {}),
        message:
          "Placeholders must use the exact {{variable_name}} format without spaces or nesting.",
      });
    } else if (!allowedMessageVariables.has(variable)) {
      issues.push({
        code: MessageTemplateIssueCode.UNKNOWN_VARIABLE,
        index: openingIndex,
        placeholder,
        variable,
        message: `The message variable "${variable}" is not allowed.`,
      });
    } else {
      const allowedVariable = variable as MessageVariable;
      if (!seenVariables.has(allowedVariable)) {
        variables.push(allowedVariable);
        seenVariables.add(allowedVariable);
      }
    }

    cursor = endIndex + 2;
  }

  return { valid: issues.length === 0, variables, issues };
}

/**
 * Renders a validated plain-text template in one pass. Replacement text is
 * inserted literally: `$` sequences and placeholder-looking text inside a
 * value are never interpreted or expanded recursively.
 */
export function renderMessageTemplate(
  template: string,
  values: MessageVariableValues,
): string {
  const validation = validateMessageTemplate(template);
  if (!validation.valid) {
    throw new InvitationPreparationError(
      InvitationPreparationErrorCode.MESSAGE_TEMPLATE_INVALID,
      "The invitation message template contains invalid placeholders.",
      validation.issues,
    );
  }

  const missingVariables = validation.variables.filter(
    (variable) => typeof values[variable] !== "string",
  );
  if (missingVariables.length > 0) {
    throw new InvitationPreparationError(
      InvitationPreparationErrorCode.MESSAGE_VARIABLE_VALUE_MISSING,
      `Missing values for message variables: ${missingVariables.join(", ")}.`,
      missingVariables,
    );
  }

  return template.replace(
    placeholderPattern,
    (_placeholder, variable: string) => values[variable as MessageVariable]!,
  );
}

export interface InvitationPreparationMember {
  name: string;
  isPrimary: boolean;
}

export interface InvitationPresentationInput {
  invitationType: InvitationTypeValue;
  locale: InvitationContentLocale;
  members: readonly InvitationPreparationMember[];
  maxCompanions: number;
}

export const InvitationReplyIntent = {
  ATTEND: "ATTEND",
  DECLINE: "DECLINE",
  SELECT_NAMED_MEMBERS: "SELECT_NAMED_MEMBERS",
} as const;

export type InvitationReplyIntent =
  (typeof InvitationReplyIntent)[keyof typeof InvitationReplyIntent];

export interface InvitationReplyAction {
  /** Stable action identifier suitable for snapshots and provider mapping. */
  id: string;
  label: string;
  intent: InvitationReplyIntent;
  attendingMemberCount: number | null;
  companionCount: number | null;
  expectedAttendeeCount: number | null;
}

export interface InvitationPresentation {
  scope: string;
  replyActions: readonly InvitationReplyAction[];
}

/**
 * Produces the invitation-type-specific sentence and response choices used by
 * both the host preview and, later, provider adapters. It intentionally has no
 * provider-specific button limits; those belong to the messaging adapter.
 */
export function createInvitationPresentation(
  input: InvitationPresentationInput,
): InvitationPresentation {
  assertSupportedLocale(input.locale);
  validateInvitationAggregate({
    invitationType: input.invitationType,
    members: input.members,
    maxCompanions: input.maxCompanions,
  });
  assertMemberNames(input.members);

  if (input.invitationType === InvitationType.SINGLE) {
    return {
      scope:
        input.locale === InvitationContentLocale.AR_SA
          ? "هذه الدعوة خاصة بك."
          : "This invitation is for you.",
      replyActions: [
        directReply(
          "ATTEND",
          input.locale === InvitationContentLocale.AR_SA
            ? "سأحضر"
            : "I will attend",
          InvitationReplyIntent.ATTEND,
          1,
          0,
        ),
        directReply(
          "DECLINE",
          input.locale === InvitationContentLocale.AR_SA ? "أعتذر" : "Decline",
          InvitationReplyIntent.DECLINE,
          0,
          0,
        ),
      ],
    };
  }

  if (input.invitationType === InvitationType.NAMED_GROUP) {
    const memberNames = input.members.map((member) => member.name.trim());
    const memberCount = memberNames.length;
    return {
      scope: namedGroupScope(input.locale, memberNames),
      replyActions: [
        directReply(
          "ATTEND_ALL",
          input.locale === InvitationContentLocale.AR_SA
            ? "سيحضر الجميع"
            : "Everyone attending",
          InvitationReplyIntent.ATTEND,
          memberCount,
          0,
        ),
        {
          id: "SELECT_MEMBERS",
          label:
            input.locale === InvitationContentLocale.AR_SA
              ? "اختيار الحاضرين"
              : "Select attendees",
          intent: InvitationReplyIntent.SELECT_NAMED_MEMBERS,
          attendingMemberCount: null,
          companionCount: null,
          expectedAttendeeCount: null,
        },
        directReply(
          "DECLINE_ALL",
          input.locale === InvitationContentLocale.AR_SA
            ? "يعتذر الجميع"
            : "Everyone declines",
          InvitationReplyIntent.DECLINE,
          0,
          0,
        ),
      ],
    };
  }

  const replies: InvitationReplyAction[] = [];
  for (
    let companionCount = 0;
    companionCount <= input.maxCompanions;
    companionCount += 1
  ) {
    replies.push(
      directReply(
        `ATTEND_WITH_${companionCount}_COMPANIONS`,
        companionReplyLabel(input.locale, companionCount),
        InvitationReplyIntent.ATTEND,
        1,
        companionCount,
      ),
    );
  }
  replies.push(
    directReply(
      "DECLINE",
      input.locale === InvitationContentLocale.AR_SA ? "أعتذر" : "Decline",
      InvitationReplyIntent.DECLINE,
      0,
      0,
    ),
  );

  return {
    scope: companionScope(input.locale, input.maxCompanions),
    replyActions: replies,
  };
}

export interface InvitationReadinessEventInput {
  id: string;
  name: string | null | undefined;
  date: string | null | undefined;
  time: string | null | undefined;
  venue: string | null | undefined;
}

export interface InvitationReadinessInvitationInput {
  id: string;
  displayName: string | null | undefined;
  phoneE164: string | null | undefined;
  invitationType: InvitationTypeValue;
  members: readonly InvitationPreparationMember[];
  maxCompanions: number;
  cancelled: boolean;
}

export interface InvitationReadinessTemplateInput {
  id: string;
  locale: InvitationContentLocale;
  body: string;
  approved: boolean;
}

export interface InvitationReadinessInput {
  event: InvitationReadinessEventInput;
  invitation: InvitationReadinessInvitationInput;
  template: InvitationReadinessTemplateInput | null;
}

export const InvitationReadinessIssueCode = {
  EVENT_ID_MISSING: "EVENT_ID_MISSING",
  EVENT_NAME_MISSING: "EVENT_NAME_MISSING",
  EVENT_DATE_MISSING: "EVENT_DATE_MISSING",
  EVENT_TIME_MISSING: "EVENT_TIME_MISSING",
  EVENT_VENUE_MISSING: "EVENT_VENUE_MISSING",
  INVITATION_ID_MISSING: "INVITATION_ID_MISSING",
  INVITATION_CANCELLED: "INVITATION_CANCELLED",
  INVITATION_DISPLAY_NAME_MISSING: "INVITATION_DISPLAY_NAME_MISSING",
  INVITATION_PHONE_MISSING: "INVITATION_PHONE_MISSING",
  INVITATION_PHONE_INVALID: "INVITATION_PHONE_INVALID",
  INVITATION_PHONE_NOT_NORMALIZED: "INVITATION_PHONE_NOT_NORMALIZED",
  INVITATION_TYPE_UNSUPPORTED: "INVITATION_TYPE_UNSUPPORTED",
  INVITATION_STRUCTURE_INVALID: "INVITATION_STRUCTURE_INVALID",
  INVITATION_MEMBER_NAME_MISSING: "INVITATION_MEMBER_NAME_MISSING",
  TEMPLATE_MISSING: "TEMPLATE_MISSING",
  TEMPLATE_ID_MISSING: "TEMPLATE_ID_MISSING",
  TEMPLATE_LOCALE_UNSUPPORTED: "TEMPLATE_LOCALE_UNSUPPORTED",
  TEMPLATE_NOT_APPROVED: "TEMPLATE_NOT_APPROVED",
  TEMPLATE_BODY_MISSING: "TEMPLATE_BODY_MISSING",
  TEMPLATE_PLACEHOLDER_MALFORMED: "TEMPLATE_PLACEHOLDER_MALFORMED",
  TEMPLATE_VARIABLE_NOT_ALLOWED: "TEMPLATE_VARIABLE_NOT_ALLOWED",
  TEMPLATE_VARIABLE_VALUE_MISSING: "TEMPLATE_VARIABLE_VALUE_MISSING",
} as const;

export type InvitationReadinessIssueCode =
  (typeof InvitationReadinessIssueCode)[keyof typeof InvitationReadinessIssueCode];

export interface InvitationReadinessIssue {
  code: InvitationReadinessIssueCode;
  source: "EVENT" | "INVITATION" | "TEMPLATE";
  path: string;
  message: string;
  variable?: string;
  detailCode?: string;
}

export interface InvitationReadinessResult {
  ready: boolean;
  issues: readonly InvitationReadinessIssue[];
}

/**
 * Computes every actionable readiness problem in a fixed order. It does not
 * mutate, persist, or infer data from the client, so an API can safely rerun it
 * immediately before queueing in a later stage.
 */
export function computeInvitationReadiness(
  input: InvitationReadinessInput,
): InvitationReadinessResult {
  const issues: InvitationReadinessIssue[] = [];
  requireText(
    input.event.id,
    InvitationReadinessIssueCode.EVENT_ID_MISSING,
    "EVENT",
    "event.id",
    "The event identifier is missing.",
    issues,
  );
  requireText(
    input.event.name,
    InvitationReadinessIssueCode.EVENT_NAME_MISSING,
    "EVENT",
    "event.name",
    "The event name is missing.",
    issues,
  );
  requireText(
    input.event.date,
    InvitationReadinessIssueCode.EVENT_DATE_MISSING,
    "EVENT",
    "event.date",
    "The event date is missing.",
    issues,
  );
  requireText(
    input.event.time,
    InvitationReadinessIssueCode.EVENT_TIME_MISSING,
    "EVENT",
    "event.time",
    "The event time is missing.",
    issues,
  );
  requireText(
    input.event.venue,
    InvitationReadinessIssueCode.EVENT_VENUE_MISSING,
    "EVENT",
    "event.venue",
    "The event venue is missing.",
    issues,
  );

  requireText(
    input.invitation.id,
    InvitationReadinessIssueCode.INVITATION_ID_MISSING,
    "INVITATION",
    "invitation.id",
    "The invitation identifier is missing.",
    issues,
  );
  if (input.invitation.cancelled) {
    issues.push({
      code: InvitationReadinessIssueCode.INVITATION_CANCELLED,
      source: "INVITATION",
      path: "invitation.cancelled",
      message: "A cancelled invitation cannot be prepared for sending.",
    });
  }
  requireText(
    input.invitation.displayName,
    InvitationReadinessIssueCode.INVITATION_DISPLAY_NAME_MISSING,
    "INVITATION",
    "invitation.displayName",
    "The invitation recipient name is missing.",
    issues,
  );
  validateReadinessPhone(input.invitation.phoneE164, issues);

  if (!isInvitationType(input.invitation.invitationType)) {
    issues.push({
      code: InvitationReadinessIssueCode.INVITATION_TYPE_UNSUPPORTED,
      source: "INVITATION",
      path: "invitation.invitationType",
      message: "The invitation type is not supported.",
    });
  } else {
    try {
      validateInvitationAggregate({
        invitationType: input.invitation.invitationType,
        members: input.invitation.members,
        maxCompanions: input.invitation.maxCompanions,
      });
    } catch (error) {
      issues.push({
        code: InvitationReadinessIssueCode.INVITATION_STRUCTURE_INVALID,
        source: "INVITATION",
        path: "invitation",
        message: "The invitation member and companion structure is invalid.",
        ...(error instanceof InvitationInvariantError
          ? { detailCode: error.code }
          : {}),
      });
    }
  }

  input.invitation.members.forEach((member, index) => {
    if (!hasText(member.name)) {
      issues.push({
        code: InvitationReadinessIssueCode.INVITATION_MEMBER_NAME_MISSING,
        source: "INVITATION",
        path: `invitation.members.${index}.name`,
        message: "Every named invitation member requires a name.",
      });
    }
  });

  if (!input.template) {
    issues.push({
      code: InvitationReadinessIssueCode.TEMPLATE_MISSING,
      source: "TEMPLATE",
      path: "template",
      message: "An invitation template must be selected.",
    });
    return { ready: false, issues };
  }

  requireText(
    input.template.id,
    InvitationReadinessIssueCode.TEMPLATE_ID_MISSING,
    "TEMPLATE",
    "template.id",
    "The invitation template identifier is missing.",
    issues,
  );

  const localeSupported = isInvitationContentLocale(input.template.locale);
  if (!localeSupported) {
    issues.push({
      code: InvitationReadinessIssueCode.TEMPLATE_LOCALE_UNSUPPORTED,
      source: "TEMPLATE",
      path: "template.locale",
      message: "The invitation template locale is not supported.",
    });
  }
  if (!input.template.approved) {
    issues.push({
      code: InvitationReadinessIssueCode.TEMPLATE_NOT_APPROVED,
      source: "TEMPLATE",
      path: "template.approved",
      message: "The invitation template is not approved.",
    });
  }

  if (!hasText(input.template.body)) {
    issues.push({
      code: InvitationReadinessIssueCode.TEMPLATE_BODY_MISSING,
      source: "TEMPLATE",
      path: "template.body",
      message: "The invitation template body is empty.",
    });
    return { ready: false, issues };
  }

  const templateValidation = validateMessageTemplate(input.template.body);
  for (const issue of templateValidation.issues) {
    issues.push({
      code:
        issue.code === MessageTemplateIssueCode.UNKNOWN_VARIABLE
          ? InvitationReadinessIssueCode.TEMPLATE_VARIABLE_NOT_ALLOWED
          : InvitationReadinessIssueCode.TEMPLATE_PLACEHOLDER_MALFORMED,
      source: "TEMPLATE",
      path: `template.body.${issue.index}`,
      message: issue.message,
      ...(issue.variable ? { variable: issue.variable } : {}),
    });
  }

  if (localeSupported) {
    const values = createMessageVariableValues(input, input.template.locale);
    for (const variable of templateValidation.variables) {
      if (typeof values[variable] !== "string") {
        issues.push({
          code: InvitationReadinessIssueCode.TEMPLATE_VARIABLE_VALUE_MISSING,
          source: "TEMPLATE",
          path: `template.variables.${variable}`,
          variable,
          message: `The message variable "${variable}" has no value.`,
        });
      }
    }
  }

  return { ready: issues.length === 0, issues };
}

export const INVITATION_CONTENT_SNAPSHOT_VERSION = 1 as const;

export interface InvitationContentSnapshot {
  version: typeof INVITATION_CONTENT_SNAPSHOT_VERSION;
  eventId: string;
  invitationId: string;
  templateId: string;
  locale: InvitationContentLocale;
  invitationType: InvitationTypeValue;
  recipientName: string;
  memberNames: readonly string[];
  maxCompanions: number;
  templateBody: string;
  variables: Readonly<Partial<Record<MessageVariable, string>>>;
  renderedBody: string;
  scope: string;
  replyActions: readonly InvitationReplyAction[];
}

/** Builds an immutable-content payload only after all readiness rules pass. */
export function createInvitationContentSnapshot(
  input: InvitationReadinessInput,
): InvitationContentSnapshot {
  const readiness = computeInvitationReadiness(input);
  if (!readiness.ready || !input.template) {
    throw new InvitationPreparationError(
      InvitationPreparationErrorCode.INVITATION_NOT_READY,
      "Invitation content cannot be snapshotted until all readiness issues are resolved.",
      readiness.issues,
    );
  }

  const template = input.template;
  const values = createMessageVariableValues(input, template.locale);
  const referencedVariables = validateMessageTemplate(template.body).variables;
  const snapshottedVariables: Partial<Record<MessageVariable, string>> = {};
  for (const variable of ALLOWED_MESSAGE_VARIABLES) {
    if (!referencedVariables.includes(variable)) continue;
    snapshottedVariables[variable] = values[variable]!;
  }

  const presentation = createInvitationPresentation({
    invitationType: input.invitation.invitationType,
    locale: template.locale,
    members: input.invitation.members,
    maxCompanions: input.invitation.maxCompanions,
  });

  return {
    version: INVITATION_CONTENT_SNAPSHOT_VERSION,
    eventId: input.event.id.trim(),
    invitationId: input.invitation.id.trim(),
    templateId: template.id.trim(),
    locale: template.locale,
    invitationType: input.invitation.invitationType,
    recipientName: input.invitation.displayName!.trim(),
    memberNames: input.invitation.members.map((member) => member.name.trim()),
    maxCompanions: input.invitation.maxCompanions,
    templateBody: template.body,
    variables: snapshottedVariables,
    renderedBody: renderMessageTemplate(template.body, values),
    scope: presentation.scope,
    replyActions: presentation.replyActions,
  };
}

/**
 * Produces canonical JSON bytes for a content digest. The application layer may
 * hash this string with its platform crypto; this package stays runtime-neutral.
 */
export function invitationContentDigestInput(
  snapshot: InvitationContentSnapshot,
): string {
  return stableSerialize(snapshot);
}

function createMessageVariableValues(
  input: InvitationReadinessInput,
  locale: InvitationContentLocale,
): MessageVariableValues {
  const values: Partial<Record<MessageVariable, string>> = {};
  assignText(values, "guest_name", input.invitation.displayName);
  assignText(values, "event_name", input.event.name);
  assignText(values, "event_date", input.event.date);
  assignText(values, "event_time", input.event.time);
  assignText(values, "venue", input.event.venue);
  if (
    Number.isInteger(input.invitation.maxCompanions) &&
    input.invitation.maxCompanions >= 0
  ) {
    values.allowed_companions = formatLocalizedInteger(
      input.invitation.maxCompanions,
      locale,
    );
  }
  return values;
}

function assignText(
  values: Partial<Record<MessageVariable, string>>,
  variable: MessageVariable,
  value: string | null | undefined,
): void {
  if (hasText(value)) values[variable] = value.trim();
}

function directReply(
  id: string,
  label: string,
  intent: InvitationReplyIntent,
  attendingMemberCount: number,
  companionCount: number,
): InvitationReplyAction {
  return {
    id,
    label,
    intent,
    attendingMemberCount,
    companionCount,
    expectedAttendeeCount: attendingMemberCount + companionCount,
  };
}

function namedGroupScope(
  locale: InvitationContentLocale,
  memberNames: readonly string[],
): string {
  const count = memberNames.length;
  const names = memberNames.join(
    locale === InvitationContentLocale.AR_SA ? "، " : ", ",
  );
  if (locale === InvitationContentLocale.EN) {
    const unit = count === 1 ? "person" : "people";
    return `This invitation includes ${count} ${unit}: ${names}.`;
  }

  const localizedCount = formatLocalizedInteger(count, locale);
  const countPhrase =
    count === 1
      ? "شخصًا واحدًا"
      : count === 2
        ? "شخصين"
        : count >= 3 && count <= 10
          ? `${localizedCount} أشخاص`
          : `${localizedCount} شخصًا`;
  return `هذه الدعوة تشمل ${countPhrase}: ${names}.`;
}

function companionScope(
  locale: InvitationContentLocale,
  maxCompanions: number,
): string {
  if (locale === InvitationContentLocale.EN) {
    if (maxCompanions === 0) return "This invitation is for you.";
    return `This invitation is for you and up to ${maxCompanions} ${
      maxCompanions === 1 ? "companion" : "companions"
    }.`;
  }

  if (maxCompanions === 0) return "هذه الدعوة خاصة بك.";
  if (maxCompanions === 1) return "هذه الدعوة لك ولمرافق واحد على الأكثر.";
  if (maxCompanions === 2) return "هذه الدعوة لك ولمرافقَين اثنين على الأكثر.";
  return `هذه الدعوة لك ولـ${formatLocalizedInteger(maxCompanions, locale)} مرافقين على الأكثر.`;
}

function companionReplyLabel(
  locale: InvitationContentLocale,
  companionCount: number,
): string {
  if (companionCount === 0) {
    return locale === InvitationContentLocale.AR_SA ? "أنا فقط" : "Me only";
  }
  return locale === InvitationContentLocale.AR_SA
    ? `أنا + ${formatLocalizedInteger(companionCount, locale)}`
    : `Me + ${companionCount}`;
}

function assertMemberNames(
  members: readonly InvitationPreparationMember[],
): void {
  const missingIndexes = members.flatMap((member, index) =>
    hasText(member.name) ? [] : [index],
  );
  if (missingIndexes.length > 0) {
    throw new InvitationPreparationError(
      InvitationPreparationErrorCode.INVITATION_MEMBER_NAME_REQUIRED,
      "Every named invitation member requires a name.",
      missingIndexes,
    );
  }
}

function assertSupportedLocale(
  locale: InvitationContentLocale,
): asserts locale is InvitationContentLocale {
  if (!isInvitationContentLocale(locale)) {
    throw new InvitationPreparationError(
      InvitationPreparationErrorCode.INVITATION_LOCALE_UNSUPPORTED,
      "The invitation content locale is not supported.",
    );
  }
}

function isInvitationContentLocale(
  locale: unknown,
): locale is InvitationContentLocale {
  return (
    locale === InvitationContentLocale.AR_SA ||
    locale === InvitationContentLocale.EN
  );
}

function isInvitationType(value: unknown): value is InvitationTypeValue {
  return (
    value === InvitationType.SINGLE ||
    value === InvitationType.NAMED_GROUP ||
    value === InvitationType.PRIMARY_WITH_COMPANIONS
  );
}

function validateReadinessPhone(
  phoneE164: string | null | undefined,
  issues: InvitationReadinessIssue[],
): void {
  if (!hasText(phoneE164)) {
    issues.push({
      code: InvitationReadinessIssueCode.INVITATION_PHONE_MISSING,
      source: "INVITATION",
      path: "invitation.phoneE164",
      message: "The invitation contact phone number is missing.",
    });
    return;
  }

  const phone = phoneE164.trim();
  try {
    const normalized = normalizePhoneNumber(phone);
    if (normalized.e164 !== phone) {
      issues.push({
        code: InvitationReadinessIssueCode.INVITATION_PHONE_NOT_NORMALIZED,
        source: "INVITATION",
        path: "invitation.phoneE164",
        message:
          "The invitation contact phone number must be stored in E.164 format.",
      });
    }
  } catch (error) {
    issues.push({
      code: InvitationReadinessIssueCode.INVITATION_PHONE_INVALID,
      source: "INVITATION",
      path: "invitation.phoneE164",
      message: "The invitation contact phone number is invalid.",
      ...(error instanceof PhoneNormalizationError
        ? { detailCode: error.code }
        : {}),
    });
  }
}

function requireText(
  value: string | null | undefined,
  code: InvitationReadinessIssueCode,
  source: InvitationReadinessIssue["source"],
  path: string,
  message: string,
  issues: InvitationReadinessIssue[],
): void {
  if (!hasText(value)) issues.push({ code, source, path, message });
}

function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function formatLocalizedInteger(
  value: number,
  locale: InvitationContentLocale,
): string {
  if (locale === InvitationContentLocale.EN) return String(value);
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
  return String(value).replace(
    /\d/g,
    (digit) => arabicDigits[Number(digit)] ?? digit,
  );
}

function stableSerialize(value: unknown): string {
  const ancestors = new Set<object>();

  const serialize = (current: unknown): string => {
    if (current === null) return "null";
    if (typeof current === "string" || typeof current === "boolean") {
      return JSON.stringify(current);
    }
    if (typeof current === "number") {
      if (Number.isFinite(current)) return JSON.stringify(current);
      throw snapshotSerializationError("Snapshot numbers must be finite.");
    }
    if (typeof current !== "object") {
      throw snapshotSerializationError(
        "Snapshot values must be JSON-serializable and cannot be undefined.",
      );
    }
    if (ancestors.has(current)) {
      throw snapshotSerializationError(
        "Snapshot values cannot contain cycles.",
      );
    }

    ancestors.add(current);
    try {
      if (Array.isArray(current)) {
        return `[${current.map((entry) => serialize(entry)).join(",")}]`;
      }

      const record = current as Record<string, unknown>;
      const fields = Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${serialize(record[key])}`);
      return `{${fields.join(",")}}`;
    } finally {
      ancestors.delete(current);
    }
  };

  return serialize(value);
}

function snapshotSerializationError(
  message: string,
): InvitationPreparationError {
  return new InvitationPreparationError(
    InvitationPreparationErrorCode.SNAPSHOT_NOT_SERIALIZABLE,
    message,
  );
}
