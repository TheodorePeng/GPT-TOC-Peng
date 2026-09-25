import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, type TocSettings } from "../shared/settings";

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("popup settings persistence", () => {
  it("applies the slider, other controls, and shows a failed save", async () => {
    let persisted: TocSettings = { ...DEFAULT_SETTINGS };
    const listeners = new Set<(
      changes: Record<string, chrome.storage.StorageChange>, area: string
    ) => void>();
    const set = vi.fn(async (items: { gptReaderSettings: TocSettings }) => {
      const previous = persisted;
      persisted = items.gptReaderSettings;
      listeners.forEach((listener) => listener({
        gptReaderSettings: { oldValue: previous, newValue: persisted }
      }, "sync"));
    });
    vi.stubGlobal("chrome", {
      storage: {
        sync: { get: vi.fn(async () => ({ gptReaderSettings: persisted })), set },
        onChanged: {
          addListener: (listener: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void) => listeners.add(listener),
          removeListener: (listener: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void) => listeners.delete(listener)
        }
      }
    });
    document.body.innerHTML = '<div id="app"></div>';
    await import("./index");
    await vi.waitFor(() => expect(document.querySelector("[data-setting-scroll-position-range]")).not.toBeNull());
    document.querySelector<HTMLButtonElement>("[data-setting-tab='appearance']")!.click();
    expect(document.querySelector<HTMLElement>("[data-setting-panel='toc']")?.hidden).toBe(true);
    expect(document.querySelector<HTMLElement>("[data-setting-panel='appearance']")?.hidden).toBe(false);
    const draft = document.querySelector<HTMLInputElement>("[data-setting-opacity-number]")!;
    draft.focus();
    draft.value = "73";
    listeners.forEach((listener) => listener({
      gptReaderSettings: { newValue: { ...persisted, maxDepth: 3 } }
    }, "sync"));
    expect(document.querySelector("[data-setting-opacity-number]")).toBe(draft);
    expect(draft.value).toBe("73");
    expect(document.activeElement).toBe(draft);

    const range = document.querySelector<HTMLInputElement>("[data-setting-scroll-position-range]")!;
    range.value = "50";
    range.dispatchEvent(new Event("input", { bubbles: true }));
    expect(document.querySelector("[data-settings-save-status]")?.textContent).toBe("松开滑块后应用");
    range.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => {
      expect(persisted.headingScrollPositionPercent).toBe(50);
      expect(document.querySelector("[data-settings-save-status]")?.textContent).toBe("已保存");
    });

    document.querySelector<HTMLButtonElement>("[data-setting-tab='toc']")!.click();
    const depth = document.querySelector<HTMLButtonElement>("[data-setting-depth='4']")!;
    depth.click();
    await vi.waitFor(() => expect(persisted.maxDepth).toBe(4));

    const changeCheckbox = async (selector: string, expected: Partial<TocSettings>) => {
      const input = document.querySelector<HTMLInputElement>(selector)!;
      input.checked = false;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await vi.waitFor(() => expect(persisted).toMatchObject(expected));
    };
    await changeCheckbox("[data-setting-enabled]", { enabled: false });
    await changeCheckbox("[data-setting-expand-current]", { expandCurrentOnly: false });
    await changeCheckbox("[data-setting-hover-expand]", { hoverExpandEnabled: false });

    const beforeCount = document.querySelector<HTMLInputElement>("[data-setting-before-count]")!;
    beforeCount.value = "0";
    beforeCount.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(persisted.visibleAnswersBeforeCurrent).toBe(0));
    const afterCount = document.querySelector<HTMLInputElement>("[data-setting-after-count]")!;
    afterCount.value = "20";
    afterCount.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(persisted.visibleAnswersAfterCurrent).toBe(20));

    document.querySelector<HTMLDetailsElement>(".advanced-panel")!.open = true;
    const rounds = document.querySelector<HTMLInputElement>("[data-setting-max-rounds]")!;
    rounds.value = "3";
    rounds.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(persisted.maxVisibleRounds).toBe(3));
    expect(document.querySelector<HTMLDetailsElement>(".advanced-panel")?.open).toBe(true);

    document.querySelector<HTMLButtonElement>("[data-setting-tab='appearance']")!.click();
    const duration = document.querySelector<HTMLInputElement>("[data-setting-highlight-duration]")!;
    expect(document.querySelector("[data-setting-highlight-preset]")).toBeNull();
    duration.value = "2.75";
    duration.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(persisted.targetHighlightDurationMs).toBe(2750));

    const opacity = document.querySelector<HTMLInputElement>("[data-setting-opacity-number]")!;
    opacity.value = "0";
    opacity.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(persisted.panelSurfaceOpacityPercent).toBe(0));
    const updatedOpacity = document.querySelector<HTMLInputElement>("[data-setting-opacity-number]")!;
    updatedOpacity.value = "100";
    updatedOpacity.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(persisted.panelSurfaceOpacityPercent).toBe(100));
    const invalidOpacity = document.querySelector<HTMLInputElement>("[data-setting-opacity-number]")!;
    invalidOpacity.value = "101";
    invalidOpacity.dispatchEvent(new Event("change", { bubbles: true }));
    expect(document.querySelector("[data-settings-save-status]")?.textContent).toContain("0–100%");
    expect(persisted.panelSurfaceOpacityPercent).toBe(100);
    document.querySelector<HTMLButtonElement>("[data-setting-opacity-reset]")!.click();
    await vi.waitFor(() => expect(persisted.panelSurfaceOpacityPercent).toBeNull());

    const highlight = document.querySelector<HTMLInputElement>("[data-setting-target-highlight]")!;
    highlight.checked = false;
    highlight.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(persisted.targetHighlightEnabled).toBe(false));
    expect(persisted.headingScrollPositionPercent).toBe(50);
    expect(persisted.maxDepth).toBe(4);

    set.mockRejectedValueOnce(new Error("storage unavailable"));
    document.querySelector<HTMLButtonElement>("[data-setting-tab='toc']")!.click();
    const wrap = document.querySelector<HTMLInputElement>("[data-setting-wrap-titles]")!;
    wrap.checked = false;
    wrap.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(document.querySelector("[data-settings-save-status]")?.textContent)
      .toBe("保存失败，请重试"));
    expect(persisted.wrapLongTitles).toBe(true);
    expect(document.querySelector<HTMLInputElement>("[data-setting-wrap-titles]")?.checked).toBe(true);
  });
});
