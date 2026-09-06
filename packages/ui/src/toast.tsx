import type { CSSProperties, ReactNode } from "react";
import { Icon, type IconName } from "./icon";
import { IconButton } from "./icon-button";

export type ToastKind = "success" | "error" | "warning" | "info";

const toastIcons: Record<ToastKind, IconName> = {
  success: "circle-check",
  error: "circle-alert",
  warning: "triangle-alert",
  info: "info",
};

export interface ToastProps {
  kind?: ToastKind;
  title: string;
  description?: string;
  action?: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
  className?: string;
  style?: CSSProperties;
}

export function Toast({
  kind = "success",
  title,
  description,
  action,
  onDismiss,
  dismissLabel,
  className,
  style,
}: ToastProps) {
  if (onDismiss && !dismissLabel) {
    throw new Error(
      "Toast dismissLabel is required when onDismiss is provided.",
    );
  }
  return (
    <div
      aria-atomic="true"
      className={["dawah-toast", `dawah-toast--${kind}`, className ?? ""]
        .filter(Boolean)
        .join(" ")}
      role={kind === "error" ? "alert" : "status"}
      style={style}
    >
      <Icon className="dawah-toast__icon" name={toastIcons[kind]} size={20} />
      <div className="dawah-toast__copy">
        <strong>{title}</strong>
        {description ? <span>{description}</span> : null}
        {action ? <div>{action}</div> : null}
      </div>
      {onDismiss ? (
        <IconButton
          className="dawah-toast__dismiss"
          label={dismissLabel!}
          name="x"
          onClick={onDismiss}
          size="sm"
        />
      ) : null}
    </div>
  );
}
