import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  getSettings,
  mergeSettings,
  normalizeHeadingScrollPositionPercent,
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
  const set = vi.fn(async () => undefined);

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
      wrapLongTitles: true,
      headingScrollPositionPercent: 25
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
      headingScrollPositionPercent: 25
    });
  });

  it.each([800, 1500, 3000])("accepts the %i ms highlight duration", (duration) => {
    expect(
      mergeSettings(DEFAULT_SETTINGS, { targetHighlightDurationMs: duration } as never)
    ).toMatchObject({ targetHighlightDurationMs: duration });
  });

  it("normalizes invalid highlight durations to 1500 ms", () => {
    expect(
      mergeSettings(DEFAULT_SETTINGS, { targetHighlightDurationMs: 999 } as never)
    ).toMatchObject({ targetHighlightDurationMs: 1500 });
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
});
