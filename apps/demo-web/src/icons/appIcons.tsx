import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  CircleAlert,
  ClipboardList,
  Clock3,
  Database,
  DatabaseZap,
  FileCheck2,
  FileJson2,
  FileSearch,
  FlaskConical,
  GitBranch,
  HeartPulse,
  History,
  Loader2,
  LogOut,
  Menu,
  MessageSquareText,
  Moon,
  Network,
  PanelLeft,
  RefreshCcw,
  RotateCcw,
  ScrollText,
  SendToBack,
  ServerCog,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  X,
} from "lucide-react";

export type AppIconTone = "blue" | "green" | "orange" | "purple" | "gray" | "red";
export type AppIconSize = "xs" | "sm" | "md" | "lg";

export type AppIconProps = {
  icon: LucideIcon;
  size?: AppIconSize;
  tone?: AppIconTone;
  tile?: boolean;
  className?: string | undefined;
  label?: string;
};

const iconSizeMap: Record<AppIconSize, number> = {
  xs: 14,
  sm: 16,
  md: 18,
  lg: 22,
};

export function AppIcon({ icon: Icon, size = "md", tone = "blue", tile = false, className, label }: AppIconProps) {
  const classes = ["app-icon", `app-icon--${size}`, tile ? `app-icon-tile app-icon-tile--${tone}` : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} aria-hidden={label ? undefined : "true"} aria-label={label} role={label ? "img" : undefined}>
      <Icon size={iconSizeMap[size]} strokeWidth={1.9} aria-hidden="true" />
    </span>
  );
}

export const navigationIcons = {
  dashboard: Activity,
  newRecognition: FileSearch,
  jobDetail: ClipboardList,
  schemaStudio: DatabaseZap,
  evaluation: FlaskConical,
  feedbackSamples: MessageSquareText,
  agentTrace: Network,
  auditLog: History,
  writeback: SendToBack,
  providerSettings: Settings2,
  datasetSpec: ScrollText,
  brand: ShieldCheck,
} as const satisfies Record<string, LucideIcon>;

export const dashboardMetricIcons = {
  taskVolume: FileSearch,
  confidence: Sparkles,
  writeback: DatabaseZap,
  reviewQueue: Clock3,
  apiHealth: HeartPulse,
  provider: ServerCog,
  schema: FileJson2,
  dataset: Database,
  decisionPass: CheckCircle2,
  decisionReview: AlertTriangle,
  decisionBlock: CircleAlert,
  rollback: RotateCcw,
} as const satisfies Record<string, LucideIcon>;

export const actionIcons = {
  createRecognition: FileCheck2,
  viewFlow: GitBranch,
  privacyPolicy: ShieldCheck,
  refresh: RefreshCcw,
  next: ArrowRight,
  trendUp: ArrowUpRight,
  trendDown: ArrowDownRight,
  logout: LogOut,
} as const satisfies Record<string, LucideIcon>;

export const statusIcons = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: CircleAlert,
  info: Activity,
  neutral: Clock3,
  queued: Clock3,
  running: Loader2,
  review: AlertTriangle,
  completed: CheckCircle2,
  failed: CircleAlert,
  online: CheckCircle2,
  degraded: AlertTriangle,
  offline: CircleAlert,
  green: CheckCircle2,
  yellow: AlertTriangle,
  red: CircleAlert,
} as const satisfies Record<string, LucideIcon>;

export const providerIcons = {
  openaiVision: Sparkles,
  azureOcr: FileSearch,
  localOcr: Database,
  generic: ServerCog,
} as const satisfies Record<string, LucideIcon>;

export const commonUiIcons = {
  menu: Menu,
  close: X,
  collapseSidebar: PanelLeft,
  darkMode: Moon,
  lightMode: Sun,
  loading: Loader2,
  arrowRight: ArrowRight,
} as const satisfies Record<string, LucideIcon>;
