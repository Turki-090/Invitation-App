"use client";

import { useState, type ReactNode } from "react";
import { Icon, type IconName } from "./icon";
import { IconButton } from "./icon-button";

export interface HostNavigationItem {
  id: string;
  label: string;
  href: string;
  icon: IconName;
  active?: boolean;
  badge?: string | number;
}

export interface HostShellProps {
  brand: ReactNode;
  navigationLabel: string;
  items: readonly HostNavigationItem[];
  collapseLabel: string;
  expandLabel: string;
  topbar?: ReactNode;
  utility?: ReactNode;
  compactUtility?: ReactNode;
  children: ReactNode;
  className?: string;
}

function NavigationItems({ items }: { items: readonly HostNavigationItem[] }) {
  return (
    <>
      {items.map((item) => (
        <a
          aria-label={item.label}
          aria-current={item.active ? "page" : undefined}
          className="dawah-host-nav__item"
          href={item.href}
          key={item.id}
          title={item.label}
        >
          <Icon name={item.icon} size={19} />
          <span className="dawah-host-nav__label">{item.label}</span>
          {item.badge !== undefined ? (
            <span className="dawah-host-nav__badge num">{item.badge}</span>
          ) : null}
        </a>
      ))}
    </>
  );
}

export function HostShell({
  brand,
  navigationLabel,
  items,
  collapseLabel,
  expandLabel,
  topbar,
  utility,
  compactUtility,
  children,
  className,
}: HostShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div
      className={[
        "dawah-host-shell",
        collapsed ? "dawah-host-shell--collapsed" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <aside className="dawah-host-shell__sidebar">
        <div className="dawah-host-shell__brand">{brand}</div>
        <nav aria-label={navigationLabel} className="dawah-host-nav">
          <NavigationItems items={items} />
        </nav>
        <div className="dawah-host-shell__utility">{utility}</div>
        <IconButton
          className="dawah-host-shell__collapse"
          flipRtl
          label={collapsed ? expandLabel : collapseLabel}
          name={collapsed ? "panel-left-close" : "panel-right-close"}
          onClick={() => setCollapsed((value) => !value)}
        />
      </aside>
      <div className="dawah-host-shell__workspace">
        {topbar || compactUtility ? (
          <header className="dawah-host-shell__topbar">
            {topbar}
            {compactUtility ? (
              <div className="dawah-host-shell__compact-utility">
                {compactUtility}
              </div>
            ) : null}
          </header>
        ) : null}
        <main className="dawah-host-shell__main">{children}</main>
      </div>
      <nav aria-label={navigationLabel} className="dawah-bottom-nav">
        <NavigationItems items={items.slice(0, 5)} />
      </nav>
    </div>
  );
}
