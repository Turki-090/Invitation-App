"use client";

import {
  cloneElement,
  useId,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactElement,
} from "react";

export interface TooltipProps {
  label: string;
  children: ReactElement<{ "aria-describedby"?: string }>;
  placement?: "top" | "bottom";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Tooltip({
  label,
  children,
  placement = "top",
  open,
  onOpenChange,
}: TooltipProps) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const shown = open ?? visible;
  const describedBy = [children.props["aria-describedby"], id]
    .filter(Boolean)
    .join(" ");

  const setShown = (next: boolean) => {
    if (open === undefined) setVisible(next);
    onOpenChange?.(next);
  };
  const show = () => setShown(true);
  const hide = (event?: FocusEvent<HTMLSpanElement>) => {
    if (event?.currentTarget.contains(event.relatedTarget)) return;
    setShown(false);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    setShown(false);
  };

  return (
    <span
      className="dawah-tooltip"
      onBlur={hide}
      onFocus={show}
      onKeyDown={handleKeyDown}
      onMouseEnter={show}
      onMouseLeave={() => setShown(false)}
    >
      {cloneElement(children, { "aria-describedby": describedBy })}
      <span
        aria-hidden={!shown}
        className={`dawah-tooltip__bubble dawah-tooltip__bubble--${placement}`}
        data-open={shown ? "true" : "false"}
        id={id}
        role="tooltip"
      >
        {label}
      </span>
    </span>
  );
}
