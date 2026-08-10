import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeadingHighlighter } from "./highlighter";

describe("HeadingHighlighter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("highlights a target for the configured duration", () => {
    const target = document.createElement("h2");
    const highlighter = new HeadingHighlighter();

    highlighter.show(target, { enabled: true, durationMs: 1500 });

    expect(target.classList.contains("gpt-reader-target-highlight")).toBe(true);
    expect(target.style.getPropertyValue("--gpt-reader-highlight-duration")).toBe("1500ms");
    vi.advanceTimersByTime(1499);
    expect(target.classList.contains("gpt-reader-target-highlight")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(target.classList.contains("gpt-reader-target-highlight")).toBe(false);
  });

  it("replaces the previous target and cancels its timer", () => {
    const first = document.createElement("h2");
    const second = document.createElement("h3");
    const highlighter = new HeadingHighlighter();

    highlighter.show(first, { enabled: true, durationMs: 3000 });
    highlighter.show(second, { enabled: true, durationMs: 800 });

    expect(first.classList.contains("gpt-reader-target-highlight")).toBe(false);
    expect(second.classList.contains("gpt-reader-target-highlight")).toBe(true);
    vi.advanceTimersByTime(800);
    expect(second.classList.contains("gpt-reader-target-highlight")).toBe(false);
  });

  it("clears any previous target when highlighting is disabled", () => {
    const first = document.createElement("h2");
    const second = document.createElement("h3");
    const highlighter = new HeadingHighlighter();

    highlighter.show(first, { enabled: true, durationMs: 1500 });
    highlighter.show(second, { enabled: false, durationMs: 1500 });

    expect(first.classList.contains("gpt-reader-target-highlight")).toBe(false);
    expect(second.classList.contains("gpt-reader-target-highlight")).toBe(false);
  });
});
