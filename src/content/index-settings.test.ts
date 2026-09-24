import { afterEach, describe, expect, it, vi } from "vitest";
import type { TocSettings } from "../shared/settings";

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  window.localStorage.clear();
});

describe("panel settings application", () => {
  it("saves quick settings and applies their visible effects", async () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    const set = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("chrome", {
      storage: {
        sync: { get: vi.fn().mockResolvedValue({}), set },
        local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() }
      }
    });
    document.body.innerHTML = `
      <main>
        <div data-testid="conversation-turn-0"><div data-message-author-role="user">First</div><article data-message-author-role="assistant" data-message-id="first"><h1>First title</h1><h2>First child</h2></article></div>
        <div data-testid="conversation-turn-1"><div data-message-author-role="user">Second</div><article data-message-author-role="assistant" data-message-id="second"><h1>Second title</h1><h2>Second child</h2></article></div>
      </main>
    `;
    await import("./index");
    const root = await vi.waitFor(() => {
      const element = document.querySelector<HTMLElement>("#gpt-reader-root");
      expect(element?.querySelectorAll(".gpt-reader-answer")).toHaveLength(2);
      return element!;
    });
    const saved = (): TocSettings => set.mock.lastCall?.[0].gptReaderSettings as TocSettings;

    root.querySelector<HTMLButtonElement>("[data-gpt-reader-depth='1']")!.click();
    await vi.waitFor(() => expect(saved().maxDepth).toBe(1));
    expect(root.querySelector(".gpt-reader-answer.is-current")?.querySelectorAll(".gpt-reader-heading")).toHaveLength(1);

    const expand = root.querySelector<HTMLInputElement>("[data-gpt-reader-expand-current]")!;
    expand.checked = false;
    expand.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(saved().expandCurrentOnly).toBe(false));
    root.querySelector<HTMLButtonElement>("[data-gpt-reader-depth='2']")!.click();
    await vi.waitFor(() => expect(saved().maxDepth).toBe(2));
    expect([...root.querySelectorAll(".gpt-reader-answer")].every(
      (group) => group.querySelectorAll(".gpt-reader-heading").length === 2
    )).toBe(true);

    const wrap = root.querySelector<HTMLInputElement>("[data-gpt-reader-wrap-titles]")!;
    wrap.checked = false;
    wrap.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(saved().wrapLongTitles).toBe(false));
    expect(root.classList.contains("is-title-wrap-enabled")).toBe(false);

    const rounds = root.querySelector<HTMLInputElement>("[data-gpt-reader-max-rounds]")!;
    rounds.value = "1";
    rounds.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(saved().maxVisibleRounds).toBe(1));
    expect(document.querySelector("#gpt-reader-round-limit-banner")).not.toBeNull();

    const enabled = root.querySelector<HTMLInputElement>("[data-gpt-reader-enabled]")!;
    enabled.checked = false;
    enabled.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(saved().enabled).toBe(false));
    expect(root.classList.contains("is-disabled")).toBe(true);
  });
});
