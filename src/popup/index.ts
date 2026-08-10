import "./styles.css";
import {
  type HeadingDepth,
  type TargetHighlightDurationMs,
  type TocSettings,
  headingDepths,
  getSettings,
  mergeSettings,
  saveSettings
} from "../shared/settings";

const app = document.getElementById("app");

let settings: TocSettings;

const render = (): void => {
  if (!app) {
    return;
  }

  app.innerHTML = `
    <section class="popup-shell">
      <header>
        <div>
          <p>GPT TOC Peng</p>
          <h1>ChatGPT 回答目录设置</h1>
        </div>
        <label class="switch" title="启用目录">
          <input type="checkbox" data-setting-enabled ${settings.enabled ? "checked" : ""} />
          <span></span>
        </label>
      </header>

      <section class="panel" aria-labelledby="toc-content-settings">
        <h2 class="section-title" id="toc-content-settings">目录内容</h2>
        <div class="field">
          <div>
            <strong>目录最大层级</strong>
            <small>控制当前回答最多展开到几级标题。</small>
          </div>
          <div class="depth-grid">
            ${headingDepths
              .map(
                (depth) => `
                  <button
                    type="button"
                    data-setting-depth="${depth}"
                    class="${depth === settings.maxDepth ? "is-active" : ""}"
                  >
                    ${depth}
                  </button>
                `
              )
              .join("")}
          </div>
        </div>

        <label class="check-row">
          <span>
            <strong>只展开当前回答</strong>
            <small>其他回答仅显示第一层标题，避免目录过长。</small>
          </span>
          <input
            type="checkbox"
            data-setting-expand-current
            ${settings.expandCurrentOnly ? "checked" : ""}
          />
        </label>

        <label class="field">
          <div>
            <strong>保留最近问答轮数</strong>
            <small>0 表示不限制；长会话建议 3-5 轮。</small>
          </div>
          <input
            type="number"
            min="0"
            max="50"
            step="1"
            data-setting-max-rounds
            value="${settings.maxVisibleRounds}"
          />
        </label>
      </section>

      <section class="panel" aria-labelledby="toc-interaction-settings">
        <h2 class="section-title" id="toc-interaction-settings">交互与高亮</h2>
        <label class="check-row">
          <span>
            <strong>悬浮竖条自动展开</strong>
            <small>悬浮折叠轨道时临时预览完整目录。</small>
          </span>
          <input
            type="checkbox"
            data-setting-hover-expand
            ${settings.hoverExpandEnabled ? "checked" : ""}
          />
        </label>

        <label class="check-row">
          <span>
            <strong>点击定位后高亮正文标题</strong>
            <small>跳转后短暂标出目标标题，便于确认位置。</small>
          </span>
          <input
            type="checkbox"
            data-setting-target-highlight
            ${settings.targetHighlightEnabled ? "checked" : ""}
          />
        </label>

        <label class="field">
          <div>
            <strong>高亮持续时间</strong>
            <small>关闭正文高亮后此选项不可用。</small>
          </div>
          <select
            data-setting-highlight-duration
            ${settings.targetHighlightEnabled ? "" : "disabled"}
          >
            ${([800, 1500, 3000] as TargetHighlightDurationMs[])
              .map(
                (duration) => `
                  <option value="${duration}" ${
                    duration === settings.targetHighlightDurationMs ? "selected" : ""
                  }>
                    ${duration / 1000} 秒
                  </option>
                `
              )
              .join("")}
          </select>
        </label>
      </section>

      <footer>
        <span class="status-dot"></span>
        <span>${settings.enabled ? "已在 ChatGPT 页面启用" : "目录已关闭"}</span>
      </footer>
    </section>
  `;
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
  });
};

void init();
