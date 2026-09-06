import type { HTMLAttributes, ReactNode } from "react";

export interface GuestShellProps extends HTMLAttributes<HTMLElement> {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function GuestShell({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
  className,
  ...props
}: GuestShellProps) {
  return (
    <main
      {...props}
      className={["dawah-guest-shell", className ?? ""]
        .filter(Boolean)
        .join(" ")}
    >
      <section className="dawah-guest-card">
        <header>
          {eyebrow ? <p>{eyebrow}</p> : null}
          <h1>{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </header>
        <div className="dawah-guest-card__body">{children}</div>
        {footer ? <footer>{footer}</footer> : null}
      </section>
    </main>
  );
}
