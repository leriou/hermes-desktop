import {
  describeBusyInput,
  type BusyInputAction,
  type BusyInputMode,
} from "./busyInput";

export type InputIntent =
  | { kind: "clarify"; text: string }
  | {
      kind: "gateway_command";
      text: string;
      command: string;
      canRunWhileBusy: boolean;
    }
  | { kind: "busy"; action: BusyInputAction }
  | { kind: "prompt"; text: string };

export interface InputIntentArgs {
  text: string;
  isLoading: boolean;
  hasClarify: boolean;
  busyMode?: BusyInputMode;
}

export function describeInputIntent({
  text,
  isLoading,
  hasClarify,
  busyMode = "steer",
}: InputIntentArgs): InputIntent {
  const trimmed = text.trim();

  if (hasClarify) {
    return { kind: "clarify", text };
  }

  if (trimmed.startsWith("/")) {
    const command = trimmed.split(/\s+/)[0].toLowerCase();
    if (!isLoading || command === "/steer") {
      return {
        kind: "gateway_command",
        text: trimmed,
        command,
        canRunWhileBusy: command === "/steer",
      };
    }
  }

  if (isLoading) {
    return { kind: "busy", action: describeBusyInput(text, busyMode) };
  }

  return { kind: "prompt", text };
}
