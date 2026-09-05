import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "./icon";

export type ButtonVariant =
  | "primary"
  | "accent"
  | "secondary"
  | "ghost"
  | "danger"
  | "danger-soft"
  | "whatsapp"
  | "guest-primary"
  | "guest-secondary";

export type ButtonSize = "sm" | "md" | "lg" | "guest";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconEnd?: IconName;
  loading?: boolean;
  fullWidth?: boolean;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  icon,
  iconEnd,
  loading = false,
  fullWidth = false,
  disabled,
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  const classes = [
    "dawah-button",
    `dawah-button--${variant}`,
    `dawah-button--${size}`,
    fullWidth ? "dawah-button--full" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      {...props}
      aria-busy={loading || undefined}
      className={classes}
      disabled={disabled || loading}
      type={type}
    >
      {loading ? (
        <Icon className="dawah-spin" name="loader-circle" />
      ) : icon ? (
        <Icon name={icon} />
      ) : null}
      <span>{children}</span>
      {iconEnd ? <Icon flipRtl name={iconEnd} /> : null}
    </button>
  );
}
