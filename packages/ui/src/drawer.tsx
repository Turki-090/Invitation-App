"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { IconButton } from "./icon-button";

export interface DrawerProps {
  open: boolean;
  title: string;
  description?: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function Drawer({
  open,
  title,
  description,
  closeLabel,
  onClose,
  children,
  footer,
  className,
}: DrawerProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const drawer = ref.current;
    if (!drawer) return;
    if (open && !drawer.open) drawer.showModal();
    if (!open && drawer.open) drawer.close();
  }, [open]);

  return (
    <dialog
      aria-describedby={description ? descriptionId : undefined}
      aria-labelledby={titleId}
      className={["dawah-drawer", className ?? ""].filter(Boolean).join(" ")}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      ref={ref}
    >
      <header>
        <div>
          <h2 id={titleId}>{title}</h2>
          {description ? <p id={descriptionId}>{description}</p> : null}
        </div>
        <IconButton label={closeLabel} name="x" onClick={onClose} />
      </header>
      <div className="dawah-drawer__body">{children}</div>
      {footer ? <footer>{footer}</footer> : null}
    </dialog>
  );
}
