import type { HTMLAttributes } from "react";

export interface PhoneProps extends HTMLAttributes<HTMLSpanElement> {
  value: string;
  masked?: boolean;
}

export function formatPhone(value: string, masked = false): string {
  const compact = value.replace(/[\s()-]/g, "");
  if (masked) {
    return compact.replace(/^(\+?\d{3,4})\d+(\d{3})$/, "$1 ••• •• $2");
  }
  return compact.replace(/^(\+\d{3})(\d{2})(\d{3})(\d{4})$/, "$1 $2 $3 $4");
}

export function Phone({
  value,
  masked = false,
  className,
  ...props
}: PhoneProps) {
  return (
    <span
      {...props}
      className={["phone", "dawah-phone", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      dir="ltr"
    >
      {formatPhone(value, masked)}
    </span>
  );
}
