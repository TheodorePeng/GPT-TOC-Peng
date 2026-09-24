import "./styles.css";
import {
  type HeadingDepth,
  type TargetHighlightDurationMs,
  type TocSettings,
  DEFAULT_SETTINGS,
  getSettings,
  mergeSettings,
  saveSettings,
  subscribeSettings
} from "../shared/settings";
import {
  readHeadingScrollPositionInput,
  syncHeadingScrollPositionControls
} from "./scroll-position-control";
import { createPopupMarkup } from "./view";

const app = document.getElementById("app");

let settings: TocSettings;
let savedSettings: TocSettings;
let saveStatus = "已保存";
let saveRevision = 0;
let saving = false;

const render = (): void => {
  if (!app) {
    return;
  }

  app.innerHTML = createPopupMarkup(settings);
  const status = app.querySelector<HTMLElement>("[data-settings-save-status]");
  if (status) {
    status.textContent = saveStatus;
    status.classList.toggle("is-error", saveStatus.includes("失败"));
  }
};

const updateSettings = async (patch: Partial<TocSettings>): Promise<void> => {
  settings = mergeSettings(settings, patch);
  const nextSettings = settings;
  const revision = ++saveRevision;
  saveStatus = "正在保存…";
  saving = true;
  render();
  try {
    await saveSettings(nextSettings);
    savedSettings = nextSettings;
    if (revision === saveRevision) {
      saveStatus = "已保存";
      saving = false;
      render();
    }
  } catch {
    if (revision === saveRevision) {
      settings = savedSettings;
      saveStatus = "保存失败，请重试";
      saving = false;
      render();
    }
  }
};

const init = async (): Promise<void> => {
  try {
    settings = await getSettings();
  } catch {
    settings = DEFAULT_SETTINGS;
    saveStatus = "读取设置失败，显示默认值";
  }
  savedSettings = settings;
  render();
  subscribeSettings((nextSettings) => {
    if (!saving) {
      settings = nextSettings;
      savedSettings = nextSettings;
      saveStatus = "已保存";
      render();
    }
  });

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
      const status = app.querySelector<HTMLElement>("[data-settings-save-status]");
      if (status) {
        status.textContent = "松开滑块后应用";
      }
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
