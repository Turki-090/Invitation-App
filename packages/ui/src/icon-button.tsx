import type { ButtonHTMLAttributes } from "react";
import { Icon, type IconName } from "./icon";

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> {
  name: IconName;
  label: string;
  variant?: "ghost" | "outline";
  size?: "sm" | "md" | "lg";
  active?: boolean;
  flipRtl?: boolean;
  badge?: boolean | string | number;
}

export function IconButton({
  name,
  label,
  variant = "ghost",
  size = "md",
  active,
  flipRtl,
  badge,
  className,
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button
      {...props}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      className={[
        "dawah-icon-button",
        `dawah-icon-button--${variant}`,
        `dawah-icon-button--${size}`,
        active ? "dawah-icon-button--active" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      title={props.title ?? label}
      type={type}
    >
      <Icon flipRtl={flipRtl} name={name} size={size === "lg" ? 22 : 18} />
      {badge ? (
        <span
          aria-label={typeof badge === "boolean" ? undefined : String(badge)}
          className="dawah-icon-button__badge"
        >
          {typeof badge === "boolean" ? null : badge}
        </span>
      ) : null}
    </button>
  );
}
