import type { HTMLAttributes } from "react";

export type Locale = "ar" | "en";

export function formatNum(
  value: number,
  locale: Locale = "ar",
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(
    locale === "ar" ? "ar-SA-u-nu-arab" : "en-US",
    options,
  ).format(value);
}

export function Num({
  value,
  locale = "ar",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { value: number; locale?: Locale }) {
  return (
    <span
      {...props}
      className={["num", props.className ?? ""].filter(Boolean).join(" ")}
    >
      {formatNum(value, locale)}
    </span>
  );
}
