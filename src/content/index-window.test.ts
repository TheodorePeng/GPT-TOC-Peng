import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../shared/settings";

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("visible answer cards", () => {
  it("switches D → C → B, pages hidden answers without moving the page, and preserves neighbors", async () => {
    vi.stubGlobal("innerHeight", 1000);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0));
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    const set = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("chrome", { storage: {
      sync: { get: vi.fn().mockResolvedValue({}), set },
      local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() }
    } });
    document.body.innerHTML = `<main>${["A", "B", "C", "D", "E", "F"].map((letter, index) =>
      `<div data-testid="conversation-turn-${index}"><article data-message-author-role="assistant" data-message-id="${letter}"><h2>${letter} title</h2></article></div>`
    ).join("")}</main>`;
    let activeIndex = 3;
    document.querySelectorAll<HTMLElement>("article").forEach((article, index) => {
      vi.spyOn(article, "getBoundingClientRect").mockImplementation(() =>
        DOMRect.fromRect({ y: (index - activeIndex) * 1000, width: 600, height: 1000 }));
    });
    const pageScroll = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    await import("./index");
    const root = await vi.waitFor(() => {
      const element = document.querySelector<HTMLElement>("#gpt-reader-root")!;
      expect(element.querySelector(".gpt-reader-answer.is-current")?.textContent).toContain("D title");
      return element;
    });
    const labels = () => [...root.querySelectorAll<HTMLElement>(".gpt-reader-answer")]
      .map((group) => group.dataset.gptReaderGroupId?.replace("gpt-reader-answer-", ""));
    expect(labels()).toEqual(["B", "C", "D", "E"]);
    expect(root.querySelector('[data-gpt-reader-reveal="before"]')?.textContent).toBe("更早 1 轮");
    const beforeScrollY = window.scrollY;
    root.querySelector<HTMLButtonElement>('[data-gpt-reader-reveal="before"]')!.click();
    expect(labels()).toEqual(["A", "B", "C", "D", "E"]);
    expect(window.scrollY).toBe(beforeScrollY);
    expect(pageScroll).not.toHaveBeenCalled();
    root.querySelector<HTMLButtonElement>("[data-gpt-reader-reveal-collapse]")!.click();
    expect(labels()).toEqual(["B", "C", "D", "E"]);

    activeIndex = 2;
    window.dispatchEvent(new Event("scroll"));
    await vi.waitFor(() => expect(labels()).toEqual(["A", "B", "C", "D"]));
    activeIndex = 1;
    window.dispatchEvent(new Event("scroll"));
    await vi.waitFor(() => expect(labels()).toEqual(["A", "B", "C"]));

    const before = root.querySelector<HTMLInputElement>("[data-gpt-reader-before-count]")!;
    before.value = "0";
    before.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(set.mock.lastCall?.[0].gptReaderSettings).toMatchObject({
      visibleAnswersBeforeCurrent: 0, visibleAnswersAfterCurrent: 1
    }));
    expect(labels()).toEqual(["B", "C"]);
  });

  it("keeps a heading-free current answer between known neighbors", async () => {
    vi.stubGlobal("innerHeight", 1000);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0));
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    vi.stubGlobal("chrome", { storage: {
      sync: { get: vi.fn().mockResolvedValue({ gptReaderSettings: DEFAULT_SETTINGS }), set: vi.fn() },
      local: { get: vi.fn().mockResolvedValue({}), set: vi.fn() },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() }
    } });
    document.body.innerHTML = `<main>
      <div data-testid="conversation-turn-0"><article data-message-author-role="assistant" data-message-id="A"><h2>A title</h2></article></div>
      <div data-testid="conversation-turn-1"><article data-message-author-role="assistant" data-message-id="B"><p>No heading</p></article></div>
      <div data-testid="conversation-turn-2"><article data-message-author-role="assistant" data-message-id="C"><h2>C title</h2></article></div>
    </main>`;
    document.querySelectorAll<HTMLElement>("article").forEach((article, index) => {
      vi.spyOn(article, "getBoundingClientRect").mockReturnValue(
        DOMRect.fromRect({ y: (index - 1) * 1000, width: 600, height: 1000 }));
    });
    await import("./index");
    const root = await vi.waitFor(() => {
      const element = document.querySelector<HTMLElement>("#gpt-reader-root")!;
      expect(element.querySelector(".gpt-reader-answer.is-current")?.textContent)
        .toContain("当前回答暂无 Markdown 标题");
      return element;
    });
    expect([...root.querySelectorAll<HTMLElement>(".gpt-reader-answer")].map((item) =>
      item.textContent?.includes("当前回答暂无") ? "empty" :
        item.dataset.gptReaderGroupId?.replace("gpt-reader-answer-", "")
    )).toEqual(["A", "empty", "C"]);
  });
});
