"use client";

import type { CSSProperties, KeyboardEvent } from "react";

export interface TabItem {
  id: string;
  label: string;
  count?: string | number;
  disabled?: boolean;
}

export interface TabsProps {
  items: readonly TabItem[];
  value: string;
  onChange: (id: string) => void;
  variant?: "underline" | "pill";
  ariaLabel: string;
  className?: string;
  style?: CSSProperties;
}

export function Tabs({
  items,
  value,
  onChange,
  variant = "underline",
  ariaLabel,
  className,
  style,
}: TabsProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const list = event.currentTarget.closest('[role="tablist"]');
    if (!list) return;
    const tabs = Array.from(
      list.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'),
    );
    const current = tabs.indexOf(event.currentTarget);
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    let next = current;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else if (event.key === "ArrowRight") next = current + (rtl ? -1 : 1);
    else if (event.key === "ArrowLeft") next = current + (rtl ? 1 : -1);
    else return;
    event.preventDefault();
    const tab = tabs[(next + tabs.length) % tabs.length];
    if (tab) {
      tab.focus();
      tab.click();
    }
  };

  return (
    <div
      aria-label={ariaLabel}
      className={["dawah-tabs", `dawah-tabs--${variant}`, className ?? ""]
        .filter(Boolean)
        .join(" ")}
      role="tablist"
      style={style}
    >
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            aria-selected={selected}
            className="dawah-tabs__tab"
            disabled={item.disabled}
            key={item.id}
            onClick={() => onChange(item.id)}
            onKeyDown={handleKeyDown}
            role="tab"
            tabIndex={selected ? 0 : -1}
            type="button"
          >
            <span>{item.label}</span>
            {item.count !== undefined ? (
              <span className="dawah-tabs__count num">{item.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
