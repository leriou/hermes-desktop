import "./assets/main.css";
import "./assets/domains/tokens.css";
import "./assets/domains/welcome.css";
import "./assets/domains/layout.css";
import "./assets/domains/chat.css";
import "./assets/domains/settings.css";
import "./assets/domains/agents.css";
import "./assets/domains/sessions.css";
import "./assets/domains/skills.css";
import "./assets/domains/plugins.css";
import "./assets/domains/memory.css";
import "./assets/domains/models.css";
import "./assets/domains/ui-styles.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { I18nProvider } from "./components/I18nProvider";
import { initAnalytics } from "./utils/analytics";
import * as hermesAPI from "./lib/hermes-tauri";
import { initStore, getStoreItem } from "./utils/store";
import { MARKDOWN_STYLE_STORAGE_KEY, MARKDOWN_STYLE_OPTIONS, type MarkdownStyle } from "./constants";

function setupTauriContextMenu(): void {
  document.addEventListener("contextmenu", (e) => {
    if (!(window as any).__TAURI_INTERNALS__) return;
    e.preventDefault();

    const target = e.target as HTMLElement;
    const isEditable =
      (target as HTMLInputElement).isContentEditable ||
      ["INPUT", "TEXTAREA"].includes(target.tagName);

    if (isEditable) {
      showContextMenu(e.x, e.y, [
        { label: "Cut", action: () => document.execCommand("cut") },
        { label: "Copy", action: () => document.execCommand("copy") },
        { label: "Paste", action: () => document.execCommand("paste") },
        { type: "separator" },
        {
          label: "Select All",
          action: () => document.execCommand("selectAll"),
        },
        { type: "separator" },
        {
          label: "Copy entire chat (text)",
          action: () =>
            window.dispatchEvent(
              new CustomEvent("hermes-copy-chat", { detail: "text" }),
            ),
        },
        {
          label: "Copy entire chat (Markdown)",
          action: () =>
            window.dispatchEvent(
              new CustomEvent("hermes-copy-chat", { detail: "markdown" }),
            ),
        },
      ]);
    } else {
      showContextMenu(e.x, e.y, [
        { label: "Copy", action: () => document.execCommand("copy") },
        { type: "separator" },
        {
          label: "Select All",
          action: () => {
            const bubble = document
              .elementFromPoint(e.x, e.y)
              ?.closest(".chat-bubble");
            if (bubble) {
              const selection = window.getSelection();
              selection?.removeAllRanges();
              selection?.selectAllChildren(bubble as Node);
            } else {
              document.execCommand("selectAll");
            }
          },
        },
        { type: "separator" },
        {
          label: "Copy entire chat (text)",
          action: () =>
            window.dispatchEvent(
              new CustomEvent("hermes-copy-chat", { detail: "text" }),
            ),
        },
        {
          label: "Copy entire chat (Markdown)",
          action: () =>
            window.dispatchEvent(
              new CustomEvent("hermes-copy-chat", { detail: "markdown" }),
            ),
        },
      ]);
    }
  });
}

type MenuItem = { label: string; action: () => void } | { type: "separator" };

function showContextMenu(x: number, y: number, items: MenuItem[]): void {
  const existing = document.getElementById("tauri-ctx-menu");
  if (existing) existing.remove();

  const menu = document.createElement("div");
  menu.id = "tauri-ctx-menu";
  menu.style.cssText =
    "position:fixed;z-index:99999;background:var(--color-bg-secondary,#2a2a2a);border:1px solid var(--color-border,#444);border-radius:6px;padding:4px 0;min-width:180px;box-shadow:0 4px 12px rgba(0,0,0,0.3);font-size:13px;color:var(--color-text,#e0e0e0);font-family:-apple-system,BlinkMacSystemFont,sans-serif;";

  const close = () => menu.remove();
  document.addEventListener("click", close, { once: true });
  document.addEventListener("contextmenu", close, { once: true });

  for (const item of items) {
    if ("type" in item && item.type === "separator") {
      const sep = document.createElement("div");
      sep.style.cssText =
        "height:1px;background:var(--color-border,#444);margin:4px 0;";
      menu.appendChild(sep);
    } else {
      const row = document.createElement("div");
      const menuItem = item as { label: string; action: () => void };
      row.textContent = menuItem.label;
      row.style.cssText = "padding:4px 12px;cursor:pointer;white-space:nowrap;";
      row.addEventListener("mouseenter", () => {
        row.style.background = "var(--color-hover,#3a3a3a)";
      });
      row.addEventListener("mouseleave", () => {
        row.style.background = "transparent";
      });
      row.addEventListener("click", () => {
        close();
        menuItem.action();
      });
      menu.appendChild(row);
    }
  }

  document.body.appendChild(menu);
  const maxX = window.innerWidth - menu.offsetWidth - 4;
  const maxY = window.innerHeight - menu.offsetHeight - 4;
  menu.style.left = `${Math.min(x, maxX)}px`;
  menu.style.top = `${Math.min(y, maxY)}px`;
}

async function probeGPU(): Promise<boolean> {
  if (!("gpu" in navigator)) return false;
  try {
    const adapter = await (navigator as any).gpu.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}

async function boot(): Promise<void> {
  await initStore();

  // Set initial markdown style from persisted preference
  const savedMdStyle = getStoreItem(MARKDOWN_STYLE_STORAGE_KEY);
  const validStyles = new Set(MARKDOWN_STYLE_OPTIONS.map((o) => o.value));
  document.documentElement.setAttribute(
    "data-md-style",
    validStyles.has(savedMdStyle as MarkdownStyle) ? savedMdStyle : "default",
  );

  if ((window as any).__TAURI_INTERNALS__) {
    (window as any).hermesAPI = hermesAPI;
    setupTauriContextMenu();
  }

  const gpuAvailable = await probeGPU();
  if (gpuAvailable) {
    document.documentElement.dataset.gpu = "available";
  }

  initAnalytics();

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <I18nProvider>
        <App />
      </I18nProvider>
    </StrictMode>,
  );
}

boot();
