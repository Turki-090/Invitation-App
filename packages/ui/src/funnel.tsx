import type { CSSProperties } from "react";
import { Icon } from "./icon";
import { formatNum, formatPercent, type Locale } from "./num";

export interface FunnelStep {
  label: string;
  value: number;
}

export interface FunnelProps {
  steps: readonly FunnelStep[];
  locale?: Locale;
  ariaLabel: string;
  className?: string;
  style?: CSSProperties;
}

export function Funnel({
  steps,
  locale = "ar",
  ariaLabel,
  className,
  style,
}: FunnelProps) {
  const base = Math.max(steps[0]?.value ?? 0, 1);
  return (
    <div
      aria-label={ariaLabel}
      className={["dawah-funnel", className ?? ""].filter(Boolean).join(" ")}
      role="list"
      style={style}
    >
      {steps.map((step, index) => {
        const percent = Math.min(100, Math.round((step.value / base) * 100));
        return (
          <div className="dawah-funnel__group" key={step.label} role="listitem">
            <div className="dawah-funnel__step">
              <span>{step.label}</span>
              <strong className="num">{formatNum(step.value, locale)}</strong>
              {index ? (
                <small className="num">{formatPercent(percent, locale)}</small>
              ) : null}
              <i>
                <span style={{ width: `${percent}%` }} />
              </i>
            </div>
            {index < steps.length - 1 ? (
              <Icon flipRtl name="chevron-right" size={16} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
