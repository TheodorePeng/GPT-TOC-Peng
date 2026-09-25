import { describe, expect, it } from "vitest";
import { formatAnswerTime, getAnswerHeaderText, normalizeMessageTime, normalizePrompt } from "./answer-metadata";

describe("answer metadata", () => {
  it("formats local creation times across today, yesterday, and older dates", () => {
    const now = new Date(2026, 8, 25, 12, 0).getTime();
    expect(formatAnswerTime(new Date(2026, 8, 25, 9, 5).getTime(), now)).toBe("今天 09:05");
    expect(formatAnswerTime(new Date(2026, 8, 24, 23, 59).getTime(), now)).toBe("昨天 23:59");
    expect(formatAnswerTime(new Date(2026, 7, 1, 8, 2).getTime(), now)).toBe("2026-08-01 08:02");
  });

  it("rejects implausible times and uses the prompt before a generic fallback", () => {
    expect(normalizeMessageTime(Infinity)).toBeNull();
    expect(normalizeMessageTime(1)).toBeNull();
    expect(normalizeMessageTime(Date.now() / 1000 + 172800)).toBeNull();
    expect(normalizePrompt("  First\n  question  ")).toBe("First question");
    expect(getAnswerHeaderText({ createdAtMs: null, prompt: "First question" })).toBe("First question");
    expect(getAnswerHeaderText({ createdAtMs: null, prompt: "" })).toBe("回答");
  });
});
