import type { ReactNode } from "react";

export interface FieldProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}

export function Field({
  id,
  label,
  error,
  hint,
  required,
  children,
}: FieldProps) {
  return (
    <div className="dawah-field" data-invalid={error ? "true" : undefined}>
      <label htmlFor={id}>
        {label} {required ? <span aria-hidden="true">*</span> : null}
      </label>
      {children}
      {error ? (
        <p className="dawah-field__error">{error}</p>
      ) : hint ? (
        <p className="dawah-field__hint">{hint}</p>
      ) : null}
    </div>
  );
}
