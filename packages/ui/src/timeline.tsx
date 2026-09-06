import type { CSSProperties } from "react";
import { Icon, type IconName } from "./icon";

export interface TimelineItem {
  id: string;
  label: string;
  time?: string;
  tone?:
    "accepted" | "declined" | "pending" | "partial" | "notsent" | "checkedin";
  icon?: IconName;
  meta?: string;
  hollow?: boolean;
  strong?: boolean;
}

export interface TimelineProps {
  items: readonly TimelineItem[];
  dense?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function Timeline({
  items,
  dense = false,
  className,
  style,
}: TimelineProps) {
  return (
    <ol
      className={[
        "dawah-timeline",
        dense ? "dawah-timeline--dense" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
    >
      {items.map((item) => (
        <li
          className={item.hollow ? "dawah-timeline__item--hollow" : undefined}
          key={item.id}
        >
          <span
            className={`dawah-timeline__marker dawah-timeline__marker--${item.tone ?? "notsent"}`}
          >
            {item.icon ? (
              <Icon name={item.icon} size={12} strokeWidth={2.5} />
            ) : null}
          </span>
          <div>
            <span
              className={item.strong ? "dawah-timeline__strong" : undefined}
            >
              {item.label}
            </span>
            {item.meta ? <small>{item.meta}</small> : null}
          </div>
          {item.time ? <time className="num">{item.time}</time> : null}
        </li>
      ))}
    </ol>
  );
}
