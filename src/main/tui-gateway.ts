import { ChildProcess, spawn } from "child_process";
import { HERMES_PYTHON, HERMES_REPO } from "./installer";
import { HIDDEN_SUBPROCESS_OPTIONS } from "./process-options";
import { getActiveProfileNameSync } from "./utils";
import EventEmitter from "events";

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  method: string;
  params?: any;
  id?: string | number;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id: string | number | null;
}

export interface JsonRpcEvent {
  jsonrpc: "2.0";
  method: "event";
  params: {
    type: string;
    payload: any;
    sid?: string;
  };
}

class TuiGateway extends EventEmitter {
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pendingRequests = new Map<
    string | number,
    { resolve: (val: any) => void; reject: (err: any) => void }
  >();
  private buffer = "";
  private restartCount = 0;
  private maxRestarts = 5;
  private isRestarting = false;

  async start(): Promise<void> {
    if (this.process) return;

    const profile = getActiveProfileNameSync();
    const env = {
      ...process.env,
      HERMES_PROFILE: profile,
      PYTHONUNBUFFERED: "1",
    };

    this.process = spawn(
      HERMES_PYTHON,
      ["-m", "tui_gateway.entry"],
      {
        cwd: HERMES_REPO,
        env,
        ...HIDDEN_SUBPROCESS_OPTIONS,
      }
    );

    this.process.stdout?.on("data", (data) => this.handleData(data));
    this.process.stderr?.on("data", (data) => {
      console.error(`[TUI GATEWAY STDERR] ${data}`);
    });

    this.process.on("close", (code) => {
      console.log(`[TUI GATEWAY] exited with code ${code}`);
      this.process = null;
      this.rejectAllPending("Gateway process closed");

      if (!this.isRestarting && this.restartCount < this.maxRestarts) {
        this.handleRestart();
      }
    });

    // Wait for gateway.ready event
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Gateway timeout")), 10000);
      this.once("event:gateway.ready", () => {
        this.restartCount = 0; // Reset on successful start
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  private async handleRestart() {
    this.isRestarting = true;
    this.restartCount++;
    console.log(`[TUI GATEWAY] Restarting (attempt ${this.restartCount}/${this.maxRestarts})...`);
    
    try {
      await this.start();
      // Try to resume most recent session
      const recent = await this.call("session.most_recent", {});
      if (recent && recent.session_id) {
        console.log(`[TUI GATEWAY] Resuming most recent session: ${recent.session_id}`);
        await this.resumeSession(recent.session_id);
      }
    } catch (err) {
      console.error("[TUI GATEWAY] Restart failed", err);
    } finally {
      this.isRestarting = false;
    }
  }

  stop() {
    this.isRestarting = true; // Prevent auto-restart on intentional stop
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  private handleData(data: Buffer) {
    this.buffer += data.toString();
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if ("id" in msg && msg.id !== null) {
          this.handleResponse(msg as JsonRpcResponse);
        } else if (msg.method === "event") {
          this.handleEvent(msg as JsonRpcEvent);
        }
      } catch (e) {
        console.error("[TUI GATEWAY] Parse error", e, line);
      }
    }
  }

  private handleResponse(res: JsonRpcResponse) {
    const pending = this.pendingRequests.get(res.id!);
    if (pending) {
      this.pendingRequests.delete(res.id!);
      if (res.error) {
        pending.reject(res.error);
      } else {
        pending.resolve(res.result);
      }
    }
  }

  private handleEvent(ev: JsonRpcEvent) {
    this.emit(`event:${ev.params.type}`, ev.params.payload, ev.params.sid);
    this.emit("event", ev.params);
  }

  private rejectAllPending(reason: string) {
    for (const pending of this.pendingRequests.values()) {
      pending.reject(new Error(reason));
    }
    this.pendingRequests.clear();
  }

  async call(method: string, params: any = {}): Promise<any> {
    if (!this.process && !this.isRestarting) {
      await this.start();
    }

    const id = ++this.requestId;
    const req: JsonRpcRequest = {
      jsonrpc: "2.0",
      method,
      params,
      id,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      if (this.process?.stdin?.writable) {
        this.process.stdin.write(JSON.stringify(req) + "\n");
      } else {
        reject(new Error("Gateway process not writable"));
      }
    });
  }

  // Specialized methods
  async createSession(model?: string): Promise<{ session_id: string }> {
    return this.call("session.create", { model });
  }

  async listSessions(limit = 100): Promise<any[]> {
    return this.call("session.list", { limit });
  }

  async resumeSession(sessionId: string): Promise<any> {
    return this.call("session.resume", { session_id: sessionId });
  }

  async submitPrompt(sessionId: string, text: string): Promise<void> {
    return this.call("prompt.submit", { session_id: sessionId, text });
  }

  async execSlash(sessionId: string, command: string) {
    return this.call("slash.exec", { session_id: sessionId, command });
  }

  async commandDispatch(sessionId: string, name: string, arg = "") {
    return this.call("command.dispatch", { session_id: sessionId, name, arg });
  }

  async compress(sessionId: string, focusTopic?: string) {
    return this.call("session.compress", { session_id: sessionId, focus_topic: focusTopic });
  }

  async steer(sessionId: string, text: string) {
    return this.call("session.steer", { session_id: sessionId, text });
  }

  async interrupt(sessionId: string) {
    return this.call("session.interrupt", { session_id: sessionId });
  }

  async undo(sessionId: string) {
    return this.call("session.undo", { session_id: sessionId });
  }

  async toolList(sessionId?: string) {
    return this.call("tools.list", { session_id: sessionId });
  }

  async toolShow(name?: string, sessionId?: string) {
    return this.call("tools.show", { name, session_id: sessionId });
  }

  // tools.configure expects {action: "enable"|"disable", names: [...]}
  async toolConfigure(name: string, enabled: boolean, sessionId?: string) {
    return this.call("tools.configure", {
      action: enabled ? "enable" : "disable",
      names: [name],
      session_id: sessionId,
    });
  }

  async approvalRespond(sessionId: string, response: string, all = false) {
    return this.call("approval.respond", { session_id: sessionId, choice: response, all });
  }

  async clarifyRespond(sessionId: string, response: string, requestId?: string) {
    return this.call("clarify.respond", { session_id: sessionId, answer: response, request_id: requestId });
  }

  async sudoRespond(sessionId: string, password: string, requestId?: string) {
    return this.call("sudo.respond", { session_id: sessionId, password, request_id: requestId });
  }

  async secretRespond(sessionId: string, value: string, requestId?: string) {
    return this.call("secret.respond", { session_id: sessionId, value, request_id: requestId });
  }

  async sessionStatus(sessionId: string) {
    return this.call("session.status", { session_id: sessionId });
  }

  async sessionUsage(sessionId: string) {
    return this.call("session.usage", { session_id: sessionId });
  }

  async completeSlash(prefix: string) {
    return this.call("complete.slash", { text: prefix });
  }

  async configSet(key: string, value: string, sessionId?: string) {
    return this.call("config.set", { key, value, session_id: sessionId });
  }

  async commandsCatalog() {
    return this.call("commands.catalog", {});
  }

  async sessionBranch(sessionId: string, name?: string) {
    return this.call("session.branch", { session_id: sessionId, name });
  }

  async voiceTts(text: string) {
    return this.call("voice.tts", { text });
  }
}


export const tuiGateway = new TuiGateway();
