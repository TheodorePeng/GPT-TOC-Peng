import {
  type TargetHighlightDurationMs,
  type TocSettings,
  headingDepths
} from "../shared/settings";

export const createPopupMarkup = (settings: TocSettings): string => `
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
        <input type="checkbox" data-setting-expand-current ${
          settings.expandCurrentOnly ? "checked" : ""
        } />
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

      <label class="check-row">
        <span>
          <strong>长标题自动换行</strong>
          <small>一行放不下时显示完整标题，不使用省略号。</small>
        </span>
        <input type="checkbox" data-setting-wrap-titles ${
          settings.wrapLongTitles ? "checked" : ""
        } />
      </label>
    </section>

    <section class="panel" aria-labelledby="toc-interaction-settings">
      <h2 class="section-title" id="toc-interaction-settings">交互与高亮</h2>
      <label class="check-row">
        <span>
          <strong>悬浮竖条自动展开</strong>
          <small>悬浮折叠轨道时临时预览完整目录。</small>
        </span>
        <input type="checkbox" data-setting-hover-expand ${
          settings.hoverExpandEnabled ? "checked" : ""
        } />
      </label>

      <div class="field scroll-position-field">
        <div>
          <strong id="heading-scroll-position-label">标题跳转位置</strong>
          <small>0% 顶部（原行为） · 50% 居中 · 100% 底部</small>
        </div>
        <div class="scroll-position-controls">
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value="${settings.headingScrollPositionPercent}"
            data-setting-scroll-position-range
            aria-labelledby="heading-scroll-position-label"
            aria-valuetext="${settings.headingScrollPositionPercent}%"
          />
          <div class="scroll-position-number">
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value="${settings.headingScrollPositionPercent}"
              data-setting-scroll-position-number
              aria-label="标题跳转位置百分比"
            />
            <span aria-hidden="true">%</span>
          </div>
          <output data-setting-scroll-position-output aria-live="polite">${
            settings.headingScrollPositionPercent
          }%</output>
        </div>
        <small>页面首尾空间不足时，实际位置可能受滚动边界限制。</small>
      </div>

      <label class="check-row">
        <span>
          <strong>点击定位后高亮正文标题</strong>
          <small>跳转后短暂标出目标标题，便于确认位置。</small>
        </span>
        <input type="checkbox" data-setting-target-highlight ${
          settings.targetHighlightEnabled ? "checked" : ""
        } />
      </label>

      <label class="field">
        <div>
          <strong>高亮持续时间</strong>
          <small>关闭正文高亮后此选项不可用。</small>
        </div>
        <select data-setting-highlight-duration ${
          settings.targetHighlightEnabled ? "" : "disabled"
        }>
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
      <span class="save-status" data-settings-save-status role="status" aria-live="polite">已保存</span>
    </footer>
  </section>
`;
