export type BusyInputMode = "queue" | "steer" | "interrupt";

export type BusyInputAction =
  | { kind: "queue"; text: string; displayText: string }
  | { kind: "steer"; text: string; displayText: string }
  | { kind: "interrupt"; text: string; displayText: string };

export function describeBusyInput(
  rawText: string,
  mode: BusyInputMode = "steer",
): BusyInputAction {
  const trimmed = rawText.trim();
  const queueMatch = trimmed.match(/^\/(?:queue|q)(?:\s+([\s\S]*))?$/i);
  if (queueMatch) {
    const text = (queueMatch[1] ?? "").trim();
    return { kind: "queue", text, displayText: text };
  }

  return { kind: mode, text: trimmed, displayText: trimmed };
}
