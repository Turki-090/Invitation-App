import type { CSSProperties } from "react";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

export interface AvatarProps {
  name: string;
  src?: string;
  size?: AvatarSize;
  tone?: "soft" | "dark";
  className?: string;
  style?: CSSProperties;
}

const sizeMap: Record<AvatarSize, number> = {
  xs: 24,
  sm: 28,
  md: 36,
  lg: 44,
  xl: 56,
};

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "")
    .join("");
}

export function Avatar({
  name,
  src,
  size = "md",
  tone = "soft",
  className,
  style,
}: AvatarProps) {
  const pixels = sizeMap[size];
  return (
    <span
      aria-label={name}
      className={["dawah-avatar", `dawah-avatar--${tone}`, className ?? ""]
        .filter(Boolean)
        .join(" ")}
      role="img"
      style={
        {
          "--dawah-avatar-size": `${pixels}px`,
          "--dawah-avatar-text": `${Math.round(pixels * 0.38)}px`,
          ...style,
        } as CSSProperties
      }
    >
      {src ? <img alt="" src={src} /> : getInitials(name)}
    </span>
  );
}
