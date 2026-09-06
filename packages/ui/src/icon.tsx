import {
  Archive,
  ArrowLeft,
  BadgeCheck,
  Ban,
  Bell,
  Calendar,
  ChartBar,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleX,
  Clock,
  Eye,
  FileText,
  Home,
  Info,
  LayoutDashboard,
  Languages,
  LoaderCircle,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Menu,
  Minus,
  MoreHorizontal,
  Phone,
  PanelLeftClose,
  PanelRightClose,
  Plus,
  Reply,
  ScanLine,
  Search,
  Send,
  Settings,
  Sparkles,
  Trash2,
  TriangleAlert,
  UserPlus,
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
  bell: Bell,
  calendar: Calendar,
  "chart-bar": ChartBar,
  check: Check,
  "check-check": CheckCheck,
  "chevron-down": ChevronDown,
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
  home: Home,
  info: Info,
  "layout-dashboard": LayoutDashboard,
  languages: Languages,
  "loader-circle": LoaderCircle,
  lock: Lock,
  "log-out": LogOut,
  mail: Mail,
  "map-pin": MapPin,
  menu: Menu,
  minus: Minus,
  "more-horizontal": MoreHorizontal,
  "panel-left-close": PanelLeftClose,
  "panel-right-close": PanelRightClose,
  phone: Phone,
  plus: Plus,
  reply: Reply,
  "scan-line": ScanLine,
  search: Search,
  send: Send,
  settings: Settings,
  sparkles: Sparkles,
  "trash-2": Trash2,
  "triangle-alert": TriangleAlert,
  "user-plus": UserPlus,
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
