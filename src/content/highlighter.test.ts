import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeadingHighlighter } from "./highlighter";

const makeTarget = (tag: "h2" | "h3", top = 100): HTMLElement => {
  const target = document.createElement(tag);
  document.body.append(target);
  vi.spyOn(target, "getBoundingClientRect").mockReturnValue(
    DOMRect.fromRect({ x: 40, y: top, width: 200, height: 30 })
  );
  return target;
};

describe("HeadingHighlighter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it("highlights without changing the host heading for the configured duration", () => {
    const target = makeTarget("h2");
    const originalMarkup = target.outerHTML;
    const highlighter = new HeadingHighlighter();

    highlighter.show(target, { enabled: true, durationMs: 1500 });

    const overlay = document.querySelector<HTMLElement>(".gpt-reader-target-overlay");
    expect(overlay?.style.top).toBe("100px");
    expect(overlay?.style.getPropertyValue("--gpt-reader-highlight-duration")).toBe("1500ms");
    expect(target.outerHTML).toBe(originalMarkup);
    vi.advanceTimersByTime(1499);
    expect(overlay?.isConnected).toBe(true);
    vi.advanceTimersByTime(1);
    expect(overlay?.isConnected).toBe(false);
  });

  it("replaces the previous target and cancels its timer", () => {
    const first = makeTarget("h2");
    const second = makeTarget("h3", 240);
    const highlighter = new HeadingHighlighter();

    highlighter.show(first, { enabled: true, durationMs: 3000 });
    highlighter.show(second, { enabled: true, durationMs: 800 });

    expect(document.querySelectorAll(".gpt-reader-target-overlay")).toHaveLength(1);
    expect(document.querySelector<HTMLElement>(".gpt-reader-target-overlay")?.style.top).toBe("240px");
    vi.advanceTimersByTime(800);
    expect(document.querySelector(".gpt-reader-target-overlay")).toBeNull();
  });

  it("clears any previous target when highlighting is disabled", () => {
    const first = makeTarget("h2");
    const second = makeTarget("h3");
    const highlighter = new HeadingHighlighter();

    highlighter.show(first, { enabled: true, durationMs: 1500 });
    highlighter.show(second, { enabled: false, durationMs: 1500 });

    expect(document.querySelector(".gpt-reader-target-overlay")).toBeNull();
  });

  it("follows a replaced Writing Block heading without editing its DOM", async () => {
    const shell = document.createElement("div");
    const first = document.createElement("h2");
    shell.append(first);
    document.body.append(shell);
    vi.spyOn(first, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 40, y: 100, width: 200, height: 30 })
    );
    const highlighter = new HeadingHighlighter();

    highlighter.show(first, {
      enabled: true,
      durationMs: 1500,
      resolveElement: () => shell.querySelector("h2"),
      observeRoot: shell
    });
    expect(document.querySelector<HTMLElement>(".gpt-reader-target-overlay")?.style.top).toBe("100px");

    vi.advanceTimersByTime(300);
    const replacement = document.createElement("h2");
    first.replaceWith(replacement);
    vi.spyOn(replacement, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 40, y: 420, width: 200, height: 30 })
    );
    await vi.advanceTimersByTimeAsync(20);
    expect(document.querySelector<HTMLElement>(".gpt-reader-target-overlay")?.style.top).toBe("420px");
    expect(first.hasAttribute("style")).toBe(false);
    expect(replacement.hasAttribute("style")).toBe(false);

    vi.advanceTimersByTime(1180);
    expect(document.querySelector(".gpt-reader-target-overlay")).toBeNull();
    shell.remove();
  });
});
