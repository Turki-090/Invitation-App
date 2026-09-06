import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { Icon, type IconName } from "./icon";

export interface InputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "size" | "prefix"
> {
  icon?: IconName;
  invalid?: boolean;
  inputClassName?: string;
  mono?: boolean;
  prefix?: ReactNode;
  size?: "sm" | "md" | "lg";
  suffix?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    icon,
    invalid = false,
    className,
    inputClassName,
    mono = false,
    prefix,
    size = "lg",
    suffix,
    "aria-invalid": ariaInvalid,
    ...props
  },
  ref,
) {
  const renderedInvalid =
    invalid || ariaInvalid === true || ariaInvalid === "true";
  return (
    <span
      className={[
        "dawah-input",
        `dawah-input--${size}`,
        renderedInvalid ? "dawah-input--invalid" : "",
        mono ? "dawah-input--mono" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {icon ? <Icon name={icon} size={18} /> : null}
      {prefix ? <span className="dawah-input__prefix">{prefix}</span> : null}
      <input
        {...props}
        aria-invalid={renderedInvalid || undefined}
        className={inputClassName}
        ref={ref}
      />
      {suffix ? <span className="dawah-input__suffix">{suffix}</span> : null}
    </span>
  );
});
