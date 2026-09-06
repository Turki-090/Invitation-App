import { cloneElement, type ReactElement } from "react";

export interface FieldProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactElement<{
    id?: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
    "aria-required"?: boolean;
    required?: boolean;
  }>;
}

export function Field({
  id,
  label,
  error,
  hint,
  required,
  children,
}: FieldProps) {
  const messageId = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const describedBy = [children.props["aria-describedby"], messageId]
    .filter(Boolean)
    .join(" ");
  const controlRequired = required || children.props.required;
  return (
    <div className="dawah-field" data-invalid={error ? "true" : undefined}>
      <label htmlFor={id}>
        {label} {required ? <span aria-hidden="true">*</span> : null}
      </label>
      {cloneElement(children, {
        id: children.props.id ?? id,
        "aria-describedby": describedBy || undefined,
        "aria-invalid": error ? true : children.props["aria-invalid"],
        "aria-required": controlRequired
          ? true
          : children.props["aria-required"],
        required: controlRequired || undefined,
      })}
      {error ? (
        <p className="dawah-field__error" id={messageId} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="dawah-field__hint" id={messageId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
