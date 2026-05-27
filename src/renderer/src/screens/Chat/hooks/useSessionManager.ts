import { useState, useCallback, useRef } from "react";
import type {
  ApprovalRequest,
  ChatMessage,
  ClarifyRequest,
  SudoRequest,
  SecretRequest,
  TodoItem,
} from "../types";
import type { SessionEntry, SessionStatus } from "../SessionSidebar";
import { sessionDisplayPreview, sessionDisplayTitle } from "../sessionDisplay";

export interface SessionState {
  messages: ChatMessage[];
  hermesSessionId: string | null;
  dbSessionId: string | null;
  relatedSessionIds: string[];
  isLoading: boolean;
  usage: import("../types").UsageState | null;
  toolProgress: string | null;
  streamingText: string;
  streamingReasoning: string;
  pendingApproval: ApprovalRequest | null;
  pendingClarify: ClarifyRequest | null;
  pendingSudo: SudoRequest | null;
  pendingSecret: SecretRequest | null;
  pendingModelSwitch: string | null;
  pendingModelSwitchMessageId: string | null;
  todos: TodoItem[];
  unreadCount: number;
  title: string;
  model: string;
  updatedAt: number;
  abortRequested?: boolean;
}

function emptySession(): SessionState {
  return {
    messages: [],
    hermesSessionId: null,
    dbSessionId: null,
    relatedSessionIds: [],
    isLoading: false,
    usage: null,
    toolProgress: null,
    streamingText: "",
    streamingReasoning: "",
    pendingApproval: null,
    pendingClarify: null,
    pendingSudo: null,
    pendingSecret: null,
    pendingModelSwitch: null,
    pendingModelSwitchMessageId: null,
    todos: [],
    unreadCount: 0,
    title: "",
    model: "",
    updatedAt: Date.now(),
  };
}

let nextTabId = 1;
function generateTabId(): string {
  return `tab-${Date.now()}-${nextTabId++}`;
}

function createInitialState(): {
  sessions: Map<string, SessionState>;
  tabOrder: string[];
  activeTabId: string;
} {
  const id = generateTabId();
  const map = new Map<string, SessionState>();
  map.set(id, emptySession());
  return { sessions: map, tabOrder: [id], activeTabId: id };
}

export function useSessionManager() {
  const [initial] = useState(createInitialState);
  const [sessions, setSessions] = useState(initial.sessions);
  const [tabOrder, setTabOrder] = useState<string[]>(initial.tabOrder);
  const [activeTabId, setActiveTabId] = useState<string | null>(
    initial.activeTabId,
  );
  const sessionsRef = useRef(sessions);
  const activeTabIdRef = useRef<string | null>(initial.activeTabId);

  const setSessionsState = useCallback(
    (updater: React.SetStateAction<Map<string, SessionState>>) => {
      setSessions((prev) => {
        const next =
          typeof updater === "function"
            ? (
                updater as (
                  prev: Map<string, SessionState>,
                ) => Map<string, SessionState>
              )(prev)
            : updater;
        sessionsRef.current = next;
        return next;
      });
    },
    [],
  );

  const setActiveTabIdState = useCallback((id: string | null) => {
    activeTabIdRef.current = id;
    setActiveTabId(id);
  }, []);

  const getActive = useCallback((): SessionState | undefined => {
    if (!activeTabId) return undefined;
    return sessions.get(activeTabId);
  }, [activeTabId, sessions]);

  const createTab = useCallback((): string => {
    const id = generateTabId();
    setSessionsState((prev) => {
      const next = new Map(prev);
      next.set(id, emptySession());
      return next;
    });
    setTabOrder((prev) => [id, ...prev]);
    setActiveTabIdState(id);
    return id;
  }, [setActiveTabIdState, setSessionsState]);

  const createTabWith = useCallback(
    (initial: Partial<SessionState>): string => {
      const id = generateTabId();
      setSessionsState((prev) => {
        const next = new Map(prev);
        next.set(id, { ...emptySession(), ...initial });
        return next;
      });
      setTabOrder((prev) => [id, ...prev]);
      setActiveTabIdState(id);
      return id;
    },
    [setActiveTabIdState, setSessionsState],
  );

  const switchTab = useCallback(
    (id: string) => {
      setActiveTabIdState(id);
      setSessionsState((prev) => {
        const existing = prev.get(id);
        if (!existing || existing.unreadCount === 0) return prev;
        const next = new Map(prev);
        next.set(id, { ...existing, unreadCount: 0, updatedAt: Date.now() });
        return next;
      });
      setTabOrder((prev) => {
        if (prev[0] === id) return prev;
        return [id, ...prev.filter((t) => t !== id)];
      });
    },
    [setActiveTabIdState, setSessionsState],
  );

  const closeTab = useCallback(
    (id: string) => {
      setSessionsState((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      setTabOrder((prev) => {
        const remaining = prev.filter((t) => t !== id);
        if (activeTabId === id && remaining.length > 0) {
          setActiveTabIdState(remaining[0]);
        } else if (remaining.length === 0) {
          const newId = generateTabId();
          setSessionsState((prev2) => {
            const next2 = new Map(prev2);
            next2.set(newId, emptySession());
            return next2;
          });
          setActiveTabIdState(newId);
          return [newId];
        }
        return remaining;
      });
    },
    [activeTabId, setActiveTabIdState, setSessionsState],
  );

  const updateTab = useCallback(
    (id: string, patch: Partial<SessionState>) => {
      setSessionsState((prev) => {
        const existing = prev.get(id);
        if (!existing) return prev;
        const next = new Map(prev);
        next.set(id, {
          ...existing,
          ...patch,
          updatedAt: patch.updatedAt ?? Date.now(),
        });
        return next;
      });
    },
    [setSessionsState],
  );

  const updateTabMessages = useCallback(
    (id: string, updater: (prev: ChatMessage[]) => ChatMessage[]) => {
      setSessionsState((prev) => {
        const existing = prev.get(id);
        if (!existing) return prev;
        const next = new Map(prev);
        next.set(id, {
          ...existing,
          messages: updater(existing.messages),
          updatedAt: Date.now(),
        });
        return next;
      });
    },
    [setSessionsState],
  );

  const findTabBySessionId = useCallback((sid: string): string | null => {
    for (const [id, s] of sessionsRef.current.entries()) {
      if (s.hermesSessionId === sid || s.dbSessionId === sid) return id;
      if (s.relatedSessionIds.includes(sid)) return id;
    }
    return null;
  }, []);

  const getActiveTabId = useCallback(
    (): string | null => activeTabIdRef.current,
    [],
  );

  const getSidebarEntries = useCallback((): SessionEntry[] => {
    return tabOrder
      .map((id) => {
        const s = sessions.get(id);
        if (!s) {
          return {
            id,
            title: "",
            model: "",
            status: "idle" as SessionStatus,
            updatedAt: Date.now(),
            messageCount: 0,
            preview: "",
            unreadCount: 0,
          };
        }
        const lastMsg = s.messages[s.messages.length - 1];
        // During streaming, show streaming text as preview for live feedback
        const streamingPreview = s.streamingText
          ? s.streamingText.slice(-60)
          : "";
        const msgPreview = lastMsg
          ? "content" in lastMsg
            ? (lastMsg.content || "").slice(-60)
            : "text" in lastMsg
              ? (lastMsg.text || "").slice(-60)
              : ""
          : "";
        const preview = streamingPreview || msgPreview;
        return {
          id,
          title: sessionDisplayTitle({ title: s.title, preview }),
          model: s.model || "",
          status: s.isLoading
            ? ("streaming" as SessionStatus)
            : s.toolProgress
              ? ("streaming" as SessionStatus)
              : ("idle" as SessionStatus),
          updatedAt: s.updatedAt,
          messageCount: s.messages.length,
          preview: sessionDisplayPreview({
            title: s.title,
            preview,
            model: s.model,
            messageCount: s.messages.length,
          }),
          dbSessionId: s.dbSessionId ?? s.hermesSessionId ?? undefined,
          unreadCount: s.unreadCount,
        };
      })
      .filter((e) => e.messageCount > 0 || e.status === "streaming");
  }, [tabOrder, sessions]);

  return {
    sessions,
    tabOrder,
    activeTabId,
    getActive,
    createTab,
    createTabWith,
    switchTab,
    closeTab,
    updateTab,
    updateTabMessages,
    findTabBySessionId,
    getActiveTabId,
    getSidebarEntries,
    setActiveTabId: setActiveTabIdState,
  };
}
