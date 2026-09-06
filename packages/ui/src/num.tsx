import type { HTMLAttributes } from "react";

export type Locale = "ar" | "ar-SA" | "en";

function intlLocale(locale: Locale): string {
  return locale.startsWith("ar") ? "ar-SA-u-nu-arab" : "en";
}

export function formatNum(
  value: number,
  locale: Locale = "ar",
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(intlLocale(locale), options).format(value);
}

export function formatPercent(value: number, locale: Locale = "ar"): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    maximumFractionDigits: 0,
    style: "percent",
  }).format(value / 100);
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
