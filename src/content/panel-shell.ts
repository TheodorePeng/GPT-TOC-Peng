import type { PanelExpandDirection } from "./panel-layout";

const svgAttributes = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';

const directionIcon = `
  <svg class="gpt-reader-direction-icon" ${svgAttributes}>
    <path d="M6 4v16"></path><path d="M5 12h14"></path><path d="m15 8 4 4-4 4"></path>
  </svg>`;

const settingsIcon = `
  <svg ${svgAttributes}>
    <path d="M4 7h10"></path><path d="M18 7h2"></path><circle cx="16" cy="7" r="2"></circle>
    <path d="M4 17h2"></path><path d="M10 17h10"></path><circle cx="8" cy="17" r="2"></circle>
  </svg>`;

const pinIcon = `
  <svg class="gpt-reader-pin-icon" ${svgAttributes}>
    <path d="m16 3 5 5-3 1-3 3v4l-2 2-7-7 2-2h4l3-3z"></path>
    <path d="m9 15-6 6"></path>
  </svg>`;

export const getAnswerChevronIcon = (expanded: boolean): string => `
  <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <path d="${expanded ? "m3 4.5 3 3 3-3" : "m4.5 3 3 3-3 3"}"></path>
  </svg>`;

export const createPanelShell = (): HTMLElement => {
  const root = document.createElement("aside");
  root.id = "gpt-reader-root";
  root.innerHTML = `
    <section class="gpt-reader-panel" aria-label="ChatGPT 回答目录">
      <header class="gpt-reader-header">
        <div class="gpt-reader-drag-region" data-gpt-reader-drag title="拖动目录" aria-hidden="true"></div>
        <div class="gpt-reader-header-actions">
          <button type="button" class="gpt-reader-icon-button" data-gpt-reader-direction aria-label="当前向右展开，点击改为向左展开">
            ${directionIcon}
          </button>
          <button type="button" class="gpt-reader-icon-button" data-gpt-reader-settings-toggle aria-label="打开快捷设置" aria-expanded="false" title="打开快捷设置">
            ${settingsIcon}
          </button>
          <button type="button" class="gpt-reader-icon-button gpt-reader-pin-button" data-gpt-reader-pin aria-label="取消固定并收起目录" aria-pressed="true" title="取消固定并收起目录">
            ${pinIcon}
          </button>
        </div>
      </header>
      <p class="gpt-reader-jump-status" data-gpt-reader-jump-status role="status" aria-live="polite" hidden></p>
      <form class="gpt-reader-settings" data-gpt-reader-settings hidden>
        <label class="gpt-reader-switch">
          <input type="checkbox" data-gpt-reader-enabled />
          <span>启用目录</span>
        </label>
        <label class="gpt-reader-field">
          <span>目录高度</span>
          <select data-gpt-reader-height-mode>
            <option value="fixed">固定高度</option>
            <option value="viewport">按窗口比例</option>
          </select>
        </label>
        <label class="gpt-reader-field" data-gpt-reader-height-percent-field hidden>
          <span>窗口高度比例</span>
          <span class="gpt-reader-percent-input"><input type="number" min="30" max="90" step="1" data-gpt-reader-height-percent /><span>%</span></span>
          <p>范围 30%–90%；窗口较小时会自动限制到可见范围。</p>
        </label>
        <div class="gpt-reader-field">
          <span>目录最大层级</span>
          <div class="gpt-reader-depths" data-gpt-reader-depths></div>
        </div>
        <label class="gpt-reader-switch">
          <input type="checkbox" data-gpt-reader-expand-current />
          <span>只展开当前回答</span>
        </label>
        <label class="gpt-reader-field">
          <span>保留最近问答轮数</span>
          <input type="number" min="0" max="50" step="1" data-gpt-reader-max-rounds />
          <p>0 表示不限制；长会话建议 3-5 轮。</p>
        </label>
        <label class="gpt-reader-switch">
          <input type="checkbox" data-gpt-reader-wrap-titles />
          <span>长标题自动换行</span>
        </label>
        <p>其他回答默认折叠，可点击回答标题展开。</p>
        <p>悬浮展开、跳转位置和正文高亮可在扩展图标弹窗中设置。</p>
        <p data-gpt-reader-panel-save-status role="status" aria-live="polite" hidden></p>
      </form>
      <div class="gpt-reader-body">
        <div class="gpt-reader-rail" aria-hidden="true">
          <span data-gpt-reader-active-dot></span>
        </div>
        <nav data-gpt-reader-list></nav>
      </div>
      <div class="gpt-reader-resize-handle" data-gpt-reader-resize title="拖拽调整目录宽度" aria-hidden="true"></div>
      <div class="gpt-reader-resize-height-handle" data-gpt-reader-resize-height title="拖拽调整目录高度" aria-hidden="true"></div>
    </section>
    <button
      type="button"
      class="gpt-reader-collapsed-rail"
      data-gpt-reader-collapsed-rail
      aria-label="展开 ChatGPT 回答目录"
      aria-expanded="false"
    >
      <span class="gpt-reader-collapsed-markers" data-gpt-reader-collapsed-markers aria-hidden="true"></span>
    </button>
  `;
  syncPanelDirectionControls(root, "right");
  return root;
};

export const syncPanelDirectionControls = (
  root: HTMLElement,
  direction: PanelExpandDirection
): void => {
  root.dataset.expandDirection = direction;
  const directionButton = root.querySelector<HTMLButtonElement>("[data-gpt-reader-direction]");
  const directionLabel =
    direction === "right"
      ? "当前向右展开，点击改为向左展开"
      : "当前向左展开，点击改为向右展开";

  if (directionButton) {
    directionButton.setAttribute("aria-label", directionLabel);
    directionButton.title = directionLabel;
  }
};

export const syncPanelTitleWrapping = (root: HTMLElement, enabled: boolean): void => {
  root.classList.toggle("is-title-wrap-enabled", enabled);
  const checkbox = root.querySelector<HTMLInputElement>("[data-gpt-reader-wrap-titles]");
  if (checkbox) {
    checkbox.checked = enabled;
  }
};
