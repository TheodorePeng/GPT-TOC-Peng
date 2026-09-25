import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../shared/settings";

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
  window.localStorage.clear();
});

const prepare = async (count: number) => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 0));
  vi.stubGlobal("CSS", { escape: (value: string) => value });
  const listeners = new Set<(changes: Record<string, chrome.storage.StorageChange>, area: string) => void>();
  const set = vi.fn(async (items: { gptReaderSettings: typeof DEFAULT_SETTINGS }) => {
    listeners.forEach((listener) => listener({
      gptReaderSettings: { newValue: items.gptReaderSettings }
    }, "sync"));
  });
  vi.stubGlobal("chrome", { storage: {
    sync: { get: vi.fn().mockResolvedValue({}), set },
    local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) },
    onChanged: {
      addListener: (listener: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void) =>
        listeners.add(listener),
      removeListener: (listener: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void) =>
        listeners.delete(listener)
    }
  } });
  document.body.innerHTML = `<main>${Array.from({ length: count }, (_, index) => `
    <div data-testid="conversation-turn-${index}">
      <div data-message-author-role="user">Question ${index}</div>
      <article data-message-author-role="assistant" data-message-id="answer-${index}"><h2>Chapter ${index}</h2></article>
    </div>`).join("")}</main>`;
  document.querySelectorAll<HTMLElement>("article").forEach((article, index) => {
    vi.spyOn(article, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ y: (index - count + 1) * 1000, width: 600, height: 1000 }));
  });
  await import("./index");
  const root = await vi.waitFor(() => {
    const element = document.querySelector<HTMLElement>("#gpt-reader-root")!;
    expect(element.querySelectorAll(".gpt-reader-answer")).toHaveLength(count);
    return element;
  });
  return { root, set };
};

const openHistoricalHeading = (root: HTMLElement, id: string): HTMLButtonElement => {
  const group = root.querySelector<HTMLElement>(`[data-gpt-reader-group-id="gpt-reader-answer-${id}"]`)!;
  group.querySelector<HTMLButtonElement>("[data-gpt-reader-answer-toggle]")!.click();
  const button = group.querySelector<HTMLButtonElement>("[data-gpt-reader-heading]")!;
  expect(button.disabled).toBe(false);
  return button;
};

describe("historical heading navigation", () => {
  it("reveals a round hidden by the history setting without changing the saved limit", async () => {
    const { root, set } = await prepare(3);
    const oldHeading = document.querySelector<HTMLElement>("[data-message-id='answer-0'] h2")!;
    oldHeading.scrollIntoView = vi.fn();
    await chrome.storage.sync.set({
      gptReaderSettings: { ...DEFAULT_SETTINGS, maxVisibleRounds: 1 }
    });
    await vi.waitFor(() => expect(document.querySelector("[data-testid='conversation-turn-0']")
      ?.getAttribute("data-gpt-reader-hidden-round")).toBe("true"));

    openHistoricalHeading(root, "answer-0").click();
    await vi.waitFor(() => expect(oldHeading.scrollIntoView).toHaveBeenCalled());
    expect(document.querySelector("[data-testid='conversation-turn-0']")
      ?.hasAttribute("data-gpt-reader-hidden-round")).toBe(false);
    expect(document.querySelector("[data-testid='conversation-turn-1']")
      ?.getAttribute("data-gpt-reader-hidden-round")).toBe("true");
    window.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => window.setTimeout(resolve, 220));
    expect(document.querySelector("[data-testid='conversation-turn-0']")
      ?.hasAttribute("data-gpt-reader-hidden-round")).toBe(false);
    expect(set.mock.lastCall?.[0].gptReaderSettings.maxVisibleRounds).toBe(1);
  });

  it("finds a known heading after its entire turn is remounted", async () => {
    const { root } = await prepare(2);
    const shell = document.querySelector<HTMLElement>("[data-testid='conversation-turn-0']")!;
    const heading = shell.querySelector<HTMLElement>("h2")!;
    heading.scrollIntoView = vi.fn();
    shell.remove();
    window.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    const current = document.querySelector<HTMLElement>("[data-message-id='answer-1']")!;
    current.scrollIntoView = vi.fn(() => document.querySelector("main")?.prepend(shell));
    vi.spyOn(window, "scrollBy").mockImplementation(() => undefined);

    openHistoricalHeading(root, "answer-0").click();
    await vi.waitFor(() => expect(heading.scrollIntoView).toHaveBeenCalled(), { timeout: 2500 });
    expect(root.querySelector(".gpt-reader-heading.is-active")?.textContent).toContain("Chapter 0");
  });

  it("stops a bounded seek and restores the previous selection when remount never happens", async () => {
    const { root } = await prepare(2);
    document.querySelector("[data-testid='conversation-turn-0']")!.remove();
    window.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    const current = document.querySelector<HTMLElement>("[data-message-id='answer-1']")!;
    current.scrollIntoView = vi.fn();
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => undefined);

    openHistoricalHeading(root, "answer-0").click();
    await vi.waitFor(() => expect(root.querySelector<HTMLElement>("[data-gpt-reader-jump-status]")
      ?.textContent).toContain("目标尚未载入"), { timeout: 2500 });
    expect(scrollBy.mock.calls.length).toBeLessThanOrEqual(3);
    expect(root.querySelector(".gpt-reader-answer.is-current")?.getAttribute("data-gpt-reader-group-id"))
      .toBe("gpt-reader-answer-answer-1");
  });

  it("cancels a seek when the user scrolls the page and does not resume automatic seeking", async () => {
    const { root } = await prepare(2);
    document.querySelector("[data-testid='conversation-turn-0']")!.remove();
    window.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    document.querySelector<HTMLElement>("[data-message-id='answer-1']")!.scrollIntoView = vi.fn();
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => undefined);

    openHistoricalHeading(root, "answer-0").click();
    document.querySelector("main")!.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    const callsAfterCancel = scrollBy.mock.calls.length;
    await new Promise((resolve) => window.setTimeout(resolve, 260));
    expect(scrollBy).toHaveBeenCalledTimes(callsAfterCancel);
    expect(root.querySelector<HTMLElement>("[data-gpt-reader-jump-status]")?.hidden).toBe(true);
    expect(root.querySelector(".gpt-reader-answer.is-current")?.getAttribute("data-gpt-reader-group-id"))
      .toBe("gpt-reader-answer-answer-1");
  });
});
