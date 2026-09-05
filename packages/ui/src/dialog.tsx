"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./icon";

export interface DialogProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
  footer,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      className="dawah-dialog"
      onCancel={onClose}
      onClose={onClose}
      ref={ref}
    >
      <header>
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        <button
          aria-label="إغلاق"
          className="dawah-icon-button"
          onClick={onClose}
          type="button"
        >
          <Icon name="x" />
        </button>
      </header>
      <div className="dawah-dialog__body">{children}</div>
      {footer ? <footer>{footer}</footer> : null}
    </dialog>
  );
}
