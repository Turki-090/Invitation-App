import { forwardRef, type ComponentProps } from "react";
import { Input } from "./input";

export interface PhoneInputProps extends Omit<
  ComponentProps<typeof Input>,
  "icon" | "prefix" | "type"
> {
  countryCode?: string;
}

export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  function PhoneInput({ countryCode = "+966", ...props }, ref) {
    return (
      <Input
        {...props}
        autoComplete={props.autoComplete ?? "tel-national"}
        dir="ltr"
        icon="phone"
        inputMode="tel"
        mono
        prefix={countryCode}
        ref={ref}
        type="tel"
      />
    );
  },
);
