import { type TocSettings, headingDepths } from "../shared/settings";

export const createPopupMarkup = (settings: TocSettings): string => `
  <section class="popup-shell">
    <header>
      <div>
        <p>GPT TOC Peng</p>
        <h1>回答目录设置</h1>
      </div>
      <label class="switch" title="启用目录">
        <input type="checkbox" data-setting-enabled ${settings.enabled ? "checked" : ""} />
        <span></span>
      </label>
    </header>

    <div class="popup-tabs" role="tablist" aria-label="设置分类">
      <button type="button" role="tab" id="popup-tab-toc" aria-controls="popup-panel-toc" aria-selected="true" tabindex="0" data-setting-tab="toc">目录</button>
      <button type="button" role="tab" id="popup-tab-appearance" aria-controls="popup-panel-appearance" aria-selected="false" tabindex="-1" data-setting-tab="appearance">外观与跳转</button>
    </div>
    <div class="popup-tab-panel" role="tabpanel" id="popup-panel-toc" aria-labelledby="popup-tab-toc" data-setting-panel="toc">
    <section class="panel" aria-label="目录内容">
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

      <div class="field">
        <div>
          <strong>当前回答上下显示数量</strong>
          <small>分别显示有标题的回答；0 表示该侧不显示邻居。仅影响目录。</small>
        </div>
        <div class="neighbor-counts">
          <label>上方 <input type="number" min="0" max="20" step="1" data-setting-before-count value="${settings.visibleAnswersBeforeCurrent}" /></label>
          <label>下方 <input type="number" min="0" max="20" step="1" data-setting-after-count value="${settings.visibleAnswersAfterCurrent}" /></label>
        </div>
      </div>

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

    <details class="panel advanced-panel">
      <summary>高级设置</summary>
      <label class="field">
        <div>
          <strong>限制正文历史轮次</strong>
          <small>会隐藏 ChatGPT 正文中的旧轮次；0 表示不限制。</small>
        </div>
        <input type="number" min="0" max="50" step="1" data-setting-max-rounds value="${settings.maxVisibleRounds}" />
      </label>
    </details>
    </div>

    <div class="popup-tab-panel" role="tabpanel" id="popup-panel-appearance" aria-labelledby="popup-tab-appearance" data-setting-panel="appearance" hidden>
    <section class="panel" aria-label="外观与跳转">
      <div class="field opacity-field">
        <div>
          <strong>内容背景不透明度</strong>
          <small>包括当前回答的绿色背景；文字与定位色条保持清晰。</small>
        </div>
        <div class="opacity-controls">
          <input type="range" min="0" max="100" step="1" value="${settings.panelSurfaceOpacityPercent ?? 92}" data-setting-opacity-range aria-label="内容背景不透明度" />
          <span class="opacity-number"><input type="number" min="0" max="100" step="1" value="${settings.panelSurfaceOpacityPercent ?? 92}" data-setting-opacity-number aria-label="内容背景不透明度百分比" /><span aria-hidden="true">%</span></span>
        </div>
        <div class="opacity-default-row">
          <small>${settings.panelSurfaceOpacityPercent === null ? "跟随主题：浅色 92%、深色 94%" : `自定义：${settings.panelSurfaceOpacityPercent}%`}</small>
          <button type="button" data-setting-opacity-reset ${settings.panelSurfaceOpacityPercent === null ? "disabled" : ""}>恢复主题默认</button>
        </div>
      </div>
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
          <strong>点击跳转后高亮目标</strong>
          <small>适用于目录标题与问答块中的提问。</small>
        </span>
        <input type="checkbox" data-setting-target-highlight ${
          settings.targetHighlightEnabled ? "checked" : ""
        } />
      </label>

      <div class="field">
        <div>
          <strong>高亮持续时间</strong>
          <small>可输入 0.10–10.00 秒，精确到 0.01 秒。</small>
        </div>
        <div class="duration-controls">
          <span class="duration-number"><input type="number" min="0.1" max="10" step="0.01" value="${settings.targetHighlightDurationMs / 1000}" data-setting-highlight-duration aria-label="高亮持续秒数" ${settings.targetHighlightEnabled ? "" : "disabled"} /><span aria-hidden="true">秒</span></span>
        </div>
      </div>
    </section>
    </div>

    <footer>
      <span class="status-dot"></span>
      <span>${settings.enabled ? "已在 ChatGPT 页面启用" : "目录已关闭"}</span>
      <span class="save-status" data-settings-save-status role="status" aria-live="polite">已保存</span>
    </footer>
  </section>
`;
