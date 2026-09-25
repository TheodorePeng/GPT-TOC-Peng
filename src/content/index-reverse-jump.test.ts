import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
  window.localStorage.clear();
});

describe("ChatGPT reverse scroller navigation", () => {
  it("lands in one move, keeps the selected heading, and highlights it", async () => {
    vi.stubGlobal("innerHeight", 900);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0));
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    vi.stubGlobal("chrome", { storage: {
      sync: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) },
      local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() }
    } });
    document.body.innerHTML = `
      <div class="thread-scroll-container" style="display:flex;flex-direction:column-reverse;overflow-y:auto">
        <div data-content-search-turn-key="fallback-turn-0">
          <div data-content-search-unit-key="fallback-turn-0:0:user">Question</div>
          <div data-content-search-unit-key="fallback-turn-0:2:assistant">
            <div data-chatgpt-selection-message-id="answer-a"><h2>Target heading</h2></div>
          </div>
        </div>
      </div>`;
    const scroller = document.querySelector<HTMLElement>(".thread-scroll-container")!;
    const answer = document.querySelector<HTMLElement>("[data-content-search-unit-key$=':assistant']")!;
    const heading = answer.querySelector<HTMLElement>("h2")!;
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 900 },
      scrollHeight: { configurable: true, value: 5000 }
    });
    scroller.scrollTop = -3000;
    vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ y: 0, width: 800, height: 900 }));
    vi.spyOn(answer, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ y: 0, width: 700, height: 5000 }));
    vi.spyOn(heading, "getBoundingClientRect").mockImplementation(() =>
      DOMRect.fromRect({ x: 50, y: 2500 - (scroller.scrollTop + 3000), width: 600, height: 40 }));
    const scrollIntoView = vi.fn();
    heading.scrollIntoView = scrollIntoView;
    const scrollBy = vi.fn(({ top }: ScrollToOptions) => {
      scroller.scrollTop = Math.max(-4100, Math.min(0, scroller.scrollTop + (top ?? 0)));
      scroller.dispatchEvent(new Event("scroll"));
    });
    Object.defineProperty(scroller, "scrollBy", { configurable: true, value: scrollBy });

    await import("./index");
    const root = await vi.waitFor(() => {
      const element = document.querySelector<HTMLElement>("#gpt-reader-root")!;
      expect(element.querySelectorAll("[data-gpt-reader-heading]")).toHaveLength(1);
      return element;
    });
    const list = root.querySelector<HTMLElement>("[data-gpt-reader-list]")!;
    const button = root.querySelector<HTMLButtonElement>("[data-gpt-reader-heading]")!;
    Object.defineProperties(list, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 1000 }
    });
    vi.spyOn(list, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ y: 100, width: 240, height: 100 }));
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ y: 500, width: 200, height: 30 }));
    button.click();
    await vi.waitFor(() => expect(root.querySelector<HTMLElement>(".gpt-reader-target-overlay")?.hidden)
      .toBe(false));
    expect(root.querySelector<HTMLElement>("[data-gpt-reader-jump-status]")?.hidden).toBe(true);
    expect(root.querySelector(".gpt-reader-heading.is-active")?.textContent).toContain("Target heading");
    expect(heading.getBoundingClientRect().top).toBeCloseTo(287, 0);
    expect(scroller.scrollTop).toBeLessThan(0);
    expect(list.scrollTop).toBeGreaterThan(0);
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
