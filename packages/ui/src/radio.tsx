import type { InputHTMLAttributes } from "react";

export interface RadioProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> {
  label: string;
  description?: string;
}

export function Radio({ label, description, className, ...props }: RadioProps) {
  return (
    <label
      className={["dawah-radio", className ?? ""].filter(Boolean).join(" ")}
    >
      <span className="dawah-radio__control">
        <input {...props} type="radio" />
        <span aria-hidden="true" />
      </span>
      <span className="dawah-radio__copy">
        <span>{label}</span>
        {description ? <small>{description}</small> : null}
      </span>
    </label>
  );
}
