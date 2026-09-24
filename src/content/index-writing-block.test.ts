import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
  window.localStorage.clear();
});

describe("Writing Block integration", () => {
  it("indexes 70 editable headings without mutating the editor during scroll sync", async () => {
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
      <main><section data-testid="conversation-turn-0">
        <article data-message-author-role="assistant" data-message-id="writing-block">
          <div data-testid="writing-block-container"><div class="ProseMirror" contenteditable="true">
            <h1>Document title</h1>
            ${Array.from({ length: 69 }, (_, index) => `<h2>Chapter ${index + 1}</h2>`).join("")}
          </div></div>
        </article>
      </section></main>
    `;
    const answer = document.querySelector<HTMLElement>("article")!;
    const editor = document.querySelector<HTMLElement>(".ProseMirror")!;
    const originalMarkup = editor.outerHTML;
    vi.spyOn(answer, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ y: 0, width: 600, height: 10000 })
    );
    let mutations = 0;
    const observer = new MutationObserver((records) => { mutations += records.length; });
    observer.observe(editor, { attributes: true, characterData: true, childList: true, subtree: true });

    await import("./index");
    const root = await vi.waitFor(() => {
      const element = document.querySelector<HTMLElement>("#gpt-reader-root");
      expect(element?.querySelectorAll("[data-gpt-reader-heading]")).toHaveLength(70);
      return element!;
    });
    const firstButton = root.querySelector("[data-gpt-reader-heading]");
    for (let index = 0; index < 8; index += 1) {
      window.dispatchEvent(new Event("scroll"));
    }
    await new Promise((resolve) => window.setTimeout(resolve, 250));
    observer.disconnect();

    expect(editor.outerHTML).toBe(originalMarkup);
    expect(mutations).toBe(0);
    expect(root.querySelector("[data-gpt-reader-heading]")).toBe(firstButton);

    const replacement = editor.cloneNode(true) as HTMLElement;
    editor.replaceWith(replacement);
    let remountMutations = 0;
    const remountObserver = new MutationObserver((records) => { remountMutations += records.length; });
    remountObserver.observe(replacement, {
      attributes: true, characterData: true, childList: true, subtree: true
    });
    window.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => window.setTimeout(resolve, 250));
    remountObserver.disconnect();

    expect(replacement.outerHTML).toBe(originalMarkup);
    expect(remountMutations).toBe(0);
    expect(root.querySelector("[data-gpt-reader-heading]")).toBe(firstButton);
  });
});
