import { useCallback, useState } from "react";
import type { SecretRequest, SudoRequest } from "./types";

interface InteractionCenterProps {
  pendingSudo?: SudoRequest | null;
  pendingSecret?: SecretRequest | null;
  onSudoRespond: (password: string) => void;
  onSecretRespond: (value: string) => void;
}

function SudoCard({
  onSubmit,
}: {
  onSubmit: (password: string) => void;
}): React.JSX.Element {
  const [value, setValue] = useState("");
  const handleSubmit = useCallback(() => {
    if (!value) return;
    onSubmit(value);
    setValue("");
  }, [onSubmit, value]);

  return (
    <div className="chat-interaction-card chat-sudo-card">
      <div className="chat-interaction-icon">🔑</div>
      <div className="chat-interaction-main">
        <div className="chat-interaction-title">Sudo password required</div>
        <input
          type="password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleSubmit();
          }}
          placeholder="Password"
          autoFocus
        />
      </div>
      <button onClick={handleSubmit}>Submit</button>
    </div>
  );
}

function SecretCard({
  req,
  onSubmit,
}: {
  req: SecretRequest;
  onSubmit: (value: string) => void;
}): React.JSX.Element {
  const [value, setValue] = useState("");
  const handleSubmit = useCallback(() => {
    if (!value) return;
    onSubmit(value);
    setValue("");
  }, [onSubmit, value]);

  return (
    <div className="chat-interaction-card chat-secret-card">
      <div className="chat-interaction-icon">🔐</div>
      <div className="chat-interaction-main">
        <div className="chat-interaction-title">{req.prompt || req.envVar}</div>
        <input
          type="password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleSubmit();
          }}
          placeholder={req.envVar}
          autoFocus
        />
      </div>
      <button onClick={handleSubmit}>Submit</button>
    </div>
  );
}

export function InteractionCenter({
  pendingSudo,
  pendingSecret,
  onSudoRespond,
  onSecretRespond,
}: InteractionCenterProps): React.JSX.Element | null {
  if (!pendingSudo && !pendingSecret) return null;

  return (
    <div className="chat-interaction-center">
      {pendingSudo && <SudoCard onSubmit={onSudoRespond} />}
      {pendingSecret && (
        <SecretCard req={pendingSecret} onSubmit={onSecretRespond} />
      )}
    </div>
  );
}
