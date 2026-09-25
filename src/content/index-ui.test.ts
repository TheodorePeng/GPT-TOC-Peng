import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  window.localStorage.clear();
});

describe("panel UI preferences", () => {
  it("keeps a saved narrow width recoverable and allows continuous 24–440px resizing", async () => {
    vi.stubGlobal("innerWidth", 1600);
    vi.stubGlobal("innerHeight", 1000);
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    const localSet = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("chrome", { storage: {
      sync: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) },
      local: {
        get: vi.fn().mockResolvedValue({ gptReaderUiState: {
          width: 24, lastReadableWidth: 320, position: { left: 1300, top: 80 }
        } }),
        set: localSet
      },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() }
    } });
    document.body.innerHTML = "<main><article data-message-author-role='assistant'><h2>Title</h2></article></main>";
    await import("./index");
    const root = await vi.waitFor(() => document.querySelector<HTMLElement>("#gpt-reader-root")!);
    expect(root.style.getPropertyValue("--gpt-reader-width")).toBe("24px");
    expect(root.classList.contains("is-ultra-narrow")).toBe(true);
    expect(root.dataset.panelSide).toBe("right");
    root.querySelector<HTMLButtonElement>("[data-gpt-reader-collapsed-rail]")!.click();
    expect(root.style.getPropertyValue("--gpt-reader-width")).toBe("320px");

    const handle = root.querySelector<HTMLElement>("[data-gpt-reader-resize]")!;
    handle.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 0 }));
    for (const width of [24, 127, 128, 260, 440, 600, 24]) {
      window.dispatchEvent(new MouseEvent("pointermove", {
        clientX: width - 320
      }));
      expect(root.style.getPropertyValue("--gpt-reader-width"))
        .toBe(`${Math.min(width, 440)}px`);
      expect(root.classList.contains("is-ultra-narrow")).toBe(width < 128);
    }
    window.dispatchEvent(new MouseEvent("pointerup"));
    await vi.waitFor(() => expect(localSet.mock.lastCall?.[0].gptReaderUiState)
      .toMatchObject({ width: 24, lastReadableWidth: 320 }));
    root.querySelector<HTMLButtonElement>("[data-gpt-reader-collapsed-rail]")!.click();
    expect(root.style.getPropertyValue("--gpt-reader-width")).toBe("320px");

    vi.stubGlobal("innerWidth", 3000);
    window.dispatchEvent(new Event("resize"));
    expect(root.dataset.panelSide).toBe("left");
  });

  it("defaults new installations to smart height and only grows as far as needed", async () => {
    vi.stubGlobal("innerWidth", 1600);
    vi.stubGlobal("innerHeight", 1000);
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    }));
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    const localSet = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("chrome", {
      storage: {
        sync: { get: vi.fn().mockResolvedValue({
          gptReaderSettings: { panelSurfaceOpacityPercent: 0 }
        }), set: vi.fn().mockResolvedValue(undefined) },
        local: { get: vi.fn().mockResolvedValue({}), set: localSet },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() }
      }
    });
    document.body.innerHTML = "<main><article data-message-author-role='assistant'><h1>Title</h1></article></main>";
    await import("./index");
    const root = await vi.waitFor(() => document.querySelector<HTMLElement>("#gpt-reader-root")!);
    expect(root.style.getPropertyValue("--gpt-reader-surface-alpha")).toBe("0");
    expect(root.querySelector<HTMLSelectElement>("[data-gpt-reader-height-mode]")?.value).toBe("smart");
    const content = root.querySelector<HTMLElement>("[data-gpt-reader-list-content]")!;
    let contentHeight = 120;
    Object.defineProperty(content, "scrollHeight", { get: () => contentHeight });
    frames.splice(0).forEach((frame) => frame(0));
    expect(root.style.getPropertyValue("--gpt-reader-height")).toBe("164px");
    root.querySelector<HTMLButtonElement>("[data-gpt-reader-settings-toggle]")!.click();
    expect(root.querySelector<HTMLElement>("[data-gpt-reader-settings]")?.hidden).toBe(false);
    expect(root.style.getPropertyValue("--gpt-reader-height")).toBe("164px");
    root.querySelector<HTMLButtonElement>("[data-gpt-reader-settings-toggle]")!.click();
    const list = root.querySelector<HTMLElement>("[data-gpt-reader-list]")!;
    let listHeight = 400;
    Object.defineProperty(list, "clientHeight", { get: () => 500 });
    Object.defineProperty(list, "scrollHeight", { get: () => listHeight });
    window.dispatchEvent(new Event("resize"));
    frames.splice(0).forEach((frame) => frame(0));
    expect(list.classList.contains("gpt-reader-list-scrollable")).toBe(false);
    listHeight = 900;
    window.dispatchEvent(new Event("resize"));
    frames.splice(0).forEach((frame) => frame(0));
    expect(list.classList.contains("gpt-reader-list-scrollable")).toBe(true);

    vi.spyOn(root, "getBoundingClientRect").mockImplementation(() => DOMRect.fromRect({
      x: Number.parseFloat(root.style.getPropertyValue("--gpt-reader-left")),
      y: Number.parseFloat(root.style.getPropertyValue("--gpt-reader-top")),
      width: 32,
      height: Number.parseFloat(root.style.getPropertyValue("--gpt-reader-height"))
    }));
    const mode = root.querySelector<HTMLSelectElement>("[data-gpt-reader-height-mode]")!;
    mode.value = "fixed";
    mode.dispatchEvent(new Event("change", { bubbles: true }));
    expect(root.style.getPropertyValue("--gpt-reader-height")).toBe("164px");
    mode.value = "smart";
    mode.dispatchEvent(new Event("change", { bubbles: true }));

    contentHeight = 2000;
    const percent = root.querySelector<HTMLInputElement>("[data-gpt-reader-height-percent]")!;
    percent.value = "50";
    percent.dispatchEvent(new Event("change", { bubbles: true }));
    expect(root.style.getPropertyValue("--gpt-reader-height")).toBe("500px");
    await vi.waitFor(() => expect(localSet).toHaveBeenCalledWith({
      gptReaderUiState: expect.objectContaining({ heightMode: "smart", heightPercent: 50 })
    }));
  });

  it("keeps legacy height, applies percentage mode, and pins only on explicit action", async () => {
    vi.stubGlobal("innerWidth", 1600);
    vi.stubGlobal("innerHeight", 1000);
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    const localSet = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("chrome", {
      storage: {
        sync: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) },
        local: {
          get: vi.fn().mockResolvedValue({
            gptReaderUiState: {
              height: 710,
              position: { left: 1000, top: 50 },
              mode: "rail",
              expandDirection: "left"
            }
          }),
          set: localSet
        },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() }
      }
    });
    document.body.innerHTML = "<main><article data-message-author-role='assistant'><h1>Title</h1></article></main>";
    await import("./index");
    const root = await vi.waitFor(() => {
      const element = document.querySelector<HTMLElement>("#gpt-reader-root");
      expect(element?.style.getPropertyValue("--gpt-reader-height")).toBe("710px");
      return element!;
    });
    const mode = root.querySelector<HTMLSelectElement>("[data-gpt-reader-height-mode]")!;
    const percent = root.querySelector<HTMLInputElement>("[data-gpt-reader-height-percent]")!;
    const pin = root.querySelector<HTMLButtonElement>("[data-gpt-reader-pin]")!;
    expect(mode.value).toBe("fixed");
    expect(root.classList.contains("is-collapsed")).toBe(true);
    expect(localSet).not.toHaveBeenCalled();

    vi.spyOn(root, "getBoundingClientRect").mockImplementation(() => DOMRect.fromRect({
      x: Number.parseFloat(root.style.getPropertyValue("--gpt-reader-left")),
      y: Number.parseFloat(root.style.getPropertyValue("--gpt-reader-top")),
      width: 32,
      height: Number.parseFloat(root.style.getPropertyValue("--gpt-reader-height"))
    }));
    mode.value = "viewport";
    mode.dispatchEvent(new Event("change", { bubbles: true }));
    expect(root.style.getPropertyValue("--gpt-reader-height")).toBe("650px");
    expect(root.style.getPropertyValue("--gpt-reader-top")).toBe("80px");
    expect(mode.value).toBe("viewport");

    percent.value = "50";
    percent.dispatchEvent(new Event("change", { bubbles: true }));
    expect(root.style.getPropertyValue("--gpt-reader-height")).toBe("500px");
    expect(root.style.getPropertyValue("--gpt-reader-top")).toBe("155px");
    const writesBeforeResize = localSet.mock.calls.length;
    vi.stubGlobal("innerHeight", 1800);
    window.dispatchEvent(new Event("resize"));
    expect(root.style.getPropertyValue("--gpt-reader-height")).toBe("900px");
    expect(localSet).toHaveBeenCalledTimes(writesBeforeResize);

    root.dispatchEvent(new Event("pointerenter"));
    await vi.waitFor(() => expect(root.classList.contains("is-peek")).toBe(true));
    root.querySelector<HTMLElement>("[data-gpt-reader-settings-toggle]")?.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true })
    );
    root.querySelector<HTMLButtonElement>("[data-gpt-reader-settings-toggle]")!.click();
    expect(root.classList.contains("is-peek")).toBe(true);
    expect(pin.getAttribute("aria-pressed")).toBe("false");

    pin.click();
    expect(pin.getAttribute("aria-pressed")).toBe("true");
    expect(root.classList.contains("is-peek")).toBe(false);
    pin.click();
    expect(pin.getAttribute("aria-pressed")).toBe("false");
    expect(root.classList.contains("is-collapsed")).toBe(true);

    root.querySelector<HTMLButtonElement>("[data-gpt-reader-collapsed-rail]")!.click();
    expect(root.classList.contains("is-collapsed")).toBe(false);
    const centerBeforeDrag = localSet.mock.lastCall?.[0].gptReaderUiState.centerYRatio as number;
    root.querySelector<HTMLElement>("[data-gpt-reader-drag]")?.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, clientX: 100, clientY: 100 })
    );
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 100, clientY: 130 }));
    window.dispatchEvent(new MouseEvent("pointerup"));
    await vi.waitFor(() => expect(localSet).toHaveBeenCalledWith({
      gptReaderUiState: expect.objectContaining({
        heightMode: "viewport",
        heightPercent: 50,
        centerYRatio: expect.any(Number)
      })
    }));
    await vi.waitFor(() => expect(
      (localSet.mock.lastCall?.[0].gptReaderUiState.centerYRatio as number)
    ).toBeGreaterThan(centerBeforeDrag));

    mode.value = "fixed";
    mode.dispatchEvent(new Event("change", { bubbles: true }));
    expect(root.style.getPropertyValue("--gpt-reader-height")).toBe("710px");
    await vi.waitFor(() => expect(localSet.mock.lastCall?.[0].gptReaderUiState.heightMode)
      .toBe("fixed"));
    const dragHandle = root.querySelector<HTMLElement>("[data-gpt-reader-drag]")!;
    expect(dragHandle.tabIndex).toBe(0);
    const topBeforeKey = Number.parseFloat(root.style.getPropertyValue("--gpt-reader-top"));
    dragHandle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(Number.parseFloat(root.style.getPropertyValue("--gpt-reader-top")))
      .toBe(topBeforeKey + 5);
  });
});
