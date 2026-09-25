export type HeadingDepth = 1 | 2 | 3 | 4 | 5 | 6;

export type TargetHighlightDurationMs = number;

export type TocSettings = {
  enabled: boolean;
  maxDepth: HeadingDepth;
  expandCurrentOnly: boolean;
  visibleAnswersBeforeCurrent: number;
  visibleAnswersAfterCurrent: number;
  maxVisibleRounds: number;
  hoverExpandEnabled: boolean;
  targetHighlightEnabled: boolean;
  targetHighlightDurationMs: TargetHighlightDurationMs;
  panelSurfaceOpacityPercent: number | null;
  wrapLongTitles: boolean;
  headingScrollPositionPercent: number;
};

export const DEFAULT_SETTINGS: TocSettings = {
  enabled: true,
  maxDepth: 2,
  expandCurrentOnly: true,
  visibleAnswersBeforeCurrent: 2,
  visibleAnswersAfterCurrent: 1,
  maxVisibleRounds: 0,
  hoverExpandEnabled: true,
  targetHighlightEnabled: true,
  targetHighlightDurationMs: 1500,
  panelSurfaceOpacityPercent: null,
  wrapLongTitles: true,
  headingScrollPositionPercent: 25
};

const SETTINGS_KEY = "gptReaderSettings";
let saveQueue: Promise<void> = Promise.resolve();

type SettingsPatch = Partial<TocSettings>;

const isDepth = (value: unknown): value is HeadingDepth =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 1 &&
  value <= 6;

const isHighlightDuration = (value: unknown): value is TargetHighlightDurationMs =>
  typeof value === "number" && Number.isInteger(value) &&
  value >= 100 && value <= 10_000 && value % 10 === 0;

const isPanelSurfaceOpacity = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100;

const isNeighborCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 20;

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
    visibleAnswersBeforeCurrent: isNeighborCount(input.visibleAnswersBeforeCurrent)
      ? input.visibleAnswersBeforeCurrent : DEFAULT_SETTINGS.visibleAnswersBeforeCurrent,
    visibleAnswersAfterCurrent: isNeighborCount(input.visibleAnswersAfterCurrent)
      ? input.visibleAnswersAfterCurrent : DEFAULT_SETTINGS.visibleAnswersAfterCurrent,
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
    panelSurfaceOpacityPercent: isPanelSurfaceOpacity(input.panelSurfaceOpacityPercent)
      ? input.panelSurfaceOpacityPercent
      : null,
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

export const saveSettings = (settings: TocSettings): Promise<void> => {
  if (!canUseChromeStorage()) {
    return Promise.resolve();
  }

  const normalized = normalizeSettings(settings);
  const write = saveQueue.then(() => chrome.storage.sync.set({ [SETTINGS_KEY]: normalized }));
  saveQueue = write.catch(() => undefined);
  return write;
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
