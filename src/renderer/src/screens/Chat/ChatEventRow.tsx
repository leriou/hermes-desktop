import type { SystemEventMessage } from "./types";
const EVENT_ICONS: Record<string, string> = { model_switch: "🔄", context_compress: "📦", provider_error: "⚠️", gateway_error: "⚠️", status: "ℹ️", goal: "🎯", steer: "🧭" };
const TONE_COLORS: Record<string, string> = { info: "var(--info,#4aa8ff)", success: "var(--success,#4ac38a)", warning: "var(--warning,#f59e0b)", error: "var(--danger,#f87171)" };
interface ChatEventRowProps { msg: SystemEventMessage; }
export function ChatEventRow({ msg }: ChatEventRowProps): React.JSX.Element {
  return (
    <div className="chat-event-row" style={{ borderLeftColor: TONE_COLORS[msg.tone] || TONE_COLORS.info }}>
      <span className="chat-event-icon">{EVENT_ICONS[msg.event] || "ℹ️"}</span>
      <span className="chat-event-title">{msg.title}</span>
      {msg.content && <span className="chat-event-content">{msg.content}</span>}
      {msg.code && <code className="chat-event-code">{msg.code}</code>}
    </div>
  );
}
