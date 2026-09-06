"use client";

import {
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Icon, type IconName } from "./icon";

export interface ChoiceCardProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "title"
> {
  title: ReactNode;
  description?: ReactNode;
  icon?: IconName;
  meta?: ReactNode;
  selected?: boolean;
  size?: "md" | "guest";
}

export function ChoiceCard({
  title,
  description,
  icon,
  meta,
  selected = false,
  size = "md",
  className,
  disabled,
  onKeyDown,
  tabIndex,
  type = "button",
  ...props
}: ChoiceCardProps) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const card = ref.current;
    if (!card || tabIndex !== undefined) return;
    const group = card.closest('[role="radiogroup"]');
    if (!group) {
      card.tabIndex = 0;
      return;
    }
    const cards = Array.from(
      group.querySelectorAll<HTMLButtonElement>(
        '[role="radio"]:not(:disabled)',
      ),
    );
    const checked = cards.find(
      (candidate) => candidate.getAttribute("aria-checked") === "true",
    );
    cards.forEach((candidate, index) => {
      candidate.tabIndex = checked
        ? candidate === checked
          ? 0
          : -1
        : index === 0
          ? 0
          : -1;
    });
  }, [disabled, selected, tabIndex]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    const group = event.currentTarget.closest('[role="radiogroup"]');
    if (!group) return;
    const cards = Array.from(
      group.querySelectorAll<HTMLButtonElement>(
        '[role="radio"]:not(:disabled)',
      ),
    );
    const current = cards.indexOf(event.currentTarget);
    if (current < 0) return;
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    let next = current;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = cards.length - 1;
    else if (event.key === "ArrowDown") next = current + 1;
    else if (event.key === "ArrowUp") next = current - 1;
    else if (event.key === "ArrowRight") next = current + (rtl ? -1 : 1);
    else if (event.key === "ArrowLeft") next = current + (rtl ? 1 : -1);
    else return;
    event.preventDefault();
    const card = cards[(next + cards.length) % cards.length];
    card?.focus();
    card?.click();
  };

  return (
    <button
      {...props}
      aria-checked={selected}
      className={[
        "dawah-choice-card",
        `dawah-choice-card--${size}`,
        selected ? "dawah-choice-card--selected" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled}
      onKeyDown={handleKeyDown}
      ref={ref}
      role="radio"
      tabIndex={tabIndex ?? (selected ? 0 : -1)}
      type={type}
    >
      {icon ? (
        <span className="dawah-choice-card__icon">
          <Icon name={icon} size={20} />
        </span>
      ) : null}
      <span className="dawah-choice-card__copy">
        <strong>{title}</strong>
        {description ? <span>{description}</span> : null}
      </span>
      {meta ? (
        <span className="dawah-choice-card__meta num">{meta}</span>
      ) : null}
      <span aria-hidden="true" className="dawah-choice-card__check">
        {selected ? <Icon name="check" size={14} strokeWidth={3} /> : null}
      </span>
    </button>
  );
}
