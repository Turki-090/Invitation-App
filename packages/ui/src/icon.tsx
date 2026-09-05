import {
  Archive,
  ArrowLeft,
  BadgeCheck,
  Ban,
  Calendar,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleX,
  Clock,
  Eye,
  FileText,
  Languages,
  LoaderCircle,
  Lock,
  Mail,
  MapPin,
  Phone,
  Plus,
  Reply,
  Send,
  Sparkles,
  TriangleAlert,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";

const icons = {
  archive: Archive,
  "arrow-left": ArrowLeft,
  "badge-check": BadgeCheck,
  ban: Ban,
  calendar: Calendar,
  check: Check,
  "check-check": CheckCheck,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  "circle-alert": CircleAlert,
  "circle-check": CircleCheck,
  "circle-dashed": CircleDashed,
  "circle-dot": CircleDot,
  "circle-x": CircleX,
  clock: Clock,
  eye: Eye,
  "file-text": FileText,
  languages: Languages,
  "loader-circle": LoaderCircle,
  lock: Lock,
  mail: Mail,
  "map-pin": MapPin,
  phone: Phone,
  plus: Plus,
  reply: Reply,
  send: Send,
  sparkles: Sparkles,
  "triangle-alert": TriangleAlert,
  users: Users,
  x: X,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof icons;

export interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
  flipRtl?: boolean;
}

export function Icon({
  name,
  size = 18,
  strokeWidth = 1.75,
  className,
  style,
  flipRtl = false,
}: IconProps) {
  const Component = icons[name];
  const classes = [className, flipRtl ? "dawah-icon--flip-rtl" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <Component
      aria-hidden="true"
      className={classes}
      size={size}
      strokeWidth={strokeWidth}
      style={style}
    />
  );
}
