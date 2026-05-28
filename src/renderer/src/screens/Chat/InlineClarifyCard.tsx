import { useState } from "react";
import type { ClarifyRequest } from "./types";
interface InlineClarifyCardProps { request: ClarifyRequest; onSubmit: (value: string) => void; }
export function InlineClarifyCard({ request, onSubmit }: InlineClarifyCardProps): React.JSX.Element {
  const [value, setValue] = useState("");
  return (
    <div className="chat-interaction-card chat-clarify-inline-card">
      <div className="chat-interaction-icon">❓</div>
      <div className="chat-interaction-main">
        <div className="chat-interaction-title">{request.question}</div>
        {request.choices && request.choices.length > 0 ? (
          <div className="chat-clarify-inline-choices">{request.choices.map((c) => (<button key={c} className="chat-clarify-inline-choice" onClick={() => onSubmit(c)}>{c}</button>))}</div>
        ) : (
          <div className="chat-clarify-inline-input">
            <input className="input" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && value.trim()) { onSubmit(value.trim()); setValue(""); } }} placeholder="Type your answer…" autoFocus />
            <button className="btn btn-primary btn-sm" disabled={!value.trim()} onClick={() => { if (value.trim()) { onSubmit(value.trim()); setValue(""); } }}>Send</button>
          </div>
        )}
      </div>
    </div>
  );
}
