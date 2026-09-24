import { afterEach, describe, expect, it, vi } from "vitest";

describe("restored panel position", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    window.localStorage.clear();
    document.body.replaceChildren();
  });

  it("reflows without saving and commits a new position only after a user drag", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1269 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 1735 });
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("CSS", { escape: (value: string) => value });

    const localSet = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("chrome", {
      storage: {
        sync: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined)
        },
        local: {
          get: vi.fn().mockResolvedValue({
            gptReaderUiState: {
              position: { left: 1456, top: 50 },
              width: 265,
              height: 710,
              mode: "rail",
              expandDirection: "left"
            }
          }),
          set: localSet
        },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() }
      }
    });
    document.body.innerHTML = `
      <main>
        <div data-message-author-role="assistant"><h1>Visible answer heading</h1></div>
      </main>
    `;

    await import("./index");
    const root = await vi.waitFor(() => {
      const element = document.querySelector<HTMLElement>("#gpt-reader-root");
      expect(element?.style.getPropertyValue("--gpt-reader-left")).toBe("1229px");
      return element!;
    });
    expect(root.classList.contains("is-collapsed")).toBe(true);
    expect(localSet).not.toHaveBeenCalled();

    const originalHeading = document.querySelector<HTMLElement>(
      "[data-message-author-role='assistant'] h1"
    )!;
    const replacementHeading = document.createElement("h1");
    replacementHeading.textContent = originalHeading.textContent;
    replacementHeading.scrollIntoView = vi.fn();
    const headingButton = root.querySelector<HTMLButtonElement>("[data-gpt-reader-heading]")!;
    originalHeading.replaceWith(replacementHeading);
    headingButton.click();
    expect(replacementHeading.scrollIntoView).toHaveBeenCalledOnce();
    expect(headingButton.isConnected).toBe(true);
    expect(localSet).not.toHaveBeenCalled();

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1600 });
    window.dispatchEvent(new Event("resize"));
    expect(root.style.getPropertyValue("--gpt-reader-left")).toBe("1456px");
    expect(localSet).not.toHaveBeenCalled();

    vi.spyOn(root, "getBoundingClientRect").mockImplementation(() => {
      const left = Number.parseFloat(root.style.getPropertyValue("--gpt-reader-left"));
      const top = Number.parseFloat(root.style.getPropertyValue("--gpt-reader-top"));
      const height = Number.parseFloat(root.style.getPropertyValue("--gpt-reader-height"));
      return DOMRect.fromRect({ x: left, y: top, width: 32, height });
    });
    root.querySelector<HTMLElement>("[data-gpt-reader-drag]")?.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, clientX: 100, clientY: 100 })
    );
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 120, clientY: 100 }));
    window.dispatchEvent(new MouseEvent("pointerup"));

    await vi.waitFor(() => {
      expect(localSet).toHaveBeenCalledWith({
        gptReaderUiState: expect.objectContaining({ position: { left: 1476, top: 50 } })
      });
    });

    await new Promise((resolve) => setTimeout(resolve, 150));
    vi.useFakeTimers();
    replacementHeading.textContent = "Updated answer heading";
    const paragraph = document.createElement("p");
    document.querySelector("[data-message-author-role='assistant']")?.append(paragraph);
    for (let index = 0; index < 11; index += 1) {
      paragraph.textContent = String(index);
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(root.querySelector("[data-gpt-reader-heading]")?.textContent).toContain(
      "Updated answer heading"
    );
    expect(localSet).toHaveBeenCalledTimes(1);
  });
});
