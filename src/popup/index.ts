import "./styles.css";
import {
  type HeadingDepth,
  type TargetHighlightDurationMs,
  type TocSettings,
  getSettings,
  mergeSettings,
  saveSettings
} from "../shared/settings";
import {
  readHeadingScrollPositionInput,
  syncHeadingScrollPositionControls
} from "./scroll-position-control";
import { createPopupMarkup } from "./view";

const app = document.getElementById("app");

let settings: TocSettings;

const render = (): void => {
  if (!app) {
    return;
  }

  app.innerHTML = createPopupMarkup(settings);
};

const updateSettings = async (patch: Partial<TocSettings>): Promise<void> => {
  settings = mergeSettings(settings, patch);
  render();
  await saveSettings(settings);
};

const init = async (): Promise<void> => {
  settings = await getSettings();
  render();

  app?.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const depthButton = target.closest<HTMLButtonElement>("[data-setting-depth]");
    if (!depthButton) {
      return;
    }

    void updateSettings({
      maxDepth: Number(depthButton.dataset.settingDepth) as HeadingDepth
    });
  });

  app?.addEventListener("input", (event) => {
    const target = event.target as HTMLInputElement;
    if (target.matches("[data-setting-scroll-position-range]")) {
      syncHeadingScrollPositionControls(app, Number(target.value));
    }
  });

  app?.addEventListener("keydown", (event) => {
    const target = event.target as HTMLInputElement;
    if (event.key === "Enter" && target.matches("[data-setting-scroll-position-number]")) {
      event.preventDefault();
      target.blur();
    }
  });

  app?.addEventListener("change", (event) => {
    const target = event.target as HTMLInputElement;

    if (target.matches("[data-setting-enabled]")) {
      void updateSettings({ enabled: target.checked });
    }

    if (target.matches("[data-setting-expand-current]")) {
      void updateSettings({ expandCurrentOnly: target.checked });
    }

    if (target.matches("[data-setting-max-rounds]")) {
      const nextValue = Math.min(50, Math.max(0, Math.trunc(Number(target.value) || 0)));
      void updateSettings({ maxVisibleRounds: nextValue });
    }

    if (target.matches("[data-setting-wrap-titles]")) {
      void updateSettings({ wrapLongTitles: target.checked });
    }

    if (target.matches("[data-setting-hover-expand]")) {
      void updateSettings({ hoverExpandEnabled: target.checked });
    }

    if (target.matches("[data-setting-target-highlight]")) {
      void updateSettings({ targetHighlightEnabled: target.checked });
    }

    if (target.matches("[data-setting-highlight-duration]")) {
      void updateSettings({
        targetHighlightDurationMs: Number(target.value) as TargetHighlightDurationMs
      });
    }

    if (target.matches("[data-setting-scroll-position-range]")) {
      void updateSettings({ headingScrollPositionPercent: Number(target.value) });
    }

    if (target.matches("[data-setting-scroll-position-number]")) {
      const nextValue = readHeadingScrollPositionInput(
        target.value,
        settings.headingScrollPositionPercent
      );
      syncHeadingScrollPositionControls(app, nextValue);
      void updateSettings({ headingScrollPositionPercent: nextValue });
    }
  });
};

void init();
