import { describe, expect, it } from "vitest";
import { isNearScrollBottom } from "./scrollState";

describe("chat scroll state", () => {
  it("treats the transcript as pinned near the bottom threshold", () => {
    expect(isNearScrollBottom({ scrollHeight: 1000, scrollTop: 620, clientHeight: 320 })).toBe(true);
  });

  it("detects when the user has intentionally scrolled away from the bottom", () => {
    expect(isNearScrollBottom({ scrollHeight: 1000, scrollTop: 500, clientHeight: 320 })).toBe(false);
  });
});
