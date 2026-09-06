import { Icon, type IconName } from "./icon";
export type StatusKind = "rsvp" | "delivery" | "checkin" | "event";
type StatusTone =
  | "accepted"
  | "declined"
  | "pending"
  | "partial"
  | "notsent"
  | "failed"
  | "checkedin";

interface StatusDefinition {
  tone: StatusTone;
  icon: IconName;
}

const statuses: Record<StatusKind, Record<string, StatusDefinition>> = {
  rsvp: {
    "not-sent": {
      tone: "notsent",
      icon: "circle-dashed",
    },
    pending: {
      tone: "pending",
      icon: "clock",
    },
    accepted: {
      tone: "accepted",
      icon: "circle-check",
    },
    partial: {
      tone: "partial",
      icon: "circle-dot",
    },
    declined: {
      tone: "declined",
      icon: "circle-x",
    },
  },
  delivery: {
    draft: { tone: "notsent", icon: "file-text" },
    ready: { tone: "notsent", icon: "circle-dashed" },
    queued: { tone: "pending", icon: "clock" },
    sent: { tone: "notsent", icon: "check" },
    delivered: {
      tone: "partial",
      icon: "check-check",
    },
    read: { tone: "checkedin", icon: "eye" },
    responded: {
      tone: "accepted",
      icon: "reply",
    },
    failed: {
      tone: "failed",
      icon: "circle-alert",
    },
    cancelled: { tone: "notsent", icon: "ban" },
  },
  checkin: {
    "not-arrived": {
      tone: "notsent",
      icon: "circle-dashed",
    },
    partial: {
      tone: "partial",
      icon: "users",
    },
    "checked-in": {
      tone: "checkedin",
      icon: "badge-check",
    },
    "already-scanned": {
      tone: "pending",
      icon: "triangle-alert",
    },
  },
  event: {
    upcoming: {
      tone: "notsent",
      icon: "calendar",
    },
    sending: {
      tone: "pending",
      icon: "send",
    },
    "rsvp-open": {
      tone: "accepted",
      icon: "mail",
    },
    "rsvp-closed": {
      tone: "partial",
      icon: "lock",
    },
    today: { tone: "checkedin", icon: "sparkles" },
    completed: {
      tone: "notsent",
      icon: "check",
    },
    archived: {
      tone: "notsent",
      icon: "archive",
    },
  },
};

const fallback: StatusDefinition = {
  tone: "notsent",
  icon: "circle-dashed",
};

export interface StatusPillProps {
  kind: StatusKind;
  status: string;
  label: string;
  detail?: string;
  size?: "sm" | "md";
}

export function StatusPill({
  kind,
  status,
  label,
  detail,
  size = "md",
}: StatusPillProps) {
  const definition = statuses[kind][status] ?? fallback;
  return (
    <span
      className={`dawah-status-pill dawah-status-pill--${definition.tone} dawah-status-pill--${size}`}
    >
      <Icon
        name={definition.icon}
        size={size === "sm" ? 13 : 14}
        strokeWidth={2}
      />
      <span>{label}</span>
      {detail ? (
        <span className="num dawah-status-pill__detail">· {detail}</span>
      ) : null}
    </span>
  );
}
