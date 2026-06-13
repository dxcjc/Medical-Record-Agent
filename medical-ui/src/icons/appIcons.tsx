import type { ReactElement } from 'react';
import type { LucideIcon, LucideProps } from 'lucide-react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Bell,
  CheckCircle,
  ClipboardList,
  Clock,
  Database,
  FileText,
  FileUp,
  Gauge,
  Home,
  LayoutDashboard,
  List,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Sun,
  Upload,
  UserRound,
  User,
  Send,
  Code,
  Grid3X3,
  HardDrive,
  Info,
  XCircle,
  Beaker,
  Eye,
} from 'lucide-react';

export type AppIcon = (props: LucideProps) => ReactElement;

function createAppIcon(Icon: LucideIcon): AppIcon {
  return function AppIconComponent({ size = 16, ...props }: LucideProps) {
    return <Icon size={size} {...props} />;
  };
}

export const IconActivity = createAppIcon(Activity);
export const IconAlertTriangle = createAppIcon(AlertTriangle);
export const IconArrowLeft = createAppIcon(ArrowLeft);
export const IconBarChart = createAppIcon(BarChart3);
export const IconBell = createAppIcon(Bell);
export const IconCheckCircle = createAppIcon(CheckCircle);
export const IconClipboardList = createAppIcon(ClipboardList);
export const IconClock = createAppIcon(Clock);
export const IconDatabase = createAppIcon(Database);
export const IconDashboard = createAppIcon(LayoutDashboard);
export const IconEye = createAppIcon(Eye);
export const IconFileText = createAppIcon(FileText);
export const IconFileUp = createAppIcon(FileUp);
export const IconGauge = createAppIcon(Gauge);
export const IconHome = createAppIcon(Home);
export const IconList = createAppIcon(List);
export const IconLogOut = createAppIcon(LogOut);
export const IconMenu = createAppIcon(Menu);
export const IconMoon = createAppIcon(Moon);
export const IconPanelLeftClose = createAppIcon(PanelLeftClose);
export const IconPanelLeftOpen = createAppIcon(PanelLeftOpen);
export const IconRefresh = createAppIcon(RefreshCw);
export const IconSearch = createAppIcon(Search);
export const IconSettings = createAppIcon(Settings);
export const IconShield = createAppIcon(Shield);
export const IconSun = createAppIcon(Sun);
export const IconUpload = createAppIcon(Upload);
export const IconUserRound = createAppIcon(UserRound);
export const IconXCircle = createAppIcon(XCircle);
export const IconBeaker = createAppIcon(Beaker);
export const IconUser = createAppIcon(User);
export const IconSend = createAppIcon(Send);
export const IconCode = createAppIcon(Code);
export const IconApps = createAppIcon(Grid3X3);
export const IconStorage = createAppIcon(HardDrive);
export const IconInfoCircle = createAppIcon(Info);
