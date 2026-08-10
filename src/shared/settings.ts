export type HeadingDepth = 1 | 2 | 3 | 4 | 5 | 6;

export type TargetHighlightDurationMs = 800 | 1500 | 3000;

export type TocSettings = {
  enabled: boolean;
  maxDepth: HeadingDepth;
  expandCurrentOnly: boolean;
  maxVisibleRounds: number;
  hoverExpandEnabled: boolean;
  targetHighlightEnabled: boolean;
  targetHighlightDurationMs: TargetHighlightDurationMs;
  wrapLongTitles: boolean;
  headingScrollPositionPercent: number;
};

export const DEFAULT_SETTINGS: TocSettings = {
  enabled: true,
  maxDepth: 2,
  expandCurrentOnly: true,
  maxVisibleRounds: 0,
  hoverExpandEnabled: true,
  targetHighlightEnabled: true,
  targetHighlightDurationMs: 1500,
  wrapLongTitles: true,
  headingScrollPositionPercent: 25
};

const SETTINGS_KEY = "gptReaderSettings";

type SettingsPatch = Partial<TocSettings>;

const isDepth = (value: unknown): value is HeadingDepth =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 1 &&
  value <= 6;

const isHighlightDuration = (value: unknown): value is TargetHighlightDurationMs =>
  value === 800 || value === 1500 || value === 3000;

export const normalizeHeadingScrollPositionPercent = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_SETTINGS.headingScrollPositionPercent;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
};

const normalizeSettings = (value: unknown): TocSettings => {
  const input = typeof value === "object" && value !== null ? (value as SettingsPatch) : {};
  const maxVisibleRounds =
    typeof input.maxVisibleRounds === "number" &&
    Number.isInteger(input.maxVisibleRounds) &&
    input.maxVisibleRounds >= 0 &&
    input.maxVisibleRounds <= 50
      ? input.maxVisibleRounds
      : DEFAULT_SETTINGS.maxVisibleRounds;

  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : DEFAULT_SETTINGS.enabled,
    maxDepth: isDepth(input.maxDepth) ? input.maxDepth : DEFAULT_SETTINGS.maxDepth,
    expandCurrentOnly:
      typeof input.expandCurrentOnly === "boolean"
        ? input.expandCurrentOnly
        : DEFAULT_SETTINGS.expandCurrentOnly,
    maxVisibleRounds,
    hoverExpandEnabled:
      typeof input.hoverExpandEnabled === "boolean"
        ? input.hoverExpandEnabled
        : DEFAULT_SETTINGS.hoverExpandEnabled,
    targetHighlightEnabled:
      typeof input.targetHighlightEnabled === "boolean"
        ? input.targetHighlightEnabled
        : DEFAULT_SETTINGS.targetHighlightEnabled,
    targetHighlightDurationMs: isHighlightDuration(input.targetHighlightDurationMs)
      ? input.targetHighlightDurationMs
      : DEFAULT_SETTINGS.targetHighlightDurationMs,
    wrapLongTitles:
      typeof input.wrapLongTitles === "boolean"
        ? input.wrapLongTitles
        : DEFAULT_SETTINGS.wrapLongTitles,
    headingScrollPositionPercent: normalizeHeadingScrollPositionPercent(
      input.headingScrollPositionPercent
    )
  };
};

const canUseChromeStorage = (): boolean =>
  typeof chrome !== "undefined" &&
  Boolean(chrome.storage?.sync?.get) &&
  Boolean(chrome.storage?.sync?.set);

export const getSettings = async (): Promise<TocSettings> => {
  if (!canUseChromeStorage()) {
    return DEFAULT_SETTINGS;
  }

  const stored = await chrome.storage.sync.get(SETTINGS_KEY);
  return normalizeSettings(stored[SETTINGS_KEY]);
};

export const saveSettings = async (settings: TocSettings): Promise<void> => {
  if (!canUseChromeStorage()) {
    return;
  }

  await chrome.storage.sync.set({
    [SETTINGS_KEY]: normalizeSettings(settings)
  });
};

export const mergeSettings = (current: TocSettings, patch: SettingsPatch): TocSettings =>
  normalizeSettings({
    ...current,
    ...patch
  });

export const subscribeSettings = (listener: (settings: TocSettings) => void): (() => void) => {
  if (typeof chrome === "undefined" || !chrome.storage?.onChanged) {
    return () => undefined;
  }

  const handleChange = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string
  ): void => {
    if (areaName !== "sync" || !changes[SETTINGS_KEY]) {
      return;
    }

    listener(normalizeSettings(changes[SETTINGS_KEY].newValue));
  };

  chrome.storage.onChanged.addListener(handleChange);
  return () => chrome.storage.onChanged.removeListener(handleChange);
};

export const headingDepths: HeadingDepth[] = [1, 2, 3, 4, 5, 6];
