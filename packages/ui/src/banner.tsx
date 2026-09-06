import type { CSSProperties } from "react";
import { Button } from "./button";
import { Icon, type IconName } from "./icon";

export type BannerKind = "danger" | "warning" | "info" | "success" | "neutral";

const bannerIcons: Record<BannerKind, IconName> = {
  danger: "circle-alert",
  warning: "clock",
  info: "info",
  success: "circle-check",
  neutral: "info",
};

export interface BannerProps {
  kind?: BannerKind;
  icon?: IconName;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  compact?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function Banner({
  kind = "info",
  icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  compact = false,
  className,
  style,
}: BannerProps) {
  return (
    <div
      className={[
        "dawah-banner",
        `dawah-banner--${kind}`,
        compact ? "dawah-banner--compact" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      role={kind === "danger" ? "alert" : "status"}
      style={style}
    >
      <span className="dawah-banner__icon">
        <Icon name={icon ?? bannerIcons[kind]} size={18} />
      </span>
      <div className="dawah-banner__copy">
        <strong>{title}</strong>
        {description && !compact ? <span>{description}</span> : null}
      </div>
      {actionLabel || secondaryLabel ? (
        <div className="dawah-banner__actions">
          {secondaryLabel ? (
            <Button onClick={onSecondary} size="sm" variant="ghost">
              {secondaryLabel}
            </Button>
          ) : null}
          {actionLabel ? (
            <Button
              iconEnd="arrow-left"
              onClick={onAction}
              size="sm"
              variant="secondary"
            >
              {actionLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
