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

    const range = document.querySelector<HTMLInputElement>("[data-setting-scroll-position-range]")!;
    range.value = "50";
    range.dispatchEvent(new Event("input", { bubbles: true }));
    expect(document.querySelector("[data-settings-save-status]")?.textContent).toBe("松开滑块后应用");
    range.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => {
      expect(persisted.headingScrollPositionPercent).toBe(50);
      expect(document.querySelector("[data-settings-save-status]")?.textContent).toBe("已保存");
    });

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

    const rounds = document.querySelector<HTMLInputElement>("[data-setting-max-rounds]")!;
    rounds.value = "3";
    rounds.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(persisted.maxVisibleRounds).toBe(3));

    const duration = document.querySelector<HTMLSelectElement>("[data-setting-highlight-duration]")!;
    duration.value = "3000";
    duration.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(persisted.targetHighlightDurationMs).toBe(3000));

    const highlight = document.querySelector<HTMLInputElement>("[data-setting-target-highlight]")!;
    highlight.checked = false;
    highlight.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(persisted.targetHighlightEnabled).toBe(false));
    expect(persisted.headingScrollPositionPercent).toBe(50);
    expect(persisted.maxDepth).toBe(4);

    set.mockRejectedValueOnce(new Error("storage unavailable"));
    const wrap = document.querySelector<HTMLInputElement>("[data-setting-wrap-titles]")!;
    wrap.checked = false;
    wrap.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(document.querySelector("[data-settings-save-status]")?.textContent)
      .toBe("保存失败，请重试"));
    expect(persisted.wrapLongTitles).toBe(true);
    expect(document.querySelector<HTMLInputElement>("[data-setting-wrap-titles]")?.checked).toBe(true);
  });
});
