import type { HTMLAttributes } from "react";
import { Icon, type IconName } from "./icon";
import { formatNum, type Locale } from "./num";

export interface StatCardProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value: number;
  context: string;
  footnote?: string;
  tone?:
    "accepted" | "declined" | "pending" | "partial" | "notsent" | "checkedin";
  icon?: IconName;
  locale?: Locale;
}

export function StatCard({
  label,
  value,
  context,
  footnote,
  tone,
  icon,
  locale = "ar",
  className,
  ...props
}: StatCardProps) {
  return (
    <div
      {...props}
      className={["dawah-stat-card", className ?? ""].filter(Boolean).join(" ")}
    >
      <div className="dawah-stat-card__label">
        {tone ? (
          <span
            aria-hidden="true"
            className={`dawah-stat-card__dot dawah-stat-card__dot--${tone}`}
          />
        ) : null}
        {!tone && icon ? <Icon name={icon} size={16} /> : null}
        <span>{label}</span>
      </div>
      <div className="dawah-stat-card__value">
        <strong className="num">{formatNum(value, locale)}</strong>
        <span>{context}</span>
      </div>
      {footnote ? <small>{footnote}</small> : null}
    </div>
  );
}
