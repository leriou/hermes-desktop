import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTauriChatGatewayClient } from "./tauriChatGatewayClient";

describe("tauriChatGatewayClient", () => {
  beforeEach(() => {
    Object.defineProperty(window, "hermesAPI", {
      configurable: true,
      value: {
        startGateway: vi.fn().mockResolvedValue(undefined),
        tuiCreateSession: vi.fn().mockResolvedValue({ session_id: "rt-1" }),
        tuiResumeSession: vi.fn().mockResolvedValue({ session_id: "resumed-1" }),
        tuiSubmitPrompt: vi.fn().mockResolvedValue(undefined),
        tuiSteer: vi.fn().mockResolvedValue({ result: { status: "queued" } }),
        tuiCompress: vi.fn().mockResolvedValue({ result: { messages: [] } }),
        tuiSetModel: vi.fn().mockResolvedValue({ result: { model: "gpt-4o" } }),
        tuiCommandDispatch: vi.fn().mockResolvedValue({ result: { output: "ok" } }),
        tuiSessionTitle: vi.fn().mockResolvedValue({ session_key: "db-1", title: "Title" }),
        tuiUndo: vi.fn().mockResolvedValue(undefined),
        tuiSessionHistory: vi.fn().mockResolvedValue({ result: { messages: [] } }),
        tuiSessionBranch: vi.fn().mockResolvedValue({ result: { session_id: "branch-1" } }),
        tuiClarifyRespond: vi.fn().mockResolvedValue(undefined),
        tuiApprovalRespond: vi.fn().mockResolvedValue(undefined),
        tuiSudoRespond: vi.fn().mockResolvedValue(undefined),
        tuiSecretRespond: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("starts the Tauri gateway before creating and submitting to a session", async () => {
    const client = createTauriChatGatewayClient();
    const sid = await client.ensureSession(null);
    await client.submitPrompt(sid, "hello");

    expect(window.hermesAPI.startGateway).toHaveBeenCalledTimes(1);
    expect(window.hermesAPI.tuiCreateSession).toHaveBeenCalledTimes(1);
    expect(window.hermesAPI.tuiSubmitPrompt).toHaveBeenCalledWith("rt-1", "hello");
  });

  it("submits through a new session when no runtime session exists", async () => {
    const client = createTauriChatGatewayClient();
    const sid = await client.submitPromptWithSession({
      currentSessionId: null,
      dbSessionId: null,
      text: "hello",
    });

    expect(sid).toBe("rt-1");
    expect(window.hermesAPI.startGateway).toHaveBeenCalledTimes(1);
    expect(window.hermesAPI.tuiCreateSession).toHaveBeenCalledTimes(1);
    expect(window.hermesAPI.tuiSubmitPrompt).toHaveBeenCalledWith("rt-1", "hello");
  });

  it("resumes db session and retries when submit reports an invalid runtime session", async () => {
    window.hermesAPI.tuiSubmitPrompt = vi
      .fn()
      .mockRejectedValueOnce(new Error("session expired"))
      .mockResolvedValueOnce(undefined);
    const client = createTauriChatGatewayClient();

    const sid = await client.submitPromptWithSession({
      currentSessionId: "old-runtime",
      dbSessionId: "db-1",
      text: "hello",
    });

    expect(sid).toBe("resumed-1");
    expect(window.hermesAPI.tuiResumeSession).toHaveBeenCalledWith("db-1");
    expect(window.hermesAPI.tuiSubmitPrompt).toHaveBeenNthCalledWith(1, "old-runtime", "hello");
    expect(window.hermesAPI.tuiSubmitPrompt).toHaveBeenNthCalledWith(2, "resumed-1", "hello");
  });

  it("keeps approval and secret-style interactions on the same client surface", async () => {
    const client = createTauriChatGatewayClient();

    await client.respondApproval("rt-1", "approve", false);
    await client.respondClarify("rt-1", "answer", "clarify-1");
    await client.respondSudo("rt-1", "pw", "sudo-1");
    await client.respondSecret("rt-1", "secret", "secret-1");

    expect(window.hermesAPI.tuiApprovalRespond).toHaveBeenCalledWith("rt-1", "approve", false);
    expect(window.hermesAPI.tuiClarifyRespond).toHaveBeenCalledWith("rt-1", "answer", "clarify-1");
    expect(window.hermesAPI.tuiSudoRespond).toHaveBeenCalledWith("rt-1", "pw", "sudo-1");
    expect(window.hermesAPI.tuiSecretRespond).toHaveBeenCalledWith("rt-1", "secret", "secret-1");
  });

  it("exposes Tauri gateway command operations behind the client", async () => {
    const client = createTauriChatGatewayClient();

    await client.compress("rt-1", "focus");
    await client.setModel("rt-1", "gpt-4o");
    await client.dispatchCommand("rt-1", "goal", "ship");
    await client.sessionTitle("rt-1");
    await client.undo("rt-1");
    await client.sessionHistory("rt-1");
    await client.branch("rt-1", "safe path");

    expect(window.hermesAPI.tuiCompress).toHaveBeenCalledWith("rt-1", "focus");
    expect(window.hermesAPI.tuiSetModel).toHaveBeenCalledWith("rt-1", "gpt-4o");
    expect(window.hermesAPI.tuiCommandDispatch).toHaveBeenCalledWith("rt-1", "goal", "ship");
    expect(window.hermesAPI.tuiSessionTitle).toHaveBeenCalledWith("rt-1");
    expect(window.hermesAPI.tuiUndo).toHaveBeenCalledWith("rt-1");
    expect(window.hermesAPI.tuiSessionHistory).toHaveBeenCalledWith("rt-1");
    expect(window.hermesAPI.tuiSessionBranch).toHaveBeenCalledWith("rt-1", "safe path");
  });
});
