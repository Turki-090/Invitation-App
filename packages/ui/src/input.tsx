import type { InputHTMLAttributes } from "react";
import { Icon, type IconName } from "./icon";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: IconName;
  invalid?: boolean;
}

export function Input({
  icon,
  invalid = false,
  className,
  ...props
}: InputProps) {
  return (
    <span
      className={[
        "dawah-input",
        invalid ? "dawah-input--invalid" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {icon ? <Icon name={icon} size={18} /> : null}
      <input {...props} aria-invalid={invalid || undefined} />
    </span>
  );
}
