import {
  RefreshCw, Package, AlertTriangle, Info, Target, Compass,
  Clock, Eye, CheckCircle, Globe, Mic, Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { SystemEventMessage } from "./types";

const EVENT_ICONS: Record<string, LucideIcon> = {
  model_switch: RefreshCw,
  context_compress: Package,
  provider_error: AlertTriangle,
  gateway_error: AlertTriangle,
  gateway_timeout: Clock,
  protocol_error: AlertTriangle,
  agent_error: AlertTriangle,
  stuck_timeout: Clock,
  review: Eye,
  background: CheckCircle,
  browser: Globe,
  voice: Mic,
  subagent_spawn: Users,
  status: Info,
  goal: Target,
  steer: Compass,
};

const TONE_COLORS: Record<string, string> = {
  info: "var(--accent)",
  success: "var(--success)",
  warning: "var(--warning)",
  error: "var(--error)",
};

interface ChatEventRowProps { msg: SystemEventMessage; }

export function ChatEventRow({ msg }: ChatEventRowProps): React.JSX.Element {
  const Icon = EVENT_ICONS[msg.event] || Info;
  return (
    <div className="chat-event-row" style={{ borderLeftColor: TONE_COLORS[msg.tone] || TONE_COLORS.info }}>
      <Icon size={12} className="chat-event-icon" />
      <span className="chat-event-title">{msg.title}</span>
      {msg.content && <span className="chat-event-content">{msg.content}</span>}
      {msg.code && <code className="chat-event-code">{msg.code}</code>}
    </div>
  );
}
