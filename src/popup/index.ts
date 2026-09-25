import "./styles.css";
import {
  type HeadingDepth,
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
let activeTab: "toc" | "appearance" = "toc";

const showInputError = (message: string): void => {
  saveStatus = message;
  render();
};

const render = (): void => {
  if (!app) {
    return;
  }

  if (!app.querySelector(".popup-shell")) app.innerHTML = createPopupMarkup(settings);
  for (const tab of app.querySelectorAll<HTMLButtonElement>("[data-setting-tab]")) {
    const selected = tab.dataset.settingTab === activeTab;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  for (const panel of app.querySelectorAll<HTMLElement>("[data-setting-panel]")) {
    panel.hidden = panel.dataset.settingPanel !== activeTab;
  }
  const setChecked = (selector: string, checked: boolean): void => {
    const input = app.querySelector<HTMLInputElement>(selector);
    if (input) input.checked = checked;
  };
  const setValue = (selector: string, value: number): void => {
    const input = app.querySelector<HTMLInputElement>(selector);
    if (input && document.activeElement !== input) input.value = String(value);
  };
  setChecked("[data-setting-enabled]", settings.enabled);
  setChecked("[data-setting-expand-current]", settings.expandCurrentOnly);
  setChecked("[data-setting-wrap-titles]", settings.wrapLongTitles);
  setChecked("[data-setting-hover-expand]", settings.hoverExpandEnabled);
  setChecked("[data-setting-target-highlight]", settings.targetHighlightEnabled);
  setValue("[data-setting-max-rounds]", settings.maxVisibleRounds);
  setValue("[data-setting-before-count]", settings.visibleAnswersBeforeCurrent);
  setValue("[data-setting-after-count]", settings.visibleAnswersAfterCurrent);
  setValue("[data-setting-highlight-duration]", settings.targetHighlightDurationMs / 1000);
  setValue("[data-setting-opacity-range]", settings.panelSurfaceOpacityPercent ?? 92);
  setValue("[data-setting-opacity-number]", settings.panelSurfaceOpacityPercent ?? 92);
  setValue("[data-setting-scroll-position-range]", settings.headingScrollPositionPercent);
  setValue("[data-setting-scroll-position-number]", settings.headingScrollPositionPercent);
  for (const depth of app.querySelectorAll<HTMLButtonElement>("[data-setting-depth]")) {
    depth.classList.toggle("is-active", Number(depth.dataset.settingDepth) === settings.maxDepth);
  }
  const duration = app.querySelector<HTMLInputElement>("[data-setting-highlight-duration]");
  if (duration) duration.disabled = !settings.targetHighlightEnabled;
  const opacityReset = app.querySelector<HTMLButtonElement>("[data-setting-opacity-reset]");
  if (opacityReset) opacityReset.disabled = settings.panelSurfaceOpacityPercent === null;
  const opacityLabel = app.querySelector<HTMLElement>(".opacity-default-row small");
  if (opacityLabel) opacityLabel.textContent = settings.panelSurfaceOpacityPercent === null
    ? "跟随主题：浅色 92%、深色 94%"
    : `自定义：${settings.panelSurfaceOpacityPercent}%`;
  const scrollRange = app.querySelector<HTMLInputElement>("[data-setting-scroll-position-range]");
  scrollRange?.setAttribute("aria-valuetext", `${settings.headingScrollPositionPercent}%`);
  const scrollOutput = app.querySelector<HTMLOutputElement>("[data-setting-scroll-position-output]");
  if (scrollOutput) {
    scrollOutput.value = `${settings.headingScrollPositionPercent}%`;
    scrollOutput.textContent = `${settings.headingScrollPositionPercent}%`;
  }
  const footer = app.querySelector<HTMLElement>("footer > span:nth-child(2)");
  if (footer) footer.textContent = settings.enabled ? "已在 ChatGPT 页面启用" : "目录已关闭";
  const status = app.querySelector<HTMLElement>("[data-settings-save-status]");
  if (status) {
    status.textContent = saveStatus;
    status.classList.toggle("is-error", saveStatus.includes("失败") || saveStatus.includes("无效"));
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
    const tab = target.closest<HTMLButtonElement>("[data-setting-tab]");
    if (tab?.dataset.settingTab === "toc" || tab?.dataset.settingTab === "appearance") {
      activeTab = tab.dataset.settingTab;
      render();
      document.body.scrollTop = 0;
      return;
    }
    if (target.closest("[data-setting-opacity-reset]")) {
      void updateSettings({ panelSurfaceOpacityPercent: null });
      return;
    }
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
    if (target.matches("[data-setting-opacity-range]")) {
      const number = app?.querySelector<HTMLInputElement>("[data-setting-opacity-number]");
      if (number) number.value = target.value;
    }
  });

  app?.addEventListener("focusout", (event) => {
    if ((event.target as HTMLElement).matches("input[type='number'], input[type='range']")) {
      queueMicrotask(render);
    }
  });

  app?.addEventListener("keydown", (event) => {
    const target = event.target as HTMLInputElement;
    if (target.matches("[data-setting-tab]") &&
      ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      activeTab = event.key === "Home" ? "toc" : event.key === "End" ? "appearance"
        : activeTab === "toc" ? "appearance" : "toc";
      render();
      app.querySelector<HTMLButtonElement>(`[data-setting-tab="${activeTab}"]`)
        ?.focus({ preventScroll: true });
      document.body.scrollTop = 0;
      return;
    }
    if (event.key === "Enter" && target.matches("[data-setting-scroll-position-number], [data-setting-opacity-number], [data-setting-highlight-duration]")) {
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

    if (target.matches("[data-setting-before-count], [data-setting-after-count]")) {
      const value = Number(target.value);
      if (target.value.trim() === "" || !Number.isInteger(value) || value < 0 || value > 20) {
        showInputError("显示数量无效：请输入 0–20 的整数");
      } else {
        void updateSettings(target.matches("[data-setting-before-count]")
          ? { visibleAnswersBeforeCurrent: value } : { visibleAnswersAfterCurrent: value });
      }
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
      const seconds = Number(target.value);
      const duration = Math.round(seconds * 1000);
      if (target.value.trim() === "" || !Number.isFinite(seconds) || duration < 100 || duration > 10000 || Math.abs(seconds * 1000 - duration) > 0.001 || duration % 10 !== 0) {
        showInputError("高亮时长无效：请输入 0.10–10.00 秒");
      } else {
        void updateSettings({ targetHighlightDurationMs: duration });
      }
    }

    if (target.matches("[data-setting-opacity-range], [data-setting-opacity-number]")) {
      const value = Number(target.value);
      if (target.value.trim() === "" || !Number.isInteger(value) || value < 0 || value > 100) {
        showInputError("不透明度无效：请输入 0–100%");
      } else {
        void updateSettings({ panelSurfaceOpacityPercent: value });
      }
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
