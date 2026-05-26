/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_POSTHOG_KEY?: string;
  readonly VITE_POSTHOG_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  hermesAPI: Record<string, (...args: any[]) => any>;
  __TAURI_INTERNALS__?: unknown;
}
