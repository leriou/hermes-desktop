import { ipcMain, type BrowserWindow } from "electron";
import { join } from "path";
import { mkdirSync, writeFileSync } from "fs";
import { tuiGateway } from "../tui-gateway";
import { stageAttachment, clearStagedAttachments } from "../attachment-staging";
import { discoverProviderModels } from "../model-discovery";
import {
  persistMessage,
  loadPersistedMessages,
  migratePersistedMessages,
} from "../sessions";
import { profileHome, getActiveProfileNameSync } from "../utils";

export function registerChatIPC(mainWindow: BrowserWindow | null): void {
  const runtimeToDbSession = new Map<string, string>();

  // Event forwarding from TUI Gateway to Renderer (+ persist messages)
  tuiGateway.on("event", (params) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("tui-event", params);
    }

    // Persist messages for TUI sessions (keyed by gateway short session_id)
    const { type, payload, sid } = params;
    if (!sid) return;

    if (type === "session.info") {
      const dbSid = runtimeToDbSession.get(sid);
      if (dbSid && dbSid !== sid) {
        migratePersistedMessages(sid, dbSid);
      }
      return;
    }

    if (type === "message.complete" && payload?.text) {
      persistMessage(sid, "assistant", payload.text);
    }

    if (type === "tool.start" && payload?.tool_id) {
      persistMessage(sid, "assistant", payload.args || "");
    }

    if (type === "tool.complete" && payload?.tool_id) {
      const resultText =
        typeof payload.result === "string"
          ? payload.result
          : JSON.stringify(payload.result ?? "");
      persistMessage(sid, "tool", resultText, {
        tool_call_id: payload.tool_id,
        tool_name: payload.name || "",
      });
    }
  });

  // TUI Gateway — session management
  ipcMain.handle(
    "tui-slash-exec",
    (_event, sessionId: string, command: string) => {
      return tuiGateway.execSlash(sessionId, command);
    },
  );

  ipcMain.handle(
    "tui-command-dispatch",
    (_event, sessionId: string, name: string, arg?: string) => {
      return tuiGateway.commandDispatch(sessionId, name, arg ?? "");
    },
  );

  ipcMain.handle(
    "tui-compress",
    async (_event, sessionId: string, focusTopic?: string) => {
      const result = await tuiGateway.compress(sessionId, focusTopic);
      const titleRes = await tuiGateway.call("session.title", { session_id: sessionId });
      const dbSid = titleRes?.session_key;
      if (dbSid && dbSid !== sessionId) {
        runtimeToDbSession.set(sessionId, dbSid);
        migratePersistedMessages(sessionId, dbSid);
      }
      return result;
    },
  );

  ipcMain.handle("tui-set-goal", (_event, sessionId: string, goal: string) => {
    return tuiGateway.commandDispatch(sessionId, "goal", goal);
  });

  ipcMain.handle(
    "tui-set-model",
    (_event, sessionId: string, model: string) => {
      return tuiGateway.execSlash(sessionId, `/model ${model} --tui-session`);
    },
  );

  ipcMain.handle("tui-steer", (_event, sessionId: string, text: string) => {
    return tuiGateway.steer(sessionId, text);
  });

  ipcMain.handle("tui-create-session", (_event, model?: string) => {
    return tuiGateway.createSession(model);
  });

  ipcMain.handle("tui-resume-session", async (_event, sessionId: string) => {
    const res = await tuiGateway.resumeSession(sessionId);
    if (res?.session_id && res?.resumed && res.session_id !== res.resumed) {
      runtimeToDbSession.set(res.session_id, res.resumed);
      migratePersistedMessages(res.resumed, res.session_id);
      const old = loadPersistedMessages(res.resumed);
      if (old.length > 0) {
        const existing = loadPersistedMessages(res.session_id);
        if (existing.length === 0) {
          const dir = join(
            profileHome(getActiveProfileNameSync()),
            "desktop",
            "messages",
          );
          try {
            mkdirSync(dir, { recursive: true });
            writeFileSync(
              join(dir, `${res.session_id}.json`),
              JSON.stringify(old),
            );
          } catch {
            /* ignore */
          }
        }
      }
    }
    return res;
  });

  ipcMain.handle("tui-session-history", (_event, sessionId: string) => {
    return tuiGateway.call("session.history", { session_id: sessionId });
  });

  ipcMain.handle(
    "tui-submit-prompt",
    (_event, sessionId: string, text: string) => {
      persistMessage(sessionId, "user", text);
      return tuiGateway.submitPrompt(sessionId, text);
    },
  );

  ipcMain.handle("tui-interrupt", (_event, sessionId: string) => {
    return tuiGateway.interrupt(sessionId);
  });

  ipcMain.handle("tui-undo", (_event, sessionId: string) => {
    return tuiGateway.undo(sessionId);
  });

  // TUI Gateway — tools, approval, session status, completion
  ipcMain.handle("tui-tools-list", (_event, sessionId?: string) => {
    return tuiGateway.toolList(sessionId);
  });

  ipcMain.handle(
    "tui-tools-show",
    (_event, name?: string, sessionId?: string) => {
      return tuiGateway.toolShow(name, sessionId);
    },
  );

  ipcMain.handle(
    "tui-tools-configure",
    (_event, name: string, enabled: boolean, sessionId?: string) => {
      return tuiGateway.toolConfigure(name, enabled, sessionId);
    },
  );

  ipcMain.handle(
    "tui-approval-respond",
    (_event, sessionId: string, response: string, all?: boolean) => {
      return tuiGateway.approvalRespond(sessionId, response, all);
    },
  );

  ipcMain.handle(
    "tui-clarify-respond",
    (_event, sessionId: string, answer: string, requestId?: string) => {
      return tuiGateway.clarifyRespond(sessionId, answer, requestId);
    },
  );

  ipcMain.handle(
    "tui-sudo-respond",
    (_event, sessionId: string, password: string, requestId?: string) => {
      return tuiGateway.sudoRespond(sessionId, password, requestId);
    },
  );

  ipcMain.handle(
    "tui-secret-respond",
    (_event, sessionId: string, value: string, requestId?: string) => {
      return tuiGateway.secretRespond(sessionId, value, requestId);
    },
  );

  ipcMain.handle("tui-session-title", (_event, sessionId: string) => {
    return tuiGateway.call("session.title", { session_id: sessionId });
  });

  ipcMain.handle("tui-session-status", (_event, sessionId: string) => {
    return tuiGateway.sessionStatus(sessionId);
  });

  ipcMain.handle("tui-session-usage", (_event, sessionId: string) => {
    return tuiGateway.sessionUsage(sessionId);
  });

  ipcMain.handle(
    "tui-session-branch",
    (_event, sessionId: string, name?: string) => {
      return tuiGateway.sessionBranch(sessionId, name);
    },
  );

  ipcMain.handle("tui-complete-slash", (_event, prefix: string) => {
    return tuiGateway.completeSlash(prefix);
  });

  ipcMain.handle("tui-commands-catalog", () => {
    return tuiGateway.commandsCatalog();
  });

  ipcMain.handle("voice-tts", (_event, text: string) => {
    return tuiGateway.voiceTts(text);
  });

  // Attachment staging
  ipcMain.handle(
    "stage-attachment",
    (_event, sessionId: string, filename: string, base64Bytes: string) => {
      return stageAttachment(sessionId, filename, base64Bytes);
    },
  );
  ipcMain.handle("clear-staged-attachments", (_event, sessionId: string) => {
    clearStagedAttachments(sessionId);
  });

  // Model discovery
  ipcMain.handle(
    "discover-provider-models",
    (
      _event,
      provider: string,
      baseUrl: string | undefined,
      apiKey: string | undefined,
      profile?: string,
    ) => {
      return discoverProviderModels(provider, baseUrl, apiKey, profile);
    },
  );
}
