import type { HTMLAttributes, ReactNode } from "react";

export type CardTone = "default" | "sunken" | "accent" | "dark";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  footer?: ReactNode;
  tone?: CardTone;
  children: ReactNode;
}

export function Card({
  title,
  subtitle,
  actions,
  footer,
  tone = "default",
  className,
  children,
  ...props
}: CardProps) {
  return (
    <section
      {...props}
      className={["dawah-card", `dawah-card--${tone}`, className ?? ""]
        .filter(Boolean)
        .join(" ")}
    >
      {title || actions ? (
        <header className="dawah-card__header">
          <div>
            {title ? <h3>{title}</h3> : null}
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {actions ? (
            <div className="dawah-card__actions">{actions}</div>
          ) : null}
        </header>
      ) : null}
      <div className="dawah-card__body">{children}</div>
      {footer ? <footer className="dawah-card__footer">{footer}</footer> : null}
    </section>
  );
}
