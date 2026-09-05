import { Icon, type IconName } from "./icon";
import type { Locale } from "./num";

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
  ar: string;
  en: string;
}

const statuses: Record<StatusKind, Record<string, StatusDefinition>> = {
  rsvp: {
    "not-sent": {
      tone: "notsent",
      icon: "circle-dashed",
      ar: "لم تُرسل",
      en: "Not sent",
    },
    pending: {
      tone: "pending",
      icon: "clock",
      ar: "بانتظار الرد",
      en: "Pending",
    },
    accepted: {
      tone: "accepted",
      icon: "circle-check",
      ar: "تم القبول",
      en: "Accepted",
    },
    partial: {
      tone: "partial",
      icon: "circle-dot",
      ar: "قبول جزئي",
      en: "Partially accepted",
    },
    declined: {
      tone: "declined",
      icon: "circle-x",
      ar: "اعتذار",
      en: "Declined",
    },
  },
  delivery: {
    draft: { tone: "notsent", icon: "file-text", ar: "مسودة", en: "Draft" },
    ready: { tone: "notsent", icon: "circle-dashed", ar: "جاهزة", en: "Ready" },
    queued: { tone: "pending", icon: "clock", ar: "في الانتظار", en: "Queued" },
    sent: { tone: "notsent", icon: "check", ar: "أُرسلت", en: "Sent" },
    delivered: {
      tone: "partial",
      icon: "check-check",
      ar: "تم التوصيل",
      en: "Delivered",
    },
    read: { tone: "checkedin", icon: "eye", ar: "تمت القراءة", en: "Read" },
    responded: {
      tone: "accepted",
      icon: "reply",
      ar: "تم الرد",
      en: "Responded",
    },
    failed: {
      tone: "failed",
      icon: "circle-alert",
      ar: "فشل الإرسال",
      en: "Failed",
    },
    cancelled: { tone: "notsent", icon: "ban", ar: "أُلغيت", en: "Cancelled" },
  },
  checkin: {
    "not-arrived": {
      tone: "notsent",
      icon: "circle-dashed",
      ar: "لم يصل",
      en: "Not arrived",
    },
    partial: {
      tone: "partial",
      icon: "users",
      ar: "وصول جزئي",
      en: "Partially checked in",
    },
    "checked-in": {
      tone: "checkedin",
      icon: "badge-check",
      ar: "تم الدخول",
      en: "Checked in",
    },
    "already-scanned": {
      tone: "pending",
      icon: "triangle-alert",
      ar: "مُسح مسبقًا",
      en: "Already scanned",
    },
  },
  event: {
    upcoming: {
      tone: "notsent",
      icon: "calendar",
      ar: "قادمة",
      en: "Upcoming",
    },
    sending: {
      tone: "pending",
      icon: "send",
      ar: "جارٍ الإرسال",
      en: "Sending",
    },
    "rsvp-open": {
      tone: "accepted",
      icon: "mail",
      ar: "الردود مفتوحة",
      en: "RSVP open",
    },
    "rsvp-closed": {
      tone: "partial",
      icon: "lock",
      ar: "الردود مغلقة",
      en: "RSVP closed",
    },
    today: { tone: "checkedin", icon: "sparkles", ar: "اليوم", en: "Today" },
    completed: {
      tone: "notsent",
      icon: "check",
      ar: "منتهية",
      en: "Completed",
    },
    archived: {
      tone: "notsent",
      icon: "archive",
      ar: "مؤرشفة",
      en: "Archived",
    },
  },
};

const fallback: StatusDefinition = {
  tone: "notsent",
  icon: "circle-dashed",
  ar: "غير معروف",
  en: "Unknown",
};

export interface StatusPillProps {
  kind: StatusKind;
  status: string;
  locale?: Locale;
  label?: string;
  detail?: string;
  size?: "sm" | "md";
}

export function StatusPill({
  kind,
  status,
  locale = "ar",
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
      <span>{label ?? definition[locale]}</span>
      {detail ? (
        <span className="num dawah-status-pill__detail">· {detail}</span>
      ) : null}
    </span>
  );
}
