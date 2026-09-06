import type { CSSProperties } from "react";
import { formatNum, formatPercent, type Locale } from "./num";

export type ProgressTone =
  "accepted" | "partial" | "declined" | "pending" | "notsent" | "checkedin";

export interface ProgressSegment {
  label: string;
  value: number;
  tone: ProgressTone;
}

export interface ProgressBarProps {
  segments: readonly ProgressSegment[];
  total?: number;
  locale?: Locale;
  height?: number;
  legend?: boolean;
  ariaLabel: string;
  className?: string;
  style?: CSSProperties;
}

export function ProgressBar({
  segments,
  total,
  locale = "ar",
  height = 10,
  legend = true,
  ariaLabel,
  className,
  style,
}: ProgressBarProps) {
  const sum =
    total ?? segments.reduce((value, segment) => value + segment.value, 0);
  const denominator = Math.max(sum, 1);
  return (
    <div
      className={["dawah-progress", className ?? ""].filter(Boolean).join(" ")}
      style={style}
    >
      <div
        aria-label={ariaLabel}
        className="dawah-progress__track"
        role="img"
        style={{ height }}
      >
        {segments.map((segment) => (
          <span
            className={`dawah-progress__segment dawah-progress__segment--${segment.tone}`}
            key={`${segment.label}-${segment.tone}`}
            style={{ width: `${(segment.value / denominator) * 100}%` }}
          />
        ))}
      </div>
      {legend ? (
        <div className="dawah-progress__legend">
          {segments.map((segment) => {
            const percent = Math.round((segment.value / denominator) * 100);
            return (
              <span key={`${segment.label}-${segment.tone}`}>
                <i className={`dawah-progress__key--${segment.tone}`} />
                <span>{segment.label}</span>
                <strong className="num">
                  {formatPercent(percent, locale)}
                </strong>
                <span className="num">
                  ({formatNum(segment.value, locale)})
                </span>
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
