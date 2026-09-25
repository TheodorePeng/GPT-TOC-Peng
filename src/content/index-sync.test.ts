import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
  window.localStorage.clear();
});

describe("live answer synchronization", () => {
  it("refreshes a 43-heading answer on scroll, holds a clicked heading, and clears a headingless answer", async () => {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 1803 });
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
    vi.stubGlobal("scrollBy", vi.fn());
    document.body.innerHTML = `
      <main>
        <article data-message-author-role="assistant" data-message-id="long"><h2>Old heading</h2></article>
        <article data-message-author-role="assistant" data-message-id="empty"><p>No headings</p></article>
      </main>
    `;
    const [longAnswer, emptyAnswer] = Array.from(
      document.querySelectorAll<HTMLElement>("[data-message-author-role='assistant']")
    );
    vi.spyOn(longAnswer, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ y: 0, width: 600, height: 5000 })
    );
    let emptyTop = 6000;
    vi.spyOn(emptyAnswer, "getBoundingClientRect").mockImplementation(() =>
      DOMRect.fromRect({ y: emptyTop, width: 600, height: 2000 })
    );

    await import("./index");
    const root = await vi.waitFor(() => {
      const element = document.querySelector<HTMLElement>("#gpt-reader-root");
      expect(element?.querySelectorAll("[data-gpt-reader-heading]")).toHaveLength(1);
      return element!;
    });

    longAnswer.innerHTML = Array.from({ length: 43 }, (_, index) => `<h2>Heading ${index + 1}</h2>`).join("");
    const headings = Array.from(longAnswer.querySelectorAll<HTMLElement>("h2"));
    headings.forEach((heading, index) => {
      vi.spyOn(heading, "getBoundingClientRect").mockReturnValue(
        DOMRect.fromRect({ y: index * 50, width: 500, height: 24 })
      );
      heading.scrollIntoView = vi.fn();
    });
    window.dispatchEvent(new Event("scroll"));
    await vi.waitFor(() => {
      expect(root.querySelectorAll("[data-gpt-reader-heading]")).toHaveLength(43);
    });

    const firstRailMarker = root.querySelector(".gpt-reader-collapsed-marker");
    window.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => window.setTimeout(resolve, 30));
    expect(headings.every((heading) => (heading.scrollIntoView as ReturnType<typeof vi.fn>).mock.calls.length === 0)).toBe(true);
    expect(window.scrollBy).not.toHaveBeenCalled();
    const ninth = root.querySelectorAll<HTMLButtonElement>("[data-gpt-reader-heading]")[8];
    ninth.click();
    expect(headings[8].scrollIntoView).toHaveBeenCalledOnce();
    expect(root.querySelector(".gpt-reader-heading.is-active")?.textContent).toContain("Heading 9");
    expect(root.querySelector(".gpt-reader-collapsed-marker")).toBe(firstRailMarker);

    const replacement = headings[8].cloneNode(true) as HTMLElement;
    vi.spyOn(replacement, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ y: 400, width: 500, height: 24 })
    );
    headings[8].replaceWith(replacement);
    window.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => window.setTimeout(resolve, 30));
    expect(root.querySelector(".gpt-reader-heading.is-active")?.textContent).toContain("Heading 9");
    expect(replacement.hasAttribute("data-gpt-reader-heading-id")).toBe(false);

    const list = root.querySelector<HTMLElement>("[data-gpt-reader-list]")!;
    Object.defineProperty(list, "clientHeight", { configurable: true, value: 652 });
    Object.defineProperty(list, "scrollHeight", { configurable: true, value: 1550 });
    vi.spyOn(list, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ y: 100, width: 240, height: 652 })
    );
    vi.spyOn(root.querySelector<HTMLElement>(".gpt-reader-heading.is-active")!, "getBoundingClientRect")
      .mockReturnValue(DOMRect.fromRect({ y: 105, width: 200, height: 30 }));
    list.scrollTop = 300;
    list.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    await new Promise((resolve) => window.setTimeout(resolve, 120));
    expect(window.scrollBy).not.toHaveBeenCalled();

    const main = document.querySelector<HTMLElement>("main")!;
    main.style.overflowY = "auto";
    Object.defineProperty(main, "clientHeight", { configurable: true, value: 500 });
    Object.defineProperty(main, "scrollHeight", { configurable: true, value: 2000 });
    const scrollMain = vi.fn();
    main.scrollBy = scrollMain;
    Object.defineProperty(list, "clientHeight", { configurable: true, value: 1550 });
    const shortListWheel = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 320 });
    list.dispatchEvent(shortListWheel);
    expect(shortListWheel.defaultPrevented).toBe(true);
    expect(scrollMain).toHaveBeenCalledWith({ top: 320, behavior: "instant" });
    Object.defineProperty(list, "scrollHeight", { configurable: true, value: 1556 });
    const tinyOverflowWheel = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 320 });
    list.dispatchEvent(tinyOverflowWheel);
    expect(tinyOverflowWheel.defaultPrevented).toBe(true);
    expect(scrollMain).toHaveBeenCalledTimes(2);
    Object.defineProperty(list, "clientHeight", { configurable: true, value: 652 });
    list.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 320 }));
    expect(scrollMain).toHaveBeenCalledTimes(2);

    window.dispatchEvent(new Event("resize"));
    await new Promise((resolve) => window.setTimeout(resolve, 30));
    expect(list.scrollTop).toBe(300);

    document.body.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    vi.spyOn(headings[17], "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ y: 820, width: 500, height: 24 })
    );
    window.dispatchEvent(new Event("scroll"));
    await vi.waitFor(() => {
      expect(root.querySelector(".gpt-reader-heading.is-active")?.textContent).toContain("Heading 18");
    });

    vi.spyOn(longAnswer, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ y: -5500, width: 600, height: 5000 })
    );
    emptyTop = 0;
    window.dispatchEvent(new Event("scroll"));
    await vi.waitFor(() => {
      expect(root.querySelector(".gpt-reader-answer.is-current")?.textContent).toContain("当前回答暂无 Markdown 标题");
      expect(root.querySelector("[data-gpt-reader-collapsed-rail]")?.getAttribute("aria-label"))
        .toContain("当前回答暂无标题");
    });
  });
});
