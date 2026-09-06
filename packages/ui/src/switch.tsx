import type { InputHTMLAttributes } from "react";

export interface SwitchProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "role" | "type"
> {
  label: string;
  description?: string;
}

export function Switch({
  label,
  description,
  className,
  ...props
}: SwitchProps) {
  return (
    <label
      className={["dawah-switch", className ?? ""].filter(Boolean).join(" ")}
    >
      <span className="dawah-switch__copy">
        <span>{label}</span>
        {description ? <small>{description}</small> : null}
      </span>
      <span className="dawah-switch__control">
        <input {...props} role="switch" type="checkbox" />
        <span aria-hidden="true" className="dawah-switch__track" />
        <span aria-hidden="true" className="dawah-switch__thumb" />
      </span>
    </label>
  );
}
