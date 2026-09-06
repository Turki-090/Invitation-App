import type { CSSProperties, ReactNode } from "react";
import { Icon } from "./icon";

export interface TagProps {
  children: ReactNode;
  tone?: "neutral" | "outline" | "accent";
  size?: "sm" | "md";
  onRemove?: () => void;
  removeLabel?: string;
  className?: string;
  style?: CSSProperties;
}

export function Tag({
  children,
  tone = "neutral",
  size = "md",
  onRemove,
  removeLabel,
  className,
  style,
}: TagProps) {
  if (onRemove && !removeLabel) {
    throw new Error("Tag removeLabel is required when onRemove is provided.");
  }
  return (
    <span
      className={[
        "dawah-tag",
        `dawah-tag--${tone}`,
        `dawah-tag--${size}`,
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
    >
      {children}
      {onRemove ? (
        <button aria-label={removeLabel} onClick={onRemove} type="button">
          <Icon name="x" size={14} />
        </button>
      ) : null}
    </span>
  );
}
