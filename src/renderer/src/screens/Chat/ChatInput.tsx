import {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Send, Square as Stop, Slash, Paperclip } from "lucide-react";
import { isImeComposing } from "./keyboard";
import { useI18n } from "../../components/useI18n";
import { SLASH_COMMANDS, type SlashCommand } from "./slashCommands";
import { useInputHistory } from "./hooks/useInputHistory";
import {
  processFiles,
  filesFromClipboard,
  type AttachmentError,
} from "./attachmentUtils";
import { AttachmentChip } from "../../components/AttachmentChip";
import type { Attachment } from "../../../../shared/attachments";
import type { ClarifyRequest } from "./types";

export interface ModelOption {
  label: string;
  sublabel: string;
  model: string;
  provider: string;
  baseUrl: string;
}

export interface ChatInputHandle {
  setText(text: string): void;
  clear(): void;
  focus(): void;
  /** Add files from external sources (drop overlay).  Returns errors. */
  addFiles(files: File[] | FileList): Promise<AttachmentError[]>;
}

interface ChatInputProps {
  isLoading: boolean;
  hasSession: boolean;
  sessionId?: string | null;
  remoteMode?: boolean;
  modelOptions?: ModelOption[];
  pendingClarify?: ClarifyRequest | null;
  onModelSelect?: (option: ModelOption) => void;
  onSubmit: (text: string, attachments: Attachment[]) => void;
  onQuickAsk: (text: string, attachments: Attachment[]) => void;
  onAbort: () => void;
}

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  function ChatInput(
    {
      isLoading,
      hasSession,
      sessionId,
      remoteMode,
      modelOptions,
      pendingClarify,
      onModelSelect,
      onSubmit,
      onQuickAsk,
      onAbort,
    },
    ref,
  ): React.JSX.Element {
    const { t } = useI18n();
    const [input, setInput] = useState("");
    const [slashMenuOpen, setSlashMenuOpen] = useState(false);
    const [slashFilter, setSlashFilter] = useState("");
    const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
    const [modelMenuOpen, setModelMenuOpen] = useState(false);
    const [modelMenuFilter, setModelMenuFilter] = useState("");
    const [modelMenuSelectedIndex, setModelMenuSelectedIndex] = useState(0);
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [attachmentError, setAttachmentError] = useState<string | null>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const slashMenuRef = useRef<HTMLDivElement>(null);
    const modelMenuRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const autoResize = useCallback((): void => {
      const el = inputRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }, []);

    const applyHistoryText = useCallback(
      (text: string): void => {
        setInput(text);
        requestAnimationFrame(() => {
          autoResize();
          inputRef.current?.setSelectionRange(text.length, text.length);
        });
      },
      [autoResize],
    );

    const history = useInputHistory({
      currentInput: input,
      applyText: applyHistoryText,
    });

    const formatError = useCallback(
      (err: AttachmentError): string => {
        switch (err.code) {
          case "too-many":
            return t("chat.attachTooMany");
          case "image-too-large":
            return t("chat.attachImageTooLarge", { name: err.filename });
          case "text-too-large":
            return t("chat.attachTextTooLarge", { name: err.filename });
          case "unsupported-type":
            return t("chat.attachUnsupported", { name: err.filename });
          case "read-failed":
            return t("chat.attachReadFailed", { name: err.filename });
          case "remote-mode-binary":
            return t("chat.attachRemoteModeBinary", { name: err.filename });
          default:
            return err.filename;
        }
      },
      [t],
    );

    const ingestFiles = useCallback(
      async (files: File[] | FileList): Promise<AttachmentError[]> => {
        const { attachments: added, errors } = await processFiles(
          files,
          attachments.length,
          {
            sessionId: sessionId || undefined,
            remoteMode: !!remoteMode,
          },
        );
        if (added.length > 0) {
          setAttachments((prev) => [...prev, ...added]);
        }
        if (errors.length > 0) {
          setAttachmentError(formatError(errors[0]));
        } else {
          setAttachmentError(null);
        }
        return errors;
      },
      [attachments.length, formatError, sessionId, remoteMode],
    );

    useImperativeHandle(
      ref,
      () => ({
        setText(text: string): void {
          setInput(text);
          requestAnimationFrame(() => {
            autoResize();
            if (inputRef.current) {
              inputRef.current.setSelectionRange(text.length, text.length);
              inputRef.current.focus();
            }
          });
        },
        clear(): void {
          setInput("");
          setAttachments([]);
          setAttachmentError(null);
          if (inputRef.current) inputRef.current.style.height = "auto";
        },
        focus(): void {
          inputRef.current?.focus();
        },
        addFiles(files: File[] | FileList): Promise<AttachmentError[]> {
          return ingestFiles(files);
        },
      }),
      [autoResize, ingestFiles],
    );

    // Refocus the textarea when a streaming response ends
    useEffect(() => {
      if (!isLoading) inputRef.current?.focus();
    }, [isLoading]);

    // Close slash menu on click outside
    useEffect(() => {
      if (!slashMenuOpen) return;
      function handleClickOutside(e: MouseEvent): void {
        if (
          slashMenuRef.current &&
          !slashMenuRef.current.contains(e.target as Node)
        ) {
          setSlashMenuOpen(false);
        }
      }
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }, [slashMenuOpen]);

    // Close model menu on click outside
    useEffect(() => {
      if (!modelMenuOpen) return;
      function handleClickOutside(e: MouseEvent): void {
        if (
          modelMenuRef.current &&
          !modelMenuRef.current.contains(e.target as Node)
        ) {
          setModelMenuOpen(false);
        }
      }
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }, [modelMenuOpen]);

    // Scroll active slash menu item into view
    useEffect(() => {
      if (!slashMenuOpen) return;
      const active = slashMenuRef.current?.querySelector(
        ".slash-menu-item-active",
      );
      active?.scrollIntoView({ block: "nearest" });
    }, [slashSelectedIndex, slashMenuOpen]);

    // Scroll active model menu item into view
    useEffect(() => {
      if (!modelMenuOpen) return;
      const active = modelMenuRef.current?.querySelector(
        ".slash-menu-item-active",
      );
      active?.scrollIntoView({ block: "nearest" });
    }, [modelMenuSelectedIndex, modelMenuOpen]);

    const filteredSlashCommands = useMemo(
      () =>
        slashMenuOpen
          ? SLASH_COMMANDS.filter((cmd) =>
              cmd.name.toLowerCase().startsWith(slashFilter.toLowerCase()),
            )
          : [],
      [slashMenuOpen, slashFilter],
    );

    const filteredModelOptions = useMemo(
      () => {
        if (!modelMenuOpen || !modelOptions?.length) return [];
        if (!modelMenuFilter) return modelOptions;
        const q = modelMenuFilter.toLowerCase();
        return modelOptions.filter(
          (m) =>
            m.label.toLowerCase().includes(q) ||
            m.sublabel.toLowerCase().includes(q),
        );
      },
      [modelMenuOpen, modelOptions, modelMenuFilter],
    );

    function clearAfterSend(text: string): void {
      history.push(text);
      setInput("");
      setAttachments([]);
      setAttachmentError(null);
      if (inputRef.current) inputRef.current.style.height = "auto";
    }

    function handleSend(): void {
      const text = input.trim();
      const hasPayload = text.length > 0 || attachments.length > 0;
      if (!hasPayload || isLoading) return;
      setSlashMenuOpen(false);
      setModelMenuOpen(false);
      const sendAttachments = attachments;
      clearAfterSend(text);
      onSubmit(text, sendAttachments);
    }

    function handleQuickAsk(): void {
      const text = input.trim();
      if (!text || isLoading) return;
      const sendAttachments = attachments;
      clearAfterSend(text);
      onQuickAsk(text, sendAttachments);
    }

    function handleSlashSelect(cmd: SlashCommand): void {
      setSlashMenuOpen(false);
      // Commands with custom param autocomplete: insert prefix and show param menu
      if (cmd.hasParams) {
        setInput(cmd.name + " ");
        setModelMenuOpen(true);
        setModelMenuFilter("");
        setModelMenuSelectedIndex(0);
        inputRef.current?.focus();
        return;
      }
      // Local / info commands dispatch immediately — let parent route through onSubmit
      if (cmd.local || cmd.category === "info") {
        setInput("");
        if (inputRef.current) inputRef.current.style.height = "auto";
        onSubmit(cmd.name, []);
        return;
      }
      // Backend commands that take arguments: insert prefix and wait for the user
      setInput(cmd.name + " ");
      inputRef.current?.focus();
    }

    function handleModelSelect(option: ModelOption): void {
      setModelMenuOpen(false);
      setInput("");
      if (inputRef.current) inputRef.current.style.height = "auto";
      onModelSelect?.(option);
    }

    function handleInputChange(
      e: React.ChangeEvent<HTMLTextAreaElement>,
    ): void {
      const value = e.target.value;
      setInput(value);

      const target = e.target;
      requestAnimationFrame(() => {
        target.style.height = "auto";
        target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
      });

      // Detect /model <filter> for param autocomplete
      if (value.startsWith("/model ")) {
        const filter = value.slice(7).trim();
        if (!modelMenuOpen) {
          setModelMenuOpen(true);
          setModelMenuSelectedIndex(0);
        }
        setModelMenuFilter(filter);
        if (slashMenuOpen) setSlashMenuOpen(false);
        return;
      }

      if (modelMenuOpen) setModelMenuOpen(false);

      if (value.startsWith("/") && !value.includes(" ")) {
        const query = value.split(" ")[0];
        setSlashMenuOpen(true);
        setSlashFilter(query);
        setSlashSelectedIndex(0);
      } else if (slashMenuOpen) {
        setSlashMenuOpen(false);
      }
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
      if (isImeComposing(e)) return;

      // Model menu keyboard navigation
      if (modelMenuOpen && filteredModelOptions.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setModelMenuSelectedIndex((i) =>
            i < filteredModelOptions.length - 1 ? i + 1 : 0,
          );
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setModelMenuSelectedIndex((i) =>
            i > 0 ? i - 1 : filteredModelOptions.length - 1,
          );
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          handleModelSelect(filteredModelOptions[modelMenuSelectedIndex]);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setModelMenuOpen(false);
          return;
        }
      }

      // Slash menu keyboard navigation
      if (slashMenuOpen && filteredSlashCommands.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSlashSelectedIndex((i) =>
            i < filteredSlashCommands.length - 1 ? i + 1 : 0,
          );
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSlashSelectedIndex((i) =>
            i > 0 ? i - 1 : filteredSlashCommands.length - 1,
          );
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          handleSlashSelect(filteredSlashCommands[slashSelectedIndex]);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setSlashMenuOpen(false);
          return;
        }
      }

      // History navigation: ArrowUp/Down when not in a multiline draft (or already navigating)
      if (!slashMenuOpen && !modelMenuOpen && (history.isNavigating() || !input.includes("\n"))) {
        if (e.key === "ArrowUp" && history.size() > 0) {
          if (history.recallPrev()) {
            e.preventDefault();
            return;
          }
        }
        if (e.key === "ArrowDown" && history.isNavigating()) {
          if (history.recallNext()) {
            e.preventDefault();
            return;
          }
        }
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    }

    function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>): void {
      const { files, hasText } = filesFromClipboard(e);
      if (files.length === 0) return;
      // If there's also text, let the textarea handle the text portion
      // normally; we still consume the files (browser delivers both).
      if (!hasText) e.preventDefault();
      void ingestFiles(files);
    }

    async function handleFileInputChange(
      e: React.ChangeEvent<HTMLInputElement>,
    ): Promise<void> {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      await ingestFiles(files);
      // Reset so the same file can be picked again later
      if (fileInputRef.current) fileInputRef.current.value = "";
    }

    function removeAttachment(id: string): void {
      setAttachments((prev) => prev.filter((a) => a.id !== id));
      setAttachmentError(null);
    }

    const canSend =
      (input.trim().length > 0 || attachments.length > 0) && !isLoading;

    return (
      <>
        {slashMenuOpen && filteredSlashCommands.length > 0 && (
          <div className="slash-menu" ref={slashMenuRef}>
            <div className="slash-menu-header">
              <Slash size={12} />
              {t("chat.commandsTitle")}
            </div>
            <div className="slash-menu-list">
              {filteredSlashCommands.map((cmd, i) => (
                <button
                  key={cmd.name}
                  className={`slash-menu-item ${i === slashSelectedIndex ? "slash-menu-item-active" : ""}`}
                  onMouseEnter={() => setSlashSelectedIndex(i)}
                  onClick={() => handleSlashSelect(cmd)}
                >
                  <span className="slash-menu-item-name">{cmd.name}</span>
                  <span className="slash-menu-item-desc">
                    {cmd.description}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        {modelMenuOpen && filteredModelOptions.length > 0 && (
          <div className="slash-menu" ref={modelMenuRef}>
            <div className="slash-menu-header">
              <Slash size={12} />
              Models
            </div>
            <div className="slash-menu-list">
              {filteredModelOptions.map((opt, i) => (
                <button
                  key={`${opt.provider}:${opt.model}`}
                  className={`slash-menu-item ${i === modelMenuSelectedIndex ? "slash-menu-item-active" : ""}`}
                  onMouseEnter={() => setModelMenuSelectedIndex(i)}
                  onClick={() => handleModelSelect(opt)}
                >
                  <span className="slash-menu-item-name">{opt.label}</span>
                  <span className="slash-menu-item-desc">{opt.sublabel}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {(attachments.length > 0 || attachmentError) && (
          <div className="chat-attachment-strip">
            {attachments.map((att) => (
              <AttachmentChip
                key={att.id}
                attachment={att}
                onRemove={() => removeAttachment(att.id)}
              />
            ))}
            {attachmentError && (
              <div className="chat-attachment-error" role="alert">
                {attachmentError}
              </div>
            )}
          </div>
        )}
        {pendingClarify && (
          <div className="chat-clarify-bar">
            <div className="chat-clarify-question">{pendingClarify.question}</div>
            {pendingClarify.choices && pendingClarify.choices.length > 0 && (
              <div className="chat-clarify-choices">
                {pendingClarify.choices.map((choice) => (
                  <button
                    key={choice}
                    className="chat-clarify-choice"
                    onClick={() => {
                      setInput(choice);
                      requestAnimationFrame(() => {
                        autoResize();
                        inputRef.current?.focus();
                      });
                    }}
                  >
                    {choice}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="chat-input-wrapper">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={handleFileInputChange}
          />
          <button
            className="chat-attach-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            title={t("chat.attach")}
            aria-label={t("chat.attach")}
            type="button"
          >
            <Paperclip size={16} />
          </button>
          <textarea
            ref={inputRef}
            className="chat-input"
            placeholder={pendingClarify ? t("chat.answerClarify") : t("chat.typeMessage")}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            rows={1}
            autoFocus
          />
          {isLoading ? (
            <button
              className="chat-send-btn chat-stop-btn"
              onClick={onAbort}
              title={t("common.stop")}
            >
              <Stop size={14} />
            </button>
          ) : (
            <>
              {input.trim() && hasSession && (
                <button
                  className="chat-btw-btn"
                  onClick={handleQuickAsk}
                  title={t("chat.quickAskTitle")}
                >
                  💭
                </button>
              )}
              <button
                className="chat-send-btn"
                onClick={handleSend}
                disabled={!canSend}
                title={t("chat.send")}
              >
                <Send size={16} />
              </button>
            </>
          )}
        </div>
      </>
    );
  },
);
