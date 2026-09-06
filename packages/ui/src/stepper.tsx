import type { CSSProperties } from "react";
import { Icon } from "./icon";

export interface StepperProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  decrementLabel: string;
  incrementLabel: string;
  groupLabel: string;
  format?: (value: number) => string;
  size?: "md" | "guest";
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function Stepper({
  value,
  min = 0,
  max = 10,
  onChange,
  decrementLabel,
  incrementLabel,
  groupLabel,
  format,
  size = "md",
  disabled = false,
  className,
  style,
}: StepperProps) {
  const setValue = (next: number) =>
    onChange(Math.min(max, Math.max(min, next)));
  return (
    <div
      aria-label={groupLabel}
      className={["dawah-stepper", `dawah-stepper--${size}`, className ?? ""]
        .filter(Boolean)
        .join(" ")}
      role="group"
      style={style}
    >
      <button
        aria-label={decrementLabel}
        disabled={disabled || value <= min}
        onClick={() => setValue(value - 1)}
        type="button"
      >
        <Icon name="minus" size={size === "guest" ? 22 : 18} />
      </button>
      <output aria-live="polite" className="num">
        {format ? format(value) : value}
      </output>
      <button
        aria-label={incrementLabel}
        disabled={disabled || value >= max}
        onClick={() => setValue(value + 1)}
        type="button"
      >
        <Icon name="plus" size={size === "guest" ? 22 : 18} />
      </button>
    </div>
  );
}
