import { describe, expect, it } from "vitest";
import { createSystemEvent, systemEventFromError } from "./systemEvents";

describe("systemEvents", () => {
  it("creates separate model switch events", () => {
    expect(
      createSystemEvent("model_switch", "Model switched", "gpt-4o-mini"),
    ).toMatchObject({
      kind: "system_event",
      role: "system",
      event: "model_switch",
      tone: "success",
      title: "Model switched",
      content: "gpt-4o-mini",
    });
  });

  it("creates separate context compression events", () => {
    expect(
      createSystemEvent("context_compress", "Session compressed", "12k -> 4k"),
    ).toMatchObject({
      event: "context_compress",
      tone: "success",
      title: "Session compressed",
    });
  });

  it("classifies 429 and model 1305 errors as provider errors with codes", () => {
    expect(systemEventFromError("HTTP 429: rate limit exceeded")).toMatchObject(
      {
        event: "provider_error",
        tone: "error",
        title: "Provider error 429",
        code: "429",
      },
    );
    expect(systemEventFromError("model 1305 overloaded")).toMatchObject({
      event: "provider_error",
      tone: "error",
      title: "Provider error 1305",
      code: "1305",
    });
  });
});
