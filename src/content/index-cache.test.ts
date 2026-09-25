import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
  window.localStorage.clear();
});

describe("virtualized answer cache", () => {
  it("keeps a known answer label and can jump after the answer remounts", async () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0)
    );
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    vi.stubGlobal("chrome", {
      storage: {
        sync: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) },
        local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() }
      }
    });
    document.body.innerHTML = `
      <main>
        <div data-testid="conversation-turn-0"><div data-message-author-role="user">First request</div><article data-message-author-role="assistant" data-message-id="first"><h2>Stable chapter</h2></article></div>
        <div data-testid="conversation-turn-1"><div data-message-author-role="user">Second request</div><article data-message-author-role="assistant" data-message-id="second"><h2>Current chapter</h2></article></div>
      </main>
    `;
    const first = document.querySelector<HTMLElement>("[data-message-id='first']")!;
    const second = document.querySelector<HTMLElement>("[data-message-id='second']")!;
    vi.spyOn(first, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ y: -1200, width: 600, height: 500 })
    );
    vi.spyOn(second, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ y: 0, width: 600, height: 1200 })
    );

    await import("./index");
    const root = await vi.waitFor(() => {
      const element = document.querySelector<HTMLElement>("#gpt-reader-root");
      expect(element?.querySelectorAll(".gpt-reader-answer")).toHaveLength(2);
      return element!;
    });

    first.remove();
    window.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    expect(root.querySelectorAll(".gpt-reader-answer")).toHaveLength(2);
    const cachedGroup = root.querySelector<HTMLElement>(
      '[data-gpt-reader-group-id="gpt-reader-answer-first"]'
    )!;
    expect(cachedGroup.querySelector(".gpt-reader-answer-title")?.textContent).toContain("First request");

    const shell = document.querySelector<HTMLElement>("[data-testid='conversation-turn-0']")!;
    const remounted = document.createElement("article");
    remounted.dataset.messageAuthorRole = "assistant";
    remounted.dataset.messageId = "first";
    remounted.innerHTML = "<h2>Stable chapter</h2>";
    const newHeading = remounted.querySelector<HTMLElement>("h2")!;
    newHeading.scrollIntoView = vi.fn();
    shell.scrollIntoView = vi.fn(() => shell.append(remounted));

    cachedGroup.querySelector<HTMLButtonElement>("[data-gpt-reader-answer-toggle]")!.click();
    const cachedButton = cachedGroup.querySelector<HTMLButtonElement>("[data-gpt-reader-heading]")!;
    expect(cachedButton.textContent).toContain("Stable chapter");
    cachedButton.click();

    await vi.waitFor(() => {
      expect(shell.scrollIntoView).toHaveBeenCalledOnce();
      expect(newHeading.scrollIntoView).toHaveBeenCalledOnce();
      expect(root.querySelector(".gpt-reader-heading.is-active")?.textContent).toContain("Stable chapter");
    });
    await vi.waitFor(() =>
      expect(root.querySelector(".gpt-reader-target-overlay")).not.toBeNull()
    );
    expect(newHeading.hasAttribute("style")).toBe(false);

    shell.remove();
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    expect(root.querySelectorAll(".gpt-reader-answer")).toHaveLength(2);
    expect(root.querySelector(".gpt-reader-answer-title")?.textContent).toContain("First request");

    shell.innerHTML = '<article data-message-author-role="assistant" data-message-id="first"><p>No headings</p></article>';
    document.querySelector("main")?.prepend(shell);
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    expect(root.querySelector('[data-gpt-reader-group-id="gpt-reader-answer-first"]')).toBeNull();
  });
});
