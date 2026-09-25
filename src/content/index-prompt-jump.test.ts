import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../shared/settings";

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
  window.localStorage.clear();
});

const prepare = async () => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 0));
  vi.stubGlobal("CSS", { escape: (value: string) => value });
  const listeners = new Set<(changes: Record<string, chrome.storage.StorageChange>, area: string) => void>();
  vi.stubGlobal("chrome", { storage: {
    sync: { get: vi.fn().mockResolvedValue({}), set: vi.fn(async (items: { gptReaderSettings: typeof DEFAULT_SETTINGS }) => {
      listeners.forEach((listener) => listener({
        gptReaderSettings: { newValue: items.gptReaderSettings }
      }, "sync"));
    }) },
    local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) },
    onChanged: {
      addListener: (listener: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void) =>
        listeners.add(listener),
      removeListener: (listener: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void) =>
        listeners.delete(listener)
    }
  } });
  document.body.innerHTML = `<main>
    <div data-testid="conversation-turn-0"><div data-message-author-role="user" data-message-id="prompt-0">First question</div>
      <article data-message-author-role="assistant" data-message-id="answer-0"><h2>First title</h2></article></div>
    <div data-testid="conversation-turn-1"><div data-message-author-role="user" data-message-id="prompt-1">Second question</div>
      <article data-message-author-role="assistant" data-message-id="answer-1"><h2>Second title</h2></article></div>
  </main>`;
  document.querySelectorAll<HTMLElement>("article").forEach((answer, index) => {
    vi.spyOn(answer, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ y: index === 0 ? -1000 : 0, width: 600, height: 1000 }));
  });
  await import("./index");
  const root = await vi.waitFor(() => {
    const node = document.querySelector<HTMLElement>("#gpt-reader-root")!;
    expect(node.querySelectorAll(".gpt-reader-answer")).toHaveLength(2);
    return node;
  });
  const oldCard = root.querySelector<HTMLElement>("[data-gpt-reader-group-id='gpt-reader-answer-answer-0']")!;
  return { root, oldCard };
};

describe("answer prompt navigation", () => {
  it("keeps expand and prompt actions independent and jumps to a mounted prompt", async () => {
    const { root, oldCard } = await prepare();
    const toggle = oldCard.querySelector<HTMLButtonElement>("[data-gpt-reader-answer-toggle]")!;
    const prompt = oldCard.querySelector<HTMLButtonElement>("[data-gpt-reader-prompt-jump]")!;
    const target = document.querySelector<HTMLElement>("[data-message-id='prompt-0']")!;
    target.scrollIntoView = vi.fn();
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 50, y: 100, width: 400, height: 50 })
    );
    expect(prompt.hasAttribute("title")).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    toggle.click();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    prompt.click();
    await vi.waitFor(() => expect(target.scrollIntoView).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(root.querySelector(".gpt-reader-target-overlay")).not.toBeNull());
    expect(root.querySelector(".gpt-reader-answer.is-current")?.getAttribute("data-gpt-reader-group-id"))
      .toBe("gpt-reader-answer-answer-0");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("temporarily reveals a prompt hidden by the history limit", async () => {
    const { root, oldCard } = await prepare();
    const target = document.querySelector<HTMLElement>("[data-message-id='prompt-0']")!;
    target.scrollIntoView = vi.fn();
    await chrome.storage.sync.set({
      gptReaderSettings: { ...DEFAULT_SETTINGS, maxVisibleRounds: 1 }
    });
    await vi.waitFor(() => expect(target.closest("[data-gpt-reader-hidden-round='true']")).not.toBeNull());
    oldCard.querySelector<HTMLButtonElement>("[data-gpt-reader-prompt-jump]")!.click();
    await vi.waitFor(() => expect(target.scrollIntoView).toHaveBeenCalledOnce());
    expect(target.closest("[data-gpt-reader-hidden-round='true']")).toBeNull();
  });

  it("respects the shared highlight switch and does not highlight on expand", async () => {
    const { root, oldCard } = await prepare();
    oldCard.querySelector<HTMLButtonElement>("[data-gpt-reader-answer-toggle]")!.click();
    expect(root.querySelector(".gpt-reader-target-overlay")).toBeNull();
    await chrome.storage.sync.set({
      gptReaderSettings: { ...DEFAULT_SETTINGS, targetHighlightEnabled: false }
    });
    const target = document.querySelector<HTMLElement>("[data-message-id='prompt-0']")!;
    target.scrollIntoView = vi.fn();
    oldCard.querySelector<HTMLButtonElement>("[data-gpt-reader-prompt-jump]")!.click();
    await vi.waitFor(() => expect(target.scrollIntoView).toHaveBeenCalled());
    await vi.waitFor(() => expect(root.querySelector<HTMLElement>("[data-gpt-reader-jump-status]")?.hidden)
      .toBe(true));
    expect(root.querySelector(".gpt-reader-target-overlay")).toBeNull();
  });

  it("finds a prompt after its known turn remounts", async () => {
    const { oldCard } = await prepare();
    const shell = document.querySelector<HTMLElement>("[data-testid='conversation-turn-0']")!;
    const target = shell.querySelector<HTMLElement>("[data-message-id='prompt-0']")!;
    target.scrollIntoView = vi.fn();
    shell.remove();
    window.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    document.querySelector<HTMLElement>("[data-message-id='answer-1']")!.scrollIntoView =
      vi.fn(() => document.querySelector("main")?.prepend(shell));
    vi.spyOn(window, "scrollBy").mockImplementation(() => undefined);
    oldCard.querySelector<HTMLButtonElement>("[data-gpt-reader-prompt-jump]")!.click();
    await vi.waitFor(() => expect(target.scrollIntoView).toHaveBeenCalled(), { timeout: 3000 });
  });

  it("stops a failed seek without unbounded page scrolling", async () => {
    const { root, oldCard } = await prepare();
    document.querySelector("[data-testid='conversation-turn-0']")!.remove();
    window.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    document.querySelector<HTMLElement>("[data-message-id='answer-1']")!.scrollIntoView = vi.fn();
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => undefined);
    oldCard.querySelector<HTMLButtonElement>("[data-gpt-reader-prompt-jump]")!.click();
    await vi.waitFor(() => expect(root.querySelector<HTMLElement>("[data-gpt-reader-jump-status]")
      ?.textContent).toContain("尚未载入"), { timeout: 3000 });
    expect(scrollBy.mock.calls.length).toBeLessThanOrEqual(3);
    expect(root.querySelector(".gpt-reader-target-overlay")).toBeNull();
  });

  it("cancels a seek when the user scrolls the page", async () => {
    const { root, oldCard } = await prepare();
    document.querySelector("[data-testid='conversation-turn-0']")!.remove();
    window.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    document.querySelector<HTMLElement>("[data-message-id='answer-1']")!.scrollIntoView = vi.fn();
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => undefined);
    oldCard.querySelector<HTMLButtonElement>("[data-gpt-reader-prompt-jump]")!.click();
    document.querySelector("main")!.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    const count = scrollBy.mock.calls.length;
    await new Promise((resolve) => window.setTimeout(resolve, 260));
    expect(scrollBy).toHaveBeenCalledTimes(count);
    expect(root.querySelector<HTMLElement>("[data-gpt-reader-jump-status]")?.hidden).toBe(true);
    expect(root.querySelector(".gpt-reader-target-overlay")).toBeNull();
  });

  it("does not make an unpaired prompt look clickable", async () => {
    const { root } = await prepare();
    const prompt = document.querySelector<HTMLElement>("[data-message-id='prompt-1']")!;
    prompt.remove();
    document.querySelector("[data-message-id='prompt-0']")!.remove();
    document.querySelector<HTMLElement>("[data-message-id='answer-1']")!.remove();
    document.querySelector("main")!.insertAdjacentHTML("beforeend",
      `<div data-testid="conversation-turn-2"><article data-message-author-role="assistant" data-message-id="orphan"><h2>Orphan title</h2></article></div>`);
    for (const selector of ["[data-gpt-reader-before-count]", "[data-gpt-reader-after-count]"]) {
      const input = root.querySelector<HTMLInputElement>(selector)!;
      input.value = "20";
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    await vi.waitFor(() => expect(root.querySelector(
      "[data-gpt-reader-group-id='gpt-reader-answer-orphan']")
    ).not.toBeNull());
    const orphanPrompt = root.querySelector<HTMLButtonElement>(
      "[data-gpt-reader-group-id='gpt-reader-answer-orphan'] [data-gpt-reader-prompt-jump]")!;
    expect(orphanPrompt.disabled).toBe(true);
  });
});
