import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  getSettings,
  mergeSettings,
  normalizeHeadingScrollPositionPercent,
  saveSettings,
  subscribeSettings
} from "./settings";

const SETTINGS_KEY = "gptReaderSettings";

type StorageListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string
) => void;

const installChromeStorage = (storedValue?: unknown) => {
  const listeners = new Set<StorageListener>();
  const get = vi.fn(async () => ({ [SETTINGS_KEY]: storedValue }));
  const set = vi.fn(async (_items: Record<string, unknown>): Promise<void> => undefined);

  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      sync: { get, set },
      onChanged: {
        addListener: (listener: StorageListener) => {
          listeners.add(listener);
        },
        removeListener: (listener: StorageListener) => {
          listeners.delete(listener);
        }
      }
    }
  };

  return {
    set,
    emit: (newValue: unknown, areaName = "sync") => {
      listeners.forEach((listener) =>
        listener({ [SETTINGS_KEY]: { newValue } }, areaName)
      );
    }
  };
};

describe("interaction settings compatibility", () => {
  beforeEach(() => installChromeStorage());

  afterEach(() => {
    delete (globalThis as unknown as { chrome?: unknown }).chrome;
  });

  it("adds safe interaction defaults", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      hoverExpandEnabled: true,
      targetHighlightEnabled: true,
      targetHighlightDurationMs: 1500,
      panelSurfaceOpacityPercent: null,
      wrapLongTitles: true,
      headingScrollPositionPercent: 25,
      visibleAnswersBeforeCurrent: 2,
      visibleAnswersAfterCurrent: 1
    });
  });

  it("backfills interaction defaults when loading legacy settings", async () => {
    installChromeStorage({
      enabled: false,
      maxDepth: 4,
      expandCurrentOnly: false,
      maxVisibleRounds: 3
    });

    await expect(getSettings()).resolves.toMatchObject({
      enabled: false,
      maxDepth: 4,
      expandCurrentOnly: false,
      maxVisibleRounds: 3,
      hoverExpandEnabled: true,
      targetHighlightEnabled: true,
      targetHighlightDurationMs: 1500,
      wrapLongTitles: true,
      headingScrollPositionPercent: 25,
      visibleAnswersBeforeCurrent: 2,
      visibleAnswersAfterCurrent: 1
    });
  });

  it.each([800, 1500, 3000])("accepts the %i ms highlight duration", (duration) => {
    expect(
      mergeSettings(DEFAULT_SETTINGS, { targetHighlightDurationMs: duration } as never)
    ).toMatchObject({ targetHighlightDurationMs: duration });
  });

  it("accepts custom duration and opacity but rejects invalid values", () => {
    expect(mergeSettings(DEFAULT_SETTINGS, {
      targetHighlightDurationMs: 2750,
      panelSurfaceOpacityPercent: 78
    })).toMatchObject({ targetHighlightDurationMs: 2750, panelSurfaceOpacityPercent: 78 });
    expect(mergeSettings(DEFAULT_SETTINGS, {
      targetHighlightDurationMs: 2755,
      panelSurfaceOpacityPercent: 101
    })).toMatchObject({ targetHighlightDurationMs: 1500, panelSurfaceOpacityPercent: null });
    expect(mergeSettings(DEFAULT_SETTINGS, { panelSurfaceOpacityPercent: 0 })
      .panelSurfaceOpacityPercent).toBe(0);
    expect(mergeSettings(DEFAULT_SETTINGS, { panelSurfaceOpacityPercent: 100 })
      .panelSurfaceOpacityPercent).toBe(100);
    expect(mergeSettings(DEFAULT_SETTINGS, { panelSurfaceOpacityPercent: 70.5 })
      .panelSurfaceOpacityPercent).toBeNull();
  });

  it("normalizes invalid highlight durations to 1500 ms", () => {
    expect(
      mergeSettings(DEFAULT_SETTINGS, { targetHighlightDurationMs: 999 } as never)
    ).toMatchObject({ targetHighlightDurationMs: 1500 });
  });

  it("accepts only 0–20 whole-number neighbor counts", () => {
    expect(mergeSettings(DEFAULT_SETTINGS, {
      visibleAnswersBeforeCurrent: 0,
      visibleAnswersAfterCurrent: 20
    })).toMatchObject({ visibleAnswersBeforeCurrent: 0, visibleAnswersAfterCurrent: 20 });
    expect(mergeSettings(DEFAULT_SETTINGS, {
      visibleAnswersBeforeCurrent: -1,
      visibleAnswersAfterCurrent: 2.5
    })).toMatchObject({ visibleAnswersBeforeCurrent: 2, visibleAnswersAfterCurrent: 1 });
  });

  it.each([
    [0, 0],
    [25, 25],
    [49.5, 50],
    [100, 100],
    [-10, 0],
    [120, 100]
  ])("normalizes heading scroll position %s to %s", (value, expected) => {
    expect(normalizeHeadingScrollPositionPercent(value)).toBe(expected);
  });

  it.each(["25", Number.NaN, Number.POSITIVE_INFINITY, null, undefined])(
    "falls back to 25 for invalid heading scroll position %s",
    (value) => {
      expect(normalizeHeadingScrollPositionPercent(value)).toBe(25);
    }
  );

  it("merges title wrapping and normalized heading position", () => {
    expect(
      mergeSettings(DEFAULT_SETTINGS, {
        wrapLongTitles: false,
        headingScrollPositionPercent: 87.6
      })
    ).toMatchObject({
      wrapLongTitles: false,
      headingScrollPositionPercent: 88
    });
  });

  it("normalizes interaction defaults before notifying subscribers", () => {
    const storage = installChromeStorage();
    const listener = vi.fn();
    const unsubscribe = subscribeSettings(listener);

    storage.emit({
      enabled: true,
      maxDepth: 2,
      expandCurrentOnly: true,
      maxVisibleRounds: 0
    });

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        hoverExpandEnabled: true,
        targetHighlightEnabled: true,
        targetHighlightDurationMs: 1500,
        wrapLongTitles: true,
        headingScrollPositionPercent: 25
      })
    );

    unsubscribe();
  });

  it("serializes rapid saves and keeps the newest setting last", async () => {
    const storage = installChromeStorage();
    let releaseFirst: (() => void) | undefined;
    storage.set.mockImplementationOnce(() => new Promise<void>((resolve) => {
      releaseFirst = resolve;
    }));
    const first = saveSettings(mergeSettings(DEFAULT_SETTINGS, { headingScrollPositionPercent: 0 }));
    const second = saveSettings(mergeSettings(DEFAULT_SETTINGS, { headingScrollPositionPercent: 50 }));
    await vi.waitFor(() => expect(storage.set).toHaveBeenCalledTimes(1));
    releaseFirst?.();
    await Promise.all([first, second]);
    expect(storage.set).toHaveBeenCalledTimes(2);
    expect((storage.set.mock.calls[1][0][SETTINGS_KEY] as typeof DEFAULT_SETTINGS).headingScrollPositionPercent).toBe(50);
  });
});
