import type { SelectHTMLAttributes } from "react";
import { Icon } from "./icon";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "size"
> {
  options: readonly SelectOption[];
  placeholder?: string;
  invalid?: boolean;
  size?: "sm" | "md" | "lg";
}

export function Select({
  options,
  placeholder,
  invalid = false,
  size = "lg",
  className,
  value,
  defaultValue,
  "aria-invalid": ariaInvalid,
  ...props
}: SelectProps) {
  const renderedInvalid =
    invalid || ariaInvalid === true || ariaInvalid === "true";
  return (
    <span
      className={[
        "dawah-select",
        `dawah-select--${size}`,
        renderedInvalid ? "dawah-select--invalid" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <select
        {...props}
        aria-invalid={renderedInvalid || undefined}
        defaultValue={defaultValue ?? (value === undefined ? "" : undefined)}
        value={value}
      >
        {placeholder ? (
          <option disabled value="">
            {placeholder}
          </option>
        ) : null}
        {options.map((option) => (
          <option
            disabled={option.disabled}
            key={option.value}
            value={option.value}
          >
            {option.label}
          </option>
        ))}
      </select>
      <Icon name="chevron-down" size={16} />
    </span>
  );
}
