import type { ApprovalDecision } from "./approvalPolicy";
import * as hermesAPI from "@renderer/lib/hermes-tauri";

type HermesApi = typeof hermesAPI;
type GatewayPayload = any;

export interface TauriChatGatewayClient {
  start(): Promise<void>;
  ensureSession(
    currentSessionId: string | null,
    model?: string,
  ): Promise<string>;
  submitPrompt(sessionId: string, text: string): Promise<void>;
  submitPromptWithSession(args: {
    currentSessionId: string | null;
    dbSessionId?: string | null;
    text: string;
    model?: string;
  }): Promise<string>;
  steer(sessionId: string, text: string): Promise<GatewayPayload>;
  compress(sessionId: string, focusTopic?: string): Promise<GatewayPayload>;
  setModel(sessionId: string, model: string): Promise<GatewayPayload>;
  dispatchCommand(
    sessionId: string,
    name: string,
    arg?: string,
  ): Promise<GatewayPayload>;
  sessionTitle(sessionId: string): Promise<GatewayPayload>;
  undo(sessionId: string): Promise<void>;
  sessionHistory(sessionId: string): Promise<GatewayPayload>;
  branch(sessionId: string, name?: string): Promise<GatewayPayload>;
  interrupt(sessionId: string): Promise<void>;
  respondClarify(
    sessionId: string,
    answer: string,
    requestId?: string,
  ): Promise<void>;
  respondApproval(
    sessionId: string,
    decision: ApprovalDecision,
    all?: boolean,
  ): Promise<void>;
  respondSudo(
    sessionId: string,
    password: string,
    requestId?: string,
  ): Promise<void>;
  respondSecret(
    sessionId: string,
    value: string,
    requestId?: string,
  ): Promise<void>;
}

export function createTauriChatGatewayClient(
  api: HermesApi = hermesAPI,
): TauriChatGatewayClient {
  return {
    async start(): Promise<void> {
      await api.startGateway();
    },

    async ensureSession(
      currentSessionId: string | null,
      model?: string,
    ): Promise<string> {
      await api.startGateway();
      if (currentSessionId) return currentSessionId;
      const res = await api.tuiCreateSession(model);
      const sid = res?.session_id;
      if (!sid) throw new Error("Failed to create Hermes TUI session");
      return sid;
    },

    async submitPrompt(sessionId: string, text: string): Promise<void> {
      await api.tuiSubmitPrompt(sessionId, text);
    },

    async submitPromptWithSession({
      currentSessionId,
      dbSessionId,
      text,
      model,
    }): Promise<string> {
      let sid = await this.ensureSession(currentSessionId, model);
      try {
        await api.tuiSubmitPrompt(sid, text);
        return sid;
      } catch (err) {
        const message = (err as Error).message || String(err);
        if (!/not found|invalid|expired|session/i.test(message)) throw err;
        if (dbSessionId) {
          const resumed = await api.tuiResumeSession(dbSessionId);
          sid = resumed?.session_id || sid;
        } else {
          const created = await api.tuiCreateSession(model);
          sid = created?.session_id;
        }
        if (!sid)
          throw new Error("Failed to create or resume Hermes TUI session");
        await api.tuiSubmitPrompt(sid, text);
        return sid;
      }
    },

    steer(sessionId: string, text: string): Promise<GatewayPayload> {
      return api.tuiSteer(sessionId, text);
    },

    compress(sessionId: string, focusTopic?: string): Promise<GatewayPayload> {
      return api.tuiCompress(sessionId, focusTopic);
    },

    setModel(sessionId: string, model: string): Promise<GatewayPayload> {
      return api.tuiSetModel(sessionId, model);
    },

    dispatchCommand(
      sessionId: string,
      name: string,
      arg?: string,
    ): Promise<GatewayPayload> {
      return api.tuiCommandDispatch(sessionId, name, arg);
    },

    sessionTitle(sessionId: string): Promise<GatewayPayload> {
      return api.tuiSessionTitle(sessionId);
    },

    async undo(sessionId: string): Promise<void> {
      await api.tuiUndo(sessionId);
    },

    sessionHistory(sessionId: string): Promise<GatewayPayload> {
      return api.tuiSessionHistory(sessionId);
    },

    branch(sessionId: string, name?: string): Promise<GatewayPayload> {
      return api.tuiSessionBranch(sessionId, name);
    },

    async interrupt(sessionId: string): Promise<void> {
      await api.tuiInterrupt(sessionId);
    },

    async respondClarify(
      sessionId: string,
      answer: string,
      requestId?: string,
    ): Promise<void> {
      await api.tuiClarifyRespond(sessionId, answer, requestId);
    },

    async respondApproval(
      sessionId: string,
      decision: ApprovalDecision,
      all = false,
    ): Promise<void> {
      await api.tuiApprovalRespond(sessionId, decision, all);
    },

    async respondSudo(
      sessionId: string,
      password: string,
      requestId?: string,
    ): Promise<void> {
      await api.tuiSudoRespond(sessionId, password, requestId);
    },

    async respondSecret(
      sessionId: string,
      value: string,
      requestId?: string,
    ): Promise<void> {
      await api.tuiSecretRespond(sessionId, value, requestId);
    },
  };
}
