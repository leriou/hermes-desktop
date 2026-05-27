import { useCallback } from "react";
import type { ChatMessage } from "../types";
import { shortModelName } from "../sessionDisplay";

interface UseGatewayCommandsOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gatewayClient: any;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  addAgentMessage: (content: string) => void;
  addStatusMessage: (title: string, content?: string, tone?: "info" | "success" | "warning" | "error") => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addSystemEvent: (event: any, title: string, content?: string, options?: any) => void;
  setIsLoading: (loading: boolean) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dispatch: (action: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSessionStateChange?: (patch: any) => void;
  sessionModel: string | null;
  isLoading: boolean;
  currentModel: string;
  displayModel: string;
}

export function useGatewayCommands({
  gatewayClient,
  setMessages,
  addAgentMessage,
  addStatusMessage,
  addSystemEvent,
  setIsLoading,
  dispatch,
  onSessionStateChange,
  sessionModel,
  isLoading,
  currentModel,
  displayModel,
}: UseGatewayCommandsOptions) {
  const syncSessionBinding = useCallback(
    async (runtimeSessionId: string | null) => {
      if (!runtimeSessionId) return;
      try {
        const res = await gatewayClient.sessionTitle(runtimeSessionId);
        if (res?.session_key) {
          onSessionStateChange?.({
            hermesSessionId: runtimeSessionId,
            dbSessionId: res.session_key,
            ...(res.title ? { title: res.title } : {}),
          });
        }
      } catch {
        /* ignore */
      }
    },
    [gatewayClient, onSessionStateChange],
  );

  const gatewayMessagesToChat = useCallback((items: any[]): ChatMessage[] => {
    const now = Date.now();
    const out: ChatMessage[] = [];
    items.forEach((msg, idx) => {
      const id = `gw-${now}-${idx}`;
      if (msg.role === "user" && (msg.text || msg.content)) {
        out.push({ id, role: "user", content: msg.text || msg.content });
        return;
      }
      if (msg.role === "assistant" && (msg.text || msg.content)) {
        out.push({ id, role: "agent", content: msg.text || msg.content });
        return;
      }
      if (msg.role === "tool") {
        out.push({
          id,
          kind: "tool_result",
          role: "agent",
          callId: "",
          name: msg.name || "tool",
          content: msg.context || msg.text || msg.content || "",
        });
      }
    });
    return out;
  }, []);

  const runCommandDispatchResult = useCallback(
    async (runtimeSessionId: string, result: any): Promise<boolean> => {
      const payload = result?.result ?? result ?? {};
      if (payload.notice) {
        addStatusMessage("Goal updated", String(payload.notice), "info");
      }
      if (payload.output) {
        addStatusMessage("Command result", String(payload.output), "info");
      }
      if (payload.warning) {
        addStatusMessage("Command warning", String(payload.warning), "warning");
      }
      if (payload.type === "send" && payload.message) {
        setMessages((prev) => [
          ...prev,
          {
            id: `user-command-${Date.now()}`,
            role: "user",
            content: String(payload.message),
            timestamp: Date.now(),
          },
        ]);
        await gatewayClient.submitPrompt(
          runtimeSessionId,
          String(payload.message),
        );
        return true;
      }
      setIsLoading(false);
      return true;
    },
    [addStatusMessage, gatewayClient, setMessages, setIsLoading],
  );

  const executeGatewayCommand = useCallback(
    async (runtimeSessionId: string, command: string): Promise<boolean> => {
      const trimmed = command.trim();
      const [cmd, ...rest] = trimmed.split(/\s+/);
      const arg = rest.join(" ").trim();

      if (cmd === "/compress") {
        const result = await gatewayClient.compress(
          runtimeSessionId,
          arg || undefined,
        );
        const payload = result?.result ?? result ?? {};
        if (Array.isArray(payload.messages)) {
          setMessages(gatewayMessagesToChat(payload.messages));
        }
        if (payload.info?.model) {
          dispatch({ type: "setSessionModel", value: payload.info.model });
          onSessionStateChange?.({ model: payload.info.model });
        }
        if (payload.info?.title) {
          dispatch({ type: "setSessionTitle", value: payload.info.title });
          onSessionStateChange?.({ title: payload.info.title });
        }
        if (payload.usage) {
          const usagePayload = {
            promptTokens: payload.usage.input ?? payload.usage.promptTokens ?? 0,
            completionTokens: payload.usage.output ?? payload.usage.completionTokens ?? 0,
            totalTokens: payload.usage.total ?? payload.usage.totalTokens ?? 0,
            cost: payload.usage.cost_usd ?? payload.usage.cost,
            calls: payload.usage.calls,
            cacheRead: payload.usage.cache_read,
            cacheWrite: payload.usage.cache_write,
            reasoning: payload.usage.reasoning,
            contextUsed: payload.usage.context_used,
            contextMax: payload.usage.context_max,
            contextPercent: payload.usage.context_percent,
          };
          dispatch({ type: "setUsage", value: usagePayload });
          onSessionStateChange?.({ usage: usagePayload });
        }
        const summaryText = [
          payload.summary?.headline,
          payload.summary?.token_line,
          payload.summary?.note,
        ]
          .filter(Boolean)
          .join("\n");

        const formatTokens = (val: any) => {
          if (typeof val === "number") return val.toLocaleString();
          if (typeof val === "string") {
            const num = parseInt(val, 10);
            return isNaN(num) ? val : num.toLocaleString();
          }
          return "";
        };
        const beforeTok = formatTokens(payload.before_tokens);
        const afterTok = formatTokens(payload.after_tokens);
        const compressTitle = beforeTok && afterTok
          ? `Session compressed (${beforeTok} ➜ ${afterTok} tok)`
          : "Session compressed";

        addSystemEvent(
          "context_compress",
          compressTitle,
          summaryText ||
            "Older context was summarized. Continue chatting in the same thread.",
        );
        await syncSessionBinding(runtimeSessionId);
        setIsLoading(false);
        return true;
      }

      if (cmd === "/model") {
        if (!arg) {
          const model =
            sessionModel ||
            currentModel ||
            displayModel ||
            "Not set";
          addAgentMessage(`**Current model:** \`${model}\``);
          setIsLoading(false);
          return true;
        }
        const switchMsgId = `model-switch-${Date.now()}`;
        onSessionStateChange?.({
          pendingModelSwitch: arg,
          pendingModelSwitchMessageId: switchMsgId,
        });
        addSystemEvent("model_switch", "Switching model", shortModelName(arg), {
          tone: "info",
          id: switchMsgId,
        });
        try {
          const result = await gatewayClient.setModel(runtimeSessionId, arg);
          const payload = result?.result ?? result ?? {};
          if (payload.warning) {
            addSystemEvent(
              "model_switch",
              "Model switch warning",
              String(payload.warning),
              { tone: "warning" },
            );
          }
        } finally {
          setIsLoading(false);
        }
        return true;
      }

      if (cmd === "/goal") {
        const result = await gatewayClient.dispatchCommand(
          runtimeSessionId,
          "goal",
          arg,
        );
        return runCommandDispatchResult(runtimeSessionId, result);
      }

      if (cmd === "/steer") {
        if (!arg) {
          addStatusMessage("Steer failed", "usage: /steer <prompt>", "error");
          setIsLoading(false);
          return true;
        }
        if (isLoading) {
          const result = await gatewayClient.steer(runtimeSessionId, arg);
          const payload = result?.result ?? result ?? {};
          if (payload.status === "queued") {
            addStatusMessage("Steer queued", arg, "success");
          } else {
            addStatusMessage("Steer rejected", arg, "warning");
          }
          setIsLoading(false);
          return true;
        }
        const result = await gatewayClient.dispatchCommand(
          runtimeSessionId,
          "steer",
          arg,
        );
        return runCommandDispatchResult(runtimeSessionId, result);
      }

      return false;
    },
    [
      addAgentMessage,
      addSystemEvent,
      addStatusMessage,
      dispatch,
      gatewayMessagesToChat,
      gatewayClient,
      isLoading,
      currentModel,
      displayModel,
      onSessionStateChange,
      runCommandDispatchResult,
      sessionModel,
      setMessages,
      syncSessionBinding,
    ],
  );

  return {
    executeGatewayCommand,
    syncSessionBinding,
  };
}
