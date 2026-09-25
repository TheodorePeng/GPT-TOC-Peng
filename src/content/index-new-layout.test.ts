import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  window.localStorage.clear();
});

describe("current ChatGPT layout", () => {
  it("shows answer headings and restores its shell after ChatGPT replaces body content", async () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
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
        <div data-content-search-turn-key="fallback-turn-0">
          <div data-content-search-unit-key="fallback-turn-0:0:user">Prompt A</div>
          <div data-content-search-unit-key="fallback-turn-0:2:assistant">
            <h4 data-conversation-role="assistant">ChatGPT said:</h4>
            <div data-chatgpt-selection-message-id="answer-a">
              <div data-markdown-text-style="assistant-message"><h2>First heading</h2></div>
            </div>
          </div>
        </div>
      </main>`;

    await import("./index");
    const root = await vi.waitFor(() => {
      const element = document.querySelector<HTMLElement>("#gpt-reader-root");
      expect(element?.querySelectorAll("[data-gpt-reader-heading]")).toHaveLength(1);
      expect(element?.textContent).toContain("Prompt A");
      return element!;
    });
    expect(root.textContent).not.toContain("ChatGPT said:");

    document.body.replaceChildren(document.createElement("main"));
    await vi.waitFor(() => expect(document.querySelector("#gpt-reader-root")).toBe(root));

    document.querySelector("main")!.innerHTML = `
      <div data-content-search-turn-key="fallback-turn-1">
        <div data-content-search-unit-key="fallback-turn-1:0:user">Prompt B</div>
        <div data-content-search-unit-key="fallback-turn-1:2:assistant">
          <div data-chatgpt-selection-message-id="answer-b"><h2>New heading</h2></div>
        </div>
      </div>`;
    await vi.waitFor(() => {
      expect(root.querySelector("[data-gpt-reader-heading]")?.textContent)
        .toContain("New heading");
    });
  });
});
