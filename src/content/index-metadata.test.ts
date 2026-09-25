import { afterEach, describe, expect, it, vi } from "vitest";
import { formatAnswerTime } from "../shared/answer-metadata";

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("answer card metadata", () => {
  it("shows the answer time and paired prompt, then retains both when a known turn unmounts", async () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0));
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    vi.stubGlobal("chrome", { storage: {
      sync: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) },
      local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() }
    } });
    document.body.innerHTML = `<main>
      <div data-testid="conversation-turn-0"><div data-message-author-role="user">First user request</div>
        <article data-message-author-role="assistant" data-message-id="first"><h2>First heading</h2></article></div>
      <div data-testid="conversation-turn-1"><div data-message-author-role="user">Second user request</div>
        <article data-message-author-role="assistant" data-message-id="second"><h2>Second heading</h2></article></div>
    </main>`;
    const first = document.querySelector<HTMLElement>("[data-message-id='first']")! as HTMLElement & Record<string, unknown>;
    const createdAtMs = Date.now() - 60_000;
    first["__reactFiber$test"] = { memoizedProps: { children: [{ props: { message: {
      id: "first", create_time: createdAtMs / 1000
    } } }] } };
    vi.spyOn(first, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ y: -1000, width: 600, height: 1000 }));
    vi.spyOn(document.querySelector<HTMLElement>("[data-message-id='second']")!, "getBoundingClientRect")
      .mockReturnValue(DOMRect.fromRect({ y: 0, width: 600, height: 1000 }));
    await import("./index");
    await vi.waitFor(() => expect(document.querySelector("#gpt-reader-root")).not.toBeNull());
    await import("./page-message-time");

    const root = await vi.waitFor(() => {
      const element = document.querySelector<HTMLElement>("#gpt-reader-root")!;
      expect(element.querySelector("[data-gpt-reader-group-id='gpt-reader-answer-first'] .gpt-reader-answer-time")
        ?.textContent).toBe(formatAnswerTime(createdAtMs));
      return element;
    });
    const firstHeader = root.querySelector<HTMLElement>(
      "[data-gpt-reader-group-id='gpt-reader-answer-first'] .gpt-reader-answer-title")!;
    expect(firstHeader.textContent).toContain("First user request");
    expect(firstHeader.textContent).not.toContain("First heading");
    const secondHeader = root.querySelector<HTMLElement>(
      "[data-gpt-reader-group-id='gpt-reader-answer-second'] .gpt-reader-answer-title")!;
    expect(secondHeader.textContent).toContain("Second user request");
    expect(secondHeader.querySelector("time")?.hidden).toBe(true);
    expect(secondHeader.querySelector(".gpt-reader-answer-time-fallback")?.textContent).toBe("回答");
    expect(secondHeader.querySelector("time")?.hasAttribute("datetime")).toBe(false);
    expect(secondHeader.closest(".gpt-reader-answer")?.classList.contains("is-current")).toBe(true);

    first.closest("[data-testid]")!.remove();
    window.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    expect(firstHeader.textContent).toContain("First user request");
    expect(firstHeader.textContent).toContain(formatAnswerTime(createdAtMs));
  });
});
