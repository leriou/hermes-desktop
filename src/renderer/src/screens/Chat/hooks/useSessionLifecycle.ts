import { useCallback, useEffect, useRef, useReducer } from "react";
import type {
  ApprovalRequest,
  ChatMessage,
  ClarifyRequest,
  UsageState,
} from "../types";

interface SessionLifecycleState {
  hermesSessionId: string | null;
  pendingApproval: ApprovalRequest | null;
  pendingClarify: ClarifyRequest | null;
  sessionTitle: string | null;
  sessionModel: string | null;
  sessionStart: number | null;
  lastResponseAt: number | null;
  responseStart: number | null;
  lastResponseDuration: number | null;
  contextFolder: string | null;
  usage: UsageState | null;
  toolProgress: string | null;
}

type Action =
  | { type: "reset" }
  | { type: "setHermesSessionId"; value: string | null }
  | { type: "setPendingApproval"; value: ApprovalRequest | null }
  | { type: "setPendingClarify"; value: ClarifyRequest | null }
  | { type: "setSessionTitle"; value: string | null }
  | { type: "setSessionModel"; value: string | null }
  | { type: "setSessionStart"; value: number | null }
  | { type: "setLastResponseAt"; value: number | null }
  | { type: "setResponseStart"; value: number | null }
  | { type: "setLastResponseDuration"; value: number | null }
  | { type: "setContextFolder"; value: string | null }
  | { type: "setUsage"; value: UsageState | null }
  | { type: "setToolProgress"; value: string | null }
  | { type: "responseStarted"; now: number }
  | { type: "responseEnded"; now: number };

function initialState(): SessionLifecycleState {
  return {
    hermesSessionId: null,
    pendingApproval: null,
    pendingClarify: null,
    sessionTitle: null,
    sessionModel: null,
    sessionStart: null,
    lastResponseAt: null,
    responseStart: null,
    lastResponseDuration: null,
    contextFolder: null,
    usage: null,
    toolProgress: null,
  };
}

function reducer(
  state: SessionLifecycleState,
  action: Action,
): SessionLifecycleState {
  switch (action.type) {
    case "reset":
      return {
        ...initialState(),
        usage: state.usage,
        toolProgress: state.toolProgress,
      };
    case "setHermesSessionId":
      return { ...state, hermesSessionId: action.value };
    case "setPendingApproval":
      return { ...state, pendingApproval: action.value };
    case "setPendingClarify":
      return { ...state, pendingClarify: action.value };
    case "setSessionTitle":
      return { ...state, sessionTitle: action.value };
    case "setSessionModel":
      return { ...state, sessionModel: action.value };
    case "setSessionStart":
      return { ...state, sessionStart: action.value };
    case "setLastResponseAt":
      return { ...state, lastResponseAt: action.value };
    case "setResponseStart":
      return { ...state, responseStart: action.value };
    case "setLastResponseDuration":
      return { ...state, lastResponseDuration: action.value };
    case "setContextFolder":
      return { ...state, contextFolder: action.value };
    case "setUsage":
      return { ...state, usage: action.value };
    case "setToolProgress":
      return { ...state, toolProgress: action.value };
    case "responseStarted":
      return { ...state, responseStart: action.now };
    case "responseEnded":
      return {
        ...state,
        lastResponseAt: action.now,
        lastResponseDuration: state.responseStart
          ? action.now - state.responseStart
          : null,
        responseStart: null,
      };
    default:
      return state;
  }
}

export function useSessionLifecycle(
  messages: ChatMessage[],
  sessionId: string | null,
  isLoading: boolean,
) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  // Reset on new chat (messages cleared) / start timing on first message
  useEffect(() => {
    if (messages.length === 0) {
      dispatch({ type: "setHermesSessionId", value: null });
      dispatch({ type: "setContextFolder", value: null });
      dispatch({ type: "setSessionStart", value: null });
      dispatch({ type: "setSessionTitle", value: null });
      dispatch({ type: "setPendingApproval", value: null });
      dispatch({ type: "setPendingClarify", value: null });
      dispatch({ type: "setLastResponseAt", value: null });
    } else if (!state.sessionStart) {
      dispatch({ type: "setSessionStart", value: Date.now() });
    }
  }, [messages, state.sessionStart]);

  // Sync hermesSessionId when parent swaps to a different session
  useEffect(() => {
    dispatch({ type: "setHermesSessionId", value: sessionId });
    dispatch({ type: "setContextFolder", value: null });
  }, [sessionId]);

  // Track response timing
  const prevLoadingRef = useRef(false);
  useEffect(() => {
    if (isLoading && !prevLoadingRef.current) {
      dispatch({ type: "responseStarted", now: Date.now() });
    }
    if (prevLoadingRef.current && !isLoading && messages.length > 0) {
      dispatch({ type: "responseEnded", now: Date.now() });
    }
    prevLoadingRef.current = isLoading;
  }, [isLoading, messages.length]);

  const resetSession = useCallback(() => dispatch({ type: "reset" }), []);

  return { state, dispatch, resetSession };
}
