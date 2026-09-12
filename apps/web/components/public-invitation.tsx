"use client";

import type {
  PublicInvitation,
  RsvpResult,
  SubmitRsvpInput,
} from "@dawah/api-contract";
import {
  Button,
  Checkbox,
  ChoiceCard,
  GuestShell,
  Icon,
  Stepper,
} from "@dawah/ui";
import React, { useEffect, useRef, useState } from "react";
import type { AppLocale } from "../i18n/config";
import type { Dictionary } from "../i18n/dictionaries";

type Copy = Dictionary["publicInvitation"];
type CurrentRsvp = NonNullable<PublicInvitation["currentRsvp"]>;
type SubmitRsvp = (
  token: string,
  locale: AppLocale,
  input: SubmitRsvpInput,
) => Promise<RsvpResult>;
type LoadInvitation = (
  token: string,
  locale: AppLocale,
) => Promise<PublicInvitation>;

export interface PublicInvitationClientProps {
  copy: Copy;
  initialInvitation: PublicInvitation;
  loadInvitation: LoadInvitation;
  locale: AppLocale;
  submitRsvp: SubmitRsvp;
  token: string;
}

export function PublicInvitationClient({
  copy,
  initialInvitation,
  loadInvitation,
  locale,
  submitRsvp,
  token,
}: PublicInvitationClientProps) {
  const [invitation, setInvitation] = useState(initialInvitation);
  const [editing, setEditing] = useState(!initialInvitation.currentRsvp);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(() =>
    initialMemberSelection(initialInvitation),
  );
  const [companionCount, setCompanionCount] = useState<number | null>(() =>
    initialCompanionSelection(initialInvitation),
  );
  const [pendingAction, setPendingAction] = useState<
    "confirm" | "decline" | null
  >(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [linkUnavailable, setLinkUnavailable] = useState(false);
  const inFlightRef = useRef(false);
  const submissionRef = useRef<{ fingerprint: string; id: string } | null>(
    null,
  );
  const responseRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (notice) responseRef.current?.focus();
  }, [notice]);

  const members = [...invitation.invitation.members].sort(
    (left, right) => left.position - right.position,
  );
  const primaryMember =
    members.find((member) => member.isPrimary) ?? members[0];
  const currentRsvp = invitation.currentRsvp;
  const lifecycle = invitation.policy.lifecycleState;
  const canEdit =
    lifecycle === "OPEN" && Boolean(currentRsvp) && invitation.policy.canEdit;
  const canInitiallyRespond =
    lifecycle === "OPEN" && !currentRsvp && invitation.policy.canRespond;
  const showEditor = canInitiallyRespond || (canEdit && editing);
  const selectedIdsInOrder = members
    .filter((member) => selectedMemberIds.has(member.id))
    .map((member) => member.id);

  const resetEditor = (nextInvitation: PublicInvitation) => {
    setSelectedMemberIds(initialMemberSelection(nextInvitation));
    setCompanionCount(initialCompanionSelection(nextInvitation));
  };

  const beginEdit = () => {
    resetEditor(invitation);
    setErrorMessage(null);
    setNotice(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    resetEditor(invitation);
    setErrorMessage(null);
    setEditing(false);
  };

  const submitSelection = async (
    attendingMemberIds: readonly string[],
    companions: number,
    action: "confirm" | "decline",
  ) => {
    if (inFlightRef.current) return;
    const orderedMemberIds = members
      .filter((member) => attendingMemberIds.includes(member.id))
      .map((member) => member.id);
    const fingerprint = JSON.stringify({
      attendingMemberIds: orderedMemberIds,
      companionCount: companions,
    });
    const submission =
      submissionRef.current?.fingerprint === fingerprint
        ? submissionRef.current
        : { fingerprint, id: crypto.randomUUID() };
    submissionRef.current = submission;
    const input: SubmitRsvpInput = {
      attendingMemberIds: orderedMemberIds,
      companionCount: companions,
      submissionId: submission.id,
    };

    inFlightRef.current = true;
    setPendingAction(action);
    setErrorMessage(null);
    setNotice(null);
    try {
      const result = await submitRsvp(token, locale, input);
      let refreshed: PublicInvitation | null = null;
      try {
        refreshed = await loadInvitation(token, locale);
      } catch {
        // The committed RSVP remains authoritative even if this optional refresh
        // is interrupted. Reloading the capability will recover its edit policy.
      }
      const nextInvitation = refreshed ?? withRsvpResult(invitation, result);
      setInvitation(nextInvitation);
      resetEditor(nextInvitation);
      setEditing(false);
      setNotice(
        result.confirmationQueued
          ? copy.confirmationQueued
          : copy.responseSaved,
      );
      submissionRef.current = null;
    } catch (error) {
      const status = apiErrorStatus(error);
      if (status === 404) {
        setLinkUnavailable(true);
        setErrorMessage(null);
      } else if (status === 429) {
        setErrorMessage(copy.tooManyAttempts);
      } else if (status === 409) {
        submissionRef.current = null;
        setErrorMessage(copy.conflictError);
      } else {
        setErrorMessage(copy.submitError);
      }
    } finally {
      inFlightRef.current = false;
      setPendingAction(null);
    }
  };

  const footer = invitation.event.rsvpDeadline
    ? interpolate(copy.deadline, {
        date: formatDate(invitation.event.rsvpDeadline, locale),
      })
    : copy.privateLink;

  return (
    <div dir={locale === "ar-SA" ? "rtl" : "ltr"} lang={locale}>
      <GuestShell
        className="public-invitation"
        eyebrow={copy.eyebrow}
        footer={footer}
        subtitle={copy.invitationIntro}
        title={invitation.event.name}
      >
        <LanguageLink copy={copy} locale={locale} token={token} />
        <header className="public-invitation__identity">
          <h2>{invitation.invitation.displayName}</h2>
          <p>{invitationScope(invitation, copy, locale)}</p>
        </header>
        <EventDetails copy={copy} invitation={invitation} locale={locale} />

        {linkUnavailable ? (
          <StateCard
            copy={copy}
            description={copy.linkUnavailableDescription}
            icon="lock"
            title={copy.linkUnavailableTitle}
          />
        ) : lifecycle === "COMPLETED" ? (
          <StateCard
            copy={copy}
            description={copy.completedDescription}
            icon="sparkles"
            title={copy.completedTitle}
          />
        ) : lifecycle === "CLOSED" ? (
          <section className="public-invitation__state-card">
            <Icon name="lock" size={24} />
            <h2>{copy.closedTitle}</h2>
            {currentRsvp ? (
              <ResponseSummary
                copy={copy}
                currentRsvp={currentRsvp}
                invitation={invitation}
                locale={locale}
              />
            ) : (
              <p>{copy.closedWithoutResponse}</p>
            )}
          </section>
        ) : currentRsvp && !showEditor ? (
          <section
            aria-live="polite"
            className="public-invitation__response"
            ref={responseRef}
            tabIndex={-1}
          >
            <ResponseSummary
              copy={copy}
              currentRsvp={currentRsvp}
              invitation={invitation}
              locale={locale}
            />
            {notice ? (
              <p className="public-invitation__notice">{notice}</p>
            ) : null}
            {canEdit ? (
              <Button
                fullWidth
                icon="reply"
                onClick={beginEdit}
                size="guest"
                variant="guest-secondary"
              >
                {copy.changeResponse}
              </Button>
            ) : (
              <p className="public-invitation__hint">{copy.editsUnavailable}</p>
            )}
          </section>
        ) : showEditor ? (
          <RsvpEditor
            companionCount={companionCount}
            copy={copy}
            currentRsvp={currentRsvp}
            invitation={invitation}
            locale={locale}
            onCancel={currentRsvp ? cancelEdit : undefined}
            onCompanionCountChange={setCompanionCount}
            onMemberSelectionChange={setSelectedMemberIds}
            onSubmit={submitSelection}
            pendingAction={pendingAction}
            primaryMemberId={primaryMember?.id}
            selectedMemberIds={selectedMemberIds}
            selectedMemberIdsInOrder={selectedIdsInOrder}
          />
        ) : (
          <StateCard
            copy={copy}
            description={copy.responseUnavailableDescription}
            icon="lock"
            title={copy.responseUnavailableTitle}
          />
        )}

        {errorMessage ? (
          <p className="public-invitation__error" role="alert">
            <Icon name="circle-alert" size={20} />
            <span>{errorMessage}</span>
          </p>
        ) : null}
        {invitation.event.mapUrl ? (
          <a
            className="public-invitation__map"
            href={invitation.event.mapUrl}
            referrerPolicy="no-referrer"
            rel="noopener noreferrer"
            target="_blank"
          >
            <Icon name="map-pin" size={22} />
            <span>{copy.openMap}</span>
          </a>
        ) : null}
      </GuestShell>
    </div>
  );
}

interface RsvpEditorProps {
  companionCount: number | null;
  copy: Copy;
  currentRsvp: PublicInvitation["currentRsvp"];
  invitation: PublicInvitation;
  locale: AppLocale;
  onCancel?: () => void;
  onCompanionCountChange: (count: number | null) => void;
  onMemberSelectionChange: (ids: Set<string>) => void;
  onSubmit: (
    memberIds: readonly string[],
    companionCount: number,
    action: "confirm" | "decline",
  ) => Promise<void>;
  pendingAction: "confirm" | "decline" | null;
  primaryMemberId?: string;
  selectedMemberIds: Set<string>;
  selectedMemberIdsInOrder: readonly string[];
}

function RsvpEditor({
  companionCount,
  copy,
  currentRsvp,
  invitation,
  locale,
  onCancel,
  onCompanionCountChange,
  onMemberSelectionChange,
  onSubmit,
  pendingAction,
  primaryMemberId,
  selectedMemberIds,
  selectedMemberIdsInOrder,
}: RsvpEditorProps) {
  const type = invitation.invitation.invitationType;
  const members = [...invitation.invitation.members].sort(
    (left, right) => left.position - right.position,
  );
  const pending = pendingAction !== null;
  const namedHintId = "named-rsvp-selection-hint";
  const companionHintId = "companion-rsvp-selection-hint";

  return (
    <section
      aria-label={copy.responseFormLabel}
      className="public-invitation__editor"
    >
      {currentRsvp?.isEdited ? (
        <p className="public-invitation__edited">
          <Icon name="reply" size={18} />
          <span>{copy.editingRecordedResponse}</span>
        </p>
      ) : null}

      {type === "NAMED_GROUP" ? (
        <fieldset className="public-invitation__members">
          <legend>{copy.chooseGuests}</legend>
          {members.map((member) => (
            <Checkbox
              checked={selectedMemberIds.has(member.id)}
              disabled={pending}
              key={member.id}
              label={member.name}
              onChange={(event) => {
                const next = new Set(selectedMemberIds);
                if (event.currentTarget.checked) next.add(member.id);
                else next.delete(member.id);
                onMemberSelectionChange(next);
              }}
              size="guest"
            />
          ))}
          <p aria-live="polite" className="public-invitation__selection-count">
            {interpolate(copy.selectedOf, {
              selected: formatNumber(selectedMemberIds.size, locale),
              total: formatNumber(members.length, locale),
            })}
          </p>
          {selectedMemberIds.size === 0 ? (
            <p className="public-invitation__hint" id={namedHintId}>
              {copy.selectOneOrDecline}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      {type === "PRIMARY_WITH_COMPANIONS" ? (
        <fieldset className="public-invitation__companions">
          <legend>{copy.chooseCompanionCount}</legend>
          {invitation.invitation.maxCompanions <= 6 ? (
            <div aria-label={copy.chooseCompanionCount} role="radiogroup">
              {Array.from(
                { length: invitation.invitation.maxCompanions + 1 },
                (_, count) => (
                  <ChoiceCard
                    description={interpolate(copy.expectedPeople, {
                      count: formatNumber(count + 1, locale),
                    })}
                    disabled={pending}
                    icon="users"
                    key={count}
                    onClick={() => onCompanionCountChange(count)}
                    selected={companionCount === count}
                    size="guest"
                    title={
                      count === 0
                        ? copy.meOnly
                        : interpolate(copy.mePlus, {
                            count: formatNumber(count, locale),
                          })
                    }
                  />
                ),
              )}
            </div>
          ) : (
            <Stepper
              decrementLabel={copy.removeCompanion}
              disabled={pending}
              format={(value) => formatNumber(value, locale)}
              groupLabel={copy.chooseCompanionCount}
              incrementLabel={copy.addCompanion}
              max={invitation.invitation.maxCompanions}
              onChange={onCompanionCountChange}
              size="guest"
              value={companionCount ?? 0}
            />
          )}
          {companionCount === null ? (
            <p className="public-invitation__hint" id={companionHintId}>
              {copy.chooseCompanionCountHint}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      <div className="public-invitation__actions">
        {type === "SINGLE" ? (
          <Button
            disabled={pending || !primaryMemberId}
            fullWidth
            icon="check"
            loading={pendingAction === "confirm"}
            onClick={() =>
              void onSubmit(
                primaryMemberId ? [primaryMemberId] : [],
                0,
                "confirm",
              )
            }
            size="guest"
            variant="guest-primary"
          >
            {copy.attend}
          </Button>
        ) : (
          <Button
            aria-describedby={
              type === "NAMED_GROUP" && selectedMemberIds.size === 0
                ? namedHintId
                : type === "PRIMARY_WITH_COMPANIONS" && companionCount === null
                  ? companionHintId
                  : undefined
            }
            disabled={
              pending ||
              (type === "NAMED_GROUP" && selectedMemberIds.size === 0) ||
              (type === "PRIMARY_WITH_COMPANIONS" &&
                (companionCount === null || !primaryMemberId))
            }
            fullWidth
            icon="check"
            loading={pendingAction === "confirm"}
            onClick={() =>
              void onSubmit(
                type === "NAMED_GROUP"
                  ? selectedMemberIdsInOrder
                  : primaryMemberId
                    ? [primaryMemberId]
                    : [],
                type === "PRIMARY_WITH_COMPANIONS" ? (companionCount ?? 0) : 0,
                "confirm",
              )
            }
            size="guest"
            variant="guest-primary"
          >
            {copy.confirmAttendance}
          </Button>
        )}
        <Button
          disabled={pending}
          fullWidth
          icon="circle-x"
          loading={pendingAction === "decline"}
          onClick={() => void onSubmit([], 0, "decline")}
          size="guest"
          variant="guest-secondary"
        >
          {type === "NAMED_GROUP" ? copy.everyoneDeclines : copy.decline}
        </Button>
        {onCancel ? (
          <Button
            disabled={pending}
            fullWidth
            onClick={onCancel}
            size="guest"
            variant="guest-secondary"
          >
            {copy.cancelEdit}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function ResponseSummary({
  copy,
  currentRsvp,
  invitation,
  locale,
}: {
  copy: Copy;
  currentRsvp: CurrentRsvp;
  invitation: PublicInvitation;
  locale: AppLocale;
}) {
  const declined = currentRsvp.status === "DECLINED";
  const attendingNames = invitation.invitation.members
    .filter((member) => currentRsvp.attendingMemberIds.includes(member.id))
    .sort((left, right) => left.position - right.position)
    .map((member) => member.name);
  return (
    <div className="public-invitation__response-summary">
      <span
        className={declined ? "is-declined" : "is-attending"}
        aria-hidden="true"
      >
        <Icon name={declined ? "circle-x" : "circle-check"} size={30} />
      </span>
      <h2>{declined ? copy.declinedTitle : copy.attendanceConfirmed}</h2>
      <p className="public-invitation__expected">
        {declined
          ? copy.declinedDescription
          : interpolate(copy.expectedPeople, {
              count: formatNumber(currentRsvp.expectedAttendees, locale),
            })}
      </p>
      {!declined && attendingNames.length > 0 ? (
        <p>{attendingNames.join(" · ")}</p>
      ) : null}
      {currentRsvp.isEdited ? (
        <p className="public-invitation__edited">
          <Icon name="reply" size={18} />
          <span>{copy.responseEdited}</span>
        </p>
      ) : null}
    </div>
  );
}

function EventDetails({
  copy,
  invitation,
  locale,
}: {
  copy: Copy;
  invitation: PublicInvitation;
  locale: AppLocale;
}) {
  const { event } = invitation;
  const time = event.endTime
    ? interpolate(copy.timeRange, {
        end: formatTime(event.endTime, locale),
        start: formatTime(event.startTime, locale),
      })
    : formatTime(event.startTime, locale);
  return (
    <section
      aria-label={copy.eventDetails}
      className="public-invitation__details"
    >
      <div>
        <Icon name="calendar" size={21} />
        <strong>{formatDate(event.eventDate, locale)}</strong>
        <span>{time}</span>
      </div>
      <div>
        <Icon name="map-pin" size={21} />
        <strong>{event.venueName}</strong>
        <span>{event.city}</span>
      </div>
    </section>
  );
}

function LanguageLink({
  copy,
  locale,
  token,
}: {
  copy: Copy;
  locale: AppLocale;
  token: string;
}) {
  const targetLocale: AppLocale = locale === "ar-SA" ? "en" : "ar-SA";
  return (
    <nav aria-label={copy.language} className="public-invitation__language">
      <a
        href={`/${targetLocale}/i/${token}`}
        hrefLang={targetLocale}
        lang={targetLocale}
        rel="nofollow"
      >
        <Icon name="languages" size={18} />
        <span>{locale === "ar-SA" ? copy.english : copy.arabic}</span>
      </a>
    </nav>
  );
}

function StateCard({
  description,
  icon,
  title,
}: {
  copy: Copy;
  description: string;
  icon: "lock" | "sparkles";
  title: string;
}) {
  return (
    <section className="public-invitation__state-card">
      <Icon name={icon} size={26} />
      <h2>{title}</h2>
      <p>{description}</p>
    </section>
  );
}

function initialMemberSelection(invitation: PublicInvitation): Set<string> {
  if (invitation.currentRsvp) {
    return new Set(invitation.currentRsvp.attendingMemberIds);
  }
  if (invitation.invitation.invitationType === "NAMED_GROUP") {
    return new Set(invitation.invitation.members.map((member) => member.id));
  }
  return new Set();
}

function initialCompanionSelection(
  invitation: PublicInvitation,
): number | null {
  if (invitation.invitation.invitationType !== "PRIMARY_WITH_COMPANIONS") {
    return 0;
  }
  if (invitation.currentRsvp && invitation.currentRsvp.status !== "DECLINED") {
    return invitation.currentRsvp.companionCount;
  }
  return invitation.invitation.maxCompanions > 6 ? 0 : null;
}

function withRsvpResult(
  invitation: PublicInvitation,
  result: RsvpResult,
): PublicInvitation {
  return {
    ...invitation,
    currentRsvp: {
      attendingMemberIds: result.attendingMemberIds,
      companionCount: result.companionCount,
      expectedAttendees: result.expectedAttendees,
      isEdited: result.isEdited,
      respondedAt: result.respondedAt,
      status: result.status,
      updatedAt: result.respondedAt,
    },
  };
}

function invitationScope(
  invitation: PublicInvitation,
  copy: Copy,
  locale: AppLocale,
): string {
  if (invitation.invitation.invitationType === "SINGLE") {
    return copy.singleScope;
  }
  if (invitation.invitation.invitationType === "NAMED_GROUP") {
    return interpolate(copy.namedGroupScope, {
      count: formatNumber(invitation.invitation.members.length, locale),
    });
  }
  return interpolate(copy.companionScope, {
    count: formatNumber(invitation.invitation.maxCompanions, locale),
  });
}

function interpolate(
  template: string,
  values: Readonly<Record<string, string>>,
): string {
  return Object.entries(values).reduce(
    (message, [key, value]) => message.replaceAll(`{${key}}`, value),
    template,
  );
}

function formatNumber(value: number, locale: AppLocale): string {
  return new Intl.NumberFormat(
    locale === "ar-SA" ? "ar-SA-u-nu-arab" : "en-US",
  ).format(value);
}

function formatDate(value: string, locale: AppLocale): string {
  const [year = 0, month = 1, day = 1] = value
    .split("-")
    .map((part) => Number(part));
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    weekday: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatTime(value: string, locale: AppLocale): string {
  const [hour = 0, minute = 0] = value.split(":").map(Number);
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2000, 0, 1, hour, minute)));
}

function apiErrorStatus(error: unknown): number | null {
  if (
    typeof error !== "object" ||
    error === null ||
    !("status" in error) ||
    typeof error.status !== "number"
  ) {
    return null;
  }
  return error.status;
}
