"use client";

import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { Icon } from "./icon";

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "size" | "type"
> {
  label?: string;
  ariaLabel?: string;
  description?: string;
  indeterminate?: boolean;
  size?: "md" | "guest";
}

export function Checkbox({
  label,
  ariaLabel,
  description,
  indeterminate = false,
  size = "md",
  className,
  checked,
  defaultChecked,
  onChange,
  ...props
}: CheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);
  const [uncontrolledChecked, setUncontrolledChecked] = useState(
    Boolean(defaultChecked),
  );
  const renderedChecked = checked ?? uncontrolledChecked;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  if (!label && !ariaLabel) {
    throw new Error("Checkbox requires label or ariaLabel.");
  }

  return (
    <label
      className={["dawah-check", `dawah-check--${size}`, className ?? ""]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="dawah-check__control">
        <input
          {...props}
          aria-checked={indeterminate ? "mixed" : undefined}
          aria-label={ariaLabel}
          checked={checked}
          defaultChecked={checked === undefined ? defaultChecked : undefined}
          onChange={(event) => {
            if (checked === undefined) {
              setUncontrolledChecked(event.currentTarget.checked);
            }
            onChange?.(event);
          }}
          ref={ref}
          type="checkbox"
        />
        <span aria-hidden="true" className="dawah-check__box">
          {indeterminate ? (
            <Icon
              name="minus"
              size={size === "guest" ? 18 : 14}
              strokeWidth={2.5}
            />
          ) : renderedChecked ? (
            <Icon
              name="check"
              size={size === "guest" ? 18 : 14}
              strokeWidth={2.5}
            />
          ) : null}
        </span>
      </span>
      {label ? (
        <span className="dawah-check__copy">
          <span>{label}</span>
          {description ? <small>{description}</small> : null}
        </span>
      ) : null}
    </label>
  );
}
