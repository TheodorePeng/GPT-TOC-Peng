import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
  window.localStorage.clear();
});

describe("bounded page synchronization", () => {
  it("ignores unrelated mutations and only re-extracts a changed answer", async () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0));
    vi.stubGlobal("chrome", { storage: {
      sync: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) },
      local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() }
    } });
    document.body.innerHTML = `<main>
      <div data-testid="conversation-turn-0"><div data-message-author-role="user">First question</div>
        <article data-message-author-role="assistant" data-message-id="first"><h2>First title</h2></article></div>
      <div data-testid="conversation-turn-1"><div data-message-author-role="user">Second question</div>
        <article data-message-author-role="assistant" data-message-id="second"><h2>Second title</h2></article></div>
    </main>`;
    await import("./index");
    const root = await vi.waitFor(() => {
      const node = document.querySelector<HTMLElement>("#gpt-reader-root")!;
      expect(node.querySelectorAll(".gpt-reader-answer")).toHaveLength(2);
      return node;
    });
    await new Promise((resolve) => window.setTimeout(resolve, 220));
    const first = document.querySelector<HTMLElement>("[data-message-id='first']")!;
    const second = document.querySelector<HTMLElement>("[data-message-id='second']")!;
    const firstQueries = vi.spyOn(first, "querySelectorAll");
    const secondQueries = vi.spyOn(second, "querySelectorAll");

    document.body.append(document.createElement("div"));
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    expect(firstQueries).not.toHaveBeenCalled();
    expect(secondQueries).not.toHaveBeenCalled();

    second.append(document.createElement("h2"));
    second.lastElementChild!.textContent = "New title";
    await vi.waitFor(() => expect(secondQueries).toHaveBeenCalled());
    const secondCard = root.querySelector<HTMLElement>(
      "[data-gpt-reader-group-id='gpt-reader-answer-second']")!;
    const toggle = secondCard.querySelector<HTMLButtonElement>("[data-gpt-reader-answer-toggle]")!;
    if (toggle.getAttribute("aria-expanded") === "false") toggle.click();
    expect(secondCard.textContent).toContain("New title");
    expect(firstQueries).not.toHaveBeenCalled();
  }, 10000);
});
