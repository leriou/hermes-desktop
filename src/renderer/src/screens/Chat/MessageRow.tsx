import { memo, useCallback, useState } from "react";
import icon from "../../assets/icon.png";
import { AgentMarkdown } from "../../components/AgentMarkdown";
import { AttachmentChip } from "../../components/AttachmentChip";
import { useI18n } from "../../components/useI18n";
import { Copy, Volume2 } from "../../assets/icons";
import type { Attachment, ChatBubbleMessage, ChatMessage } from "./types";

function isChatBubbleMessage(msg: ChatMessage): msg is ChatBubbleMessage {
  return (
    msg.kind === "user" ||
    msg.kind === "assistant" ||
    (!msg.kind && (msg.role === "user" || msg.role === "agent"))
  );
}

export const HermesAvatar = memo(function HermesAvatar({
  size = 30,
}: {
  size?: number;
}): React.JSX.Element {
  return (
    <div className="chat-avatar chat-avatar-agent">
      <img src={icon} width={size} height={size} alt="" />
    </div>
  );
});

interface MessageRowProps {
  msg: ChatMessage;
  isLast: boolean;
  isLoading: boolean;
  onApprove: () => void;
  onDeny: () => void;
  lightweight?: boolean;
}

function formatMsgTime(ts?: number): string {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function shortModelName(model: string): string {
  if (model.includes("/")) model = model.split("/").pop()!;
  if (model.startsWith("models/")) model = model.slice(7);
  if (model.length > 28) model = model.slice(0, 26) + "…";
  return model;
}

export const MessageRow = memo(function MessageRow({
  msg,
  isLast,
  isLoading,
  onApprove: _onApprove,
  onDeny: _onDeny,
  lightweight = false,
}: MessageRowProps): React.JSX.Element {
  const { t } = useI18n();
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (!isChatBubbleMessage(msg) || !msg.content) return;
    void window.hermesAPI.copyToClipboard(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [msg]);

  const handleTts = useCallback(() => {
    if (!isChatBubbleMessage(msg) || !msg.content) return;
    window.hermesAPI.voiceTts(msg.content).catch((err) => {
      console.warn("[TTS] voice-tts failed:", err);
    });
  }, [msg]);

  if (!isChatBubbleMessage(msg)) {
    return (
      <div className={`chat-message chat-message-${msg.role}`}>
        <HermesAvatar />
        <div className={`chat-bubble chat-bubble-${msg.role}`}>
        </div>
      </div>
    );
  }

  const hasAttachments = !!msg.attachments && msg.attachments.length > 0;
  const isStreaming = msg.role === "agent" && isLast && isLoading;
  const showToolbar = msg.role === "agent" && !isStreaming && !!msg.content;
  const hasTimestamp = "timestamp" in msg && !!msg.timestamp;
  const hasModel = msg.role === "agent" && "model" in msg && !!msg.model && !isStreaming;

  return (
    <div className={`chat-message chat-message-${msg.role}`}>
      {msg.role === "user" ? (
        <div className="chat-avatar chat-avatar-user">U</div>
      ) : (
        <HermesAvatar />
      )}
      <div className={`chat-bubble chat-bubble-${msg.role}`}>
        {hasAttachments && (
          <div className="chat-message-attachments">
            {msg.attachments!.map((att) => (
              <AttachmentChip
                key={att.id}
                attachment={att}
                onPreview={(a) => a.kind === "image" && setPreviewAttachment(a)}
              />
            ))}
          </div>
        )}
        {msg.content &&
          (msg.role === "agent" ? (
            lightweight ? (
              <div className="markdown-body" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {msg.content}
              </div>
            ) : (
              <AgentMarkdown streaming={isStreaming}>{msg.content}</AgentMarkdown>
            )
          ) : (
            msg.content
          ))}
      </div>
      {!isStreaming && (showToolbar || hasTimestamp || hasModel) && (
        <div className={`chat-bubble-toolbar${!showToolbar ? " chat-bubble-toolbar--visible" : ""}`}>
          {showToolbar && (
            <button
              className="chat-toolbar-btn"
              onClick={handleCopy}
              title={t("chat.copy")}
            >
              <Copy size={13} />
              {copied ? t("chat.copied") : ""}
            </button>
          )}
          {hasTimestamp && (
            <span className="chat-toolbar-time">
              {formatMsgTime(msg.timestamp!)}
            </span>
          )}
          {hasModel && (
            <span className="chat-model-badge" title={msg.model}>
              {shortModelName(msg.model!)}
            </span>
          )}
          {showToolbar && (
            <button
              className="chat-toolbar-btn"
              onClick={handleTts}
              title={t("chat.tts")}
            >
              <Volume2 size={13} />
            </button>
          )}
        </div>
      )}
      {previewAttachment && previewAttachment.dataUrl && (
        <div
          className="chat-image-preview-backdrop"
          onClick={() => setPreviewAttachment(null)}
          role="dialog"
          aria-modal="true"
        >
          <img
            src={previewAttachment.dataUrl}
            alt={previewAttachment.name}
            className="chat-image-preview-image"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
});
