import type { CSSProperties } from "react";

export interface SkeletonProps {
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
  radius?: CSSProperties["borderRadius"];
  className?: string;
  style?: CSSProperties;
}

export function Skeleton({
  width = "100%",
  height = 14,
  radius = "var(--radius-sm)",
  className,
  style,
}: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={["dawah-skeleton", className ?? ""].filter(Boolean).join(" ")}
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}
