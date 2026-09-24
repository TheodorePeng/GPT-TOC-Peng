import "./styles.css";
import {
  type AnswerOutline,
  type HeadingInfo,
  ensureAnswerId,
  extractAnswerOutlines,
  flattenHeadings,
  getVisibleHeadingsForAnswer,
  headingSelector,
  isVisibleHeading
} from "../shared/headings";
import {
  DEFAULT_SETTINGS,
  type HeadingDepth,
  type TocSettings,
  headingDepths,
  getSettings,
  mergeSettings,
  saveSettings,
  subscribeSettings
} from "../shared/settings";
import { findNearestVerticalScrollContainer, scrollHeadingToPercent } from "../shared/heading-scroll";
import { HeadingHighlighter } from "./highlighter";
import {
  DEFAULT_HEIGHT_PERCENT,
  getRenderedPanelLayout,
  getResizedPanelWidth,
  getViewportPanelLayout,
  normalizeCenterRatio,
  normalizeHeightPercent,
  normalizePanelPosition,
  normalizePanelExpandDirection,
  type PanelExpandDirection,
  type PanelHeightMode,
  type PanelPosition
} from "./panel-layout";
import {
  PanelDisclosureController,
  type PanelMode,
  type PanelPresentation
} from "./panel-state";
import {
  createPanelShell,
  getAnswerChevronIcon,
  syncPanelDirectionControls,
  syncPanelTitleWrapping
} from "./panel-shell";
import { getRailMarkers } from "./rail";
import {
  answerSnapshotsChanged,
  findAnswerAtAnchor,
  findHeadingAtAnchor,
  nextTocScrollTop,
  snapshotAnswers,
  type AnswerSnapshot
} from "./outline-tracking";

const ROOT_ID = "gpt-reader-root";
const ASSISTANT_SELECTOR = "[data-message-author-role='assistant']";
const MESSAGE_SELECTOR =
  "[data-message-author-role='user'],[data-message-author-role='assistant']";
const TURN_SELECTOR = "[data-testid^='conversation-turn-']";
const HIDDEN_ROUND_ATTR = "data-gpt-reader-hidden-round";
const ROUND_LIMIT_BANNER_ID = "gpt-reader-round-limit-banner";
const WIDTH_STORAGE_KEY = "gptReaderPanelWidth";
const POSITION_STORAGE_KEY = "gptReaderPanelPosition";
const HEIGHT_STORAGE_KEY = "gptReaderPanelHeight";
const UI_STORAGE_KEY = "gptReaderUiState";
const DEFAULT_PANEL_WIDTH = 296;
const MIN_PANEL_WIDTH = 260;
const MAX_PANEL_WIDTH = 440;
const COLLAPSED_RAIL_WIDTH = 32;
const PANEL_EDGE_MARGIN = 8;
const DEFAULT_PANEL_HEIGHT = 680;
const MIN_PANEL_HEIGHT = 320;
const SCAN_DEBOUNCE_MS = 120;
const SCAN_MAX_WAIT_MS = 1000;
const ACTIVE_ANCHOR_RATIO = 0.48;
const SCROLL_INTEGRITY_CHECK_MS = 180;
const SCROLL_VISIBILITY_CHECK_MS = 1500;
const POST_SCROLL_CHECK_MS = 450;

type PanelUiState = {
  width?: number;
  height?: number;
  heightMode?: PanelHeightMode;
  heightPercent?: number;
  centerYRatio?: number;
  position?: PanelPosition | null;
  mode?: PanelMode;
  expandDirection?: PanelExpandDirection;
};

type ConversationRound = {
  containers: HTMLElement[];
};

type CachedAnswer = {
  outline: AnswerOutline;
  container: HTMLElement;
  sequence: number;
};

const escapeText = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return entities[char];
  });

class ChatGptReader {
  private root: HTMLElement | null = null;
  private list: HTMLElement | null = null;
  private activeDot: HTMLElement | null = null;
  private collapsedRailMarkers: HTMLElement | null = null;
  private settings: TocSettings = DEFAULT_SETTINGS;
  private savedSettings: TocSettings = DEFAULT_SETTINGS;
  private outlines: AnswerOutline[] = [];
  private displayOutlines: AnswerOutline[] = [];
  private cachedAnswers = new Map<string, CachedAnswer>();
  private nextCachedAnswerSequence = 0;
  private cachedConversationPath = location.pathname;
  private answerSnapshots: AnswerSnapshot[] = [];
  private allHeadings: HeadingInfo[] = [];
  private hiddenRoundContainers = new Set<HTMLElement>();
  private pageScrollContainers = new Set<HTMLElement>();
  private expandedAnswerIds = new Set<string>();
  private collapsedAnswerIds = new Set<string>();
  private currentHeadingId: string | null = null;
  private currentAnswerId: string | null = null;
  private mutationObserver: MutationObserver | null = null;
  private scanTimer: number | null = null;
  private scanMaxTimer: number | null = null;
  private activeFrame: number | null = null;
  private postScrollTimer: number | null = null;
  private lastIntegrityCheck = -Infinity;
  private lastVisibilityCheck = -Infinity;
  private clickedHeading: { id: string; answerId: string; text: string } | null = null;
  private jumpGeneration = 0;
  private manualListBrowsing = false;
  private panelWidth = DEFAULT_PANEL_WIDTH;
  private panelHeight = DEFAULT_PANEL_HEIGHT;
  private heightMode: PanelHeightMode = "viewport";
  private heightPercent = DEFAULT_HEIGHT_PERCENT;
  private centerYRatio = 0.5;
  private panelPosition: PanelPosition | null = null;
  private resizeStartX = 0;
  private resizeStartWidth = DEFAULT_PANEL_WIDTH;
  private resizeStartY = 0;
  private resizeStartHeight = DEFAULT_PANEL_HEIGHT;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartLeft = 0;
  private dragStartTop = 0;
  private isResizing = false;
  private isResizingHeight = false;
  private isDragging = false;
  private panelMode: PanelMode = "expanded";
  private panelExpandDirection: PanelExpandDirection = "right";
  private panelDisclosure: PanelDisclosureController | null = null;
  private readonly headingHighlighter = new HeadingHighlighter();
  private unsubscribeSettings: (() => void) | null = null;
  private settingsRevision = 0;
  private pendingSettingsSaves = 0;
  private panelUiSaveQueue: Promise<void> = Promise.resolve();

  async init(): Promise<void> {
    try {
      this.settings = await getSettings();
    } catch {
      this.settings = DEFAULT_SETTINGS;
    }
    this.savedSettings = this.settings;
    await this.loadPanelUiState();
    this.panelDisclosure = new PanelDisclosureController({
      mode: this.panelMode,
      hoverEnabled: this.settings.hoverExpandEnabled,
      onModeChange: (mode) => {
        this.panelMode = mode;
        void this.savePanelUiState();
      },
      onPresentationChange: () => this.applyPanelPresentation()
    });
    this.ensureShell();
    this.bindEvents();
    this.render();
    this.scan();
    this.observePage();
    this.observeSettings();
    window.addEventListener("scroll", this.handlePageScroll, { passive: true });
    window.addEventListener("resize", this.handleWindowResize, { passive: true });
    document.addEventListener("scroll", this.handleDocumentScroll, {
      passive: true,
      capture: true
    });
    document.addEventListener("wheel", this.handleUserPageNavigation, { passive: true, capture: true });
    document.addEventListener("touchstart", this.handleUserPageNavigation, { passive: true, capture: true });
    document.addEventListener("pointerdown", this.handleUserPageNavigation, { passive: true, capture: true });
    document.addEventListener("keydown", this.handleUserPageNavigation, { capture: true });
  }

  private ensureShell(): void {
    const existing = document.getElementById(ROOT_ID);
    if (existing?.querySelector("[data-gpt-reader-direction]")) {
      this.root = existing;
      this.list = existing.querySelector<HTMLElement>("[data-gpt-reader-list]");
      this.activeDot = existing.querySelector<HTMLElement>("[data-gpt-reader-active-dot]");
      this.collapsedRailMarkers = existing.querySelector<HTMLElement>(
        "[data-gpt-reader-collapsed-markers]"
      );
      this.applyPanelWidth();
      this.applyPanelHeight();
      this.applyPanelDirection();
      this.applyPanelPosition();
      this.applyPanelPresentation();
      this.syncPanelHeightControls();
      return;
    }

    existing?.remove();
    const root = createPanelShell();

    document.body.append(root);
    this.root = root;
    this.list = root.querySelector<HTMLElement>("[data-gpt-reader-list]");
    this.activeDot = root.querySelector<HTMLElement>("[data-gpt-reader-active-dot]");
    this.collapsedRailMarkers = root.querySelector<HTMLElement>(
      "[data-gpt-reader-collapsed-markers]"
    );
    this.applyPanelWidth();
    this.applyPanelHeight();
    this.applyPanelDirection();
    this.applyPanelPosition();
    this.applyPanelPresentation();
    this.syncPanelHeightControls();
  }

  private bindEvents(): void {
    this.root?.addEventListener("submit", (event) => {
      if (event.target instanceof HTMLElement && event.target.matches("[data-gpt-reader-settings]")) {
        event.preventDefault();
      }
    });
    this.list?.addEventListener("scroll", () => this.positionActiveDot(), { passive: true });
    this.list?.addEventListener("wheel", () => { this.manualListBrowsing = true; }, { passive: true });
    this.list?.addEventListener("touchstart", () => { this.manualListBrowsing = true; }, { passive: true });
    this.list?.addEventListener("pointerdown", (event) => {
      if (event.target === this.list) {
        this.manualListBrowsing = true;
      }
    }, { passive: true });

    this.root?.addEventListener("pointerenter", () => this.panelDisclosure?.pointerEnter());
    this.root?.addEventListener("pointerleave", () => this.panelDisclosure?.pointerLeave());
    this.root?.addEventListener("focusin", () => this.panelDisclosure?.focusEnter());
    this.root?.addEventListener("focusout", (event) => {
      if (!(event.relatedTarget instanceof Node) || !this.root?.contains(event.relatedTarget)) {
        this.panelDisclosure?.focusLeave();
      }
    });
    this.root?.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || this.panelDisclosure?.presentation !== "peek") {
        return;
      }
      event.preventDefault();
      this.root
        ?.querySelector<HTMLButtonElement>("[data-gpt-reader-collapsed-rail]")
        ?.focus({ preventScroll: true });
      this.panelDisclosure.escape();
    });

    this.root?.addEventListener("pointerdown", (event) => {
      const target = event.target as HTMLElement;
      if (target.closest("[data-gpt-reader-collapsed-rail]")) {
        this.panelDisclosure?.setMode("expanded");
        return;
      }

      if (target.closest("[data-gpt-reader-resize]")) {
        this.startResize(event);
        return;
      }

      if (target.closest("[data-gpt-reader-resize-height]")) {
        this.startHeightResize(event);
        return;
      }

      if (
        target.closest("[data-gpt-reader-drag]") &&
        !target.closest("button, input, label")
      ) {
        this.startDrag(event);
      }
    });

    this.root?.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const headingButton = target.closest<HTMLButtonElement>("[data-gpt-reader-heading]");
      const depthButton = target.closest<HTMLButtonElement>("[data-gpt-reader-depth]");
      const answerToggle = target.closest<HTMLButtonElement>("[data-gpt-reader-answer-toggle]");

      if (headingButton) {
        this.scrollToHeading(
          headingButton.dataset.gptReaderHeading,
          headingButton.dataset.gptReaderAnswerId
        );
        return;
      }

      if (answerToggle) {
        this.toggleAnswer(answerToggle.dataset.gptReaderAnswerId);
        return;
      }

      if (depthButton) {
        const depth = Number(depthButton.dataset.gptReaderDepth) as HeadingDepth;
        void this.updateSettings({ maxDepth: depth });
        return;
      }

      if (target.closest("[data-gpt-reader-settings-toggle]")) {
        this.toggleSettings();
        return;
      }

      if (target.closest("[data-gpt-reader-direction]")) {
        this.togglePanelExpandDirection();
        return;
      }

      if (target.closest("[data-gpt-reader-pin]")) {
        const nextMode = this.panelDisclosure?.persistentMode === "expanded" ? "rail" : "expanded";
        this.panelDisclosure?.setMode(nextMode);
        if (nextMode === "rail") {
          this.root?.querySelector<HTMLButtonElement>("[data-gpt-reader-collapsed-rail]")
            ?.focus({ preventScroll: true });
          this.panelDisclosure?.escape();
        }
        return;
      }

      if (target.closest("[data-gpt-reader-collapsed-rail]")) {
        this.panelDisclosure?.setMode("expanded");
      }
    });

    this.root?.addEventListener("change", (event) => {
      const target = event.target as HTMLInputElement;
      if (target.matches("[data-gpt-reader-enabled]")) {
        void this.updateSettings({ enabled: target.checked });
      }

      if (target.matches("[data-gpt-reader-expand-current]")) {
        void this.updateSettings({ expandCurrentOnly: target.checked });
      }

      if (target.matches("[data-gpt-reader-max-rounds]")) {
        void this.updateSettings({ maxVisibleRounds: this.parseRoundLimit(target.value) });
      }

      if (target.matches("[data-gpt-reader-wrap-titles]")) {
        void this.updateSettings({ wrapLongTitles: target.checked });
      }

      if (target.matches("[data-gpt-reader-height-mode]")) {
        this.setHeightMode(target.value === "viewport" ? "viewport" : "fixed");
      }

      if (target.matches("[data-gpt-reader-height-percent]")) {
        const value = target.value.trim() === "" ? NaN : Number(target.value);
        this.setHeightPercent(Number.isFinite(value) ? value : this.heightPercent);
      }
    });
  }

  private observePage(): void {
    this.mutationObserver?.disconnect();
    this.mutationObserver = new MutationObserver((mutations) => {
      if (this.root && mutations.every((mutation) => this.root?.contains(mutation.target))) {
        return;
      }

      this.queueScan();
    });
    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  private observeSettings(): void {
    this.unsubscribeSettings?.();
    this.unsubscribeSettings = subscribeSettings((settings) => {
      if (this.pendingSettingsSaves > 0) {
        return;
      }
      this.settings = settings;
      this.savedSettings = settings;
      this.panelDisclosure?.setHoverEnabled(settings.hoverExpandEnabled);
      this.scan(true);
    });
  }

  private queueScan = (): void => {
    if (this.scanTimer !== null) {
      window.clearTimeout(this.scanTimer);
    }

    this.scanTimer = window.setTimeout(this.flushQueuedScan, SCAN_DEBOUNCE_MS);
    if (this.scanMaxTimer === null) {
      this.scanMaxTimer = window.setTimeout(this.flushQueuedScan, SCAN_MAX_WAIT_MS);
    }
  };

  private flushQueuedScan = (): void => {
    if (this.scanTimer !== null) {
      window.clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
    if (this.scanMaxTimer !== null) {
      window.clearTimeout(this.scanMaxTimer);
      this.scanMaxTimer = null;
    }
    this.scan();
  };

  private scan(forceRender = false): void {
    const previousOutlines = this.outlines;
    const previousDisplayOutlines = this.displayOutlines;
    const previousAnswerId = this.currentAnswerId;
    const previousHeadingId = this.currentHeadingId;
    this.applyRoundLimit();
    const answerElements = this.collectAnswerElements();
    this.refreshPageScrollListeners(answerElements);
    this.outlines = extractAnswerOutlines(answerElements);
    this.refreshAnswerCache();
    this.answerSnapshots = snapshotAnswers(answerElements);
    this.lastIntegrityCheck = performance.now();
    this.lastVisibilityCheck = this.lastIntegrityCheck;
    this.expandedAnswerIds = new Set(
      [...this.expandedAnswerIds].filter((answerId) =>
        this.displayOutlines.some((outline) => outline.id === answerId)
      )
    );
    this.collapsedAnswerIds = new Set(
      [...this.collapsedAnswerIds].filter((answerId) =>
        this.displayOutlines.some((outline) => outline.id === answerId)
      )
    );
    this.refreshHeadingCaches();

    const active = this.findActiveSelection();
    this.currentAnswerId = active.answerId;
    this.currentHeadingId = active.headingId;

    if (
      forceRender ||
      !this.sameOutlineStructure(previousOutlines, this.outlines) ||
      !this.sameOutlineStructure(previousDisplayOutlines, this.displayOutlines) ||
      previousAnswerId !== this.currentAnswerId
    ) {
      this.render();
    } else if (previousHeadingId !== this.currentHeadingId) {
      this.syncActiveHeading(previousHeadingId);
    }
    this.queueActiveUpdate();
  }

  private collectAnswerElements(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>(ASSISTANT_SELECTOR)).filter(
      (element) => !element.closest(`[${HIDDEN_ROUND_ATTR}="true"]`)
    );
  }

  private refreshAnswerCache(): void {
    if (location.pathname !== this.cachedConversationPath) {
      this.cachedConversationPath = location.pathname;
      this.cachedAnswers.clear();
      this.nextCachedAnswerSequence = 0;
    }

    for (const outline of this.outlines) {
      const container = this.getMessageContainer(outline.element as HTMLElement);
      const previous = this.cachedAnswers.get(outline.id);
      this.cachedAnswers.set(outline.id, {
        outline: { ...outline, label: `回答 · ${outline.headings[0]?.text ?? "标题待载入"}` },
        container,
        sequence: previous?.sequence ?? this.nextCachedAnswerSequence++
      });
    }

    for (const [id, answer] of this.cachedAnswers) {
      if (!answer.container.isConnected) {
        this.cachedAnswers.delete(id);
      }
    }

    this.displayOutlines = [...this.cachedAnswers.values()]
      .sort((left, right) => {
        if (left.container === right.container) {
          return left.sequence - right.sequence;
        }
        const position = left.container.compareDocumentPosition(right.container);
        if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
        return left.sequence - right.sequence;
      })
      .map((answer) => answer.outline);
  }

  private sameOutlineStructure(previous: AnswerOutline[], next: AnswerOutline[]): boolean {
    return previous.length === next.length && previous.every((outline, index) => {
      const current = next[index];
      return outline.id === current.id &&
        outline.headings.length === current.headings.length &&
        outline.headings.every((heading, headingIndex) => {
          const nextHeading = current.headings[headingIndex];
          return heading.id === nextHeading.id &&
            heading.text === nextHeading.text &&
            heading.relativeDepth === nextHeading.relativeDepth;
        });
    });
  }

  private queueActiveUpdate = (): void => {
    if (this.activeFrame) {
      return;
    }

    this.activeFrame = window.requestAnimationFrame(() => {
      this.activeFrame = null;
      this.updateActiveFromScroll();
    });
  };

  private handleWindowResize = (): void => {
    if (this.panelPosition) {
      this.applyPanelPosition();
    } else {
      this.applyPanelHeight();
    }
    this.queueActiveUpdate();
  };

  private handleDocumentScroll = (event: Event): void => {
    if (this.root && event.target instanceof Node && this.root.contains(event.target)) {
      return;
    }

    this.handlePageScroll();
  };

  private handlePageScroll = (): void => {
    this.manualListBrowsing = false;
    this.queueActiveUpdate();
    if (this.postScrollTimer !== null) {
      window.clearTimeout(this.postScrollTimer);
    }
    this.postScrollTimer = window.setTimeout(() => {
      this.postScrollTimer = null;
      this.lastIntegrityCheck = -Infinity;
      this.queueActiveUpdate();
    }, POST_SCROLL_CHECK_MS);
  };

  private handleUserPageNavigation = (event: Event): void => {
    if (this.root && event.target instanceof Node && this.root.contains(event.target)) {
      if (event instanceof KeyboardEvent && this.list?.contains(event.target)) {
        this.manualListBrowsing = this.isScrollKey(event);
      }
      return;
    }
    if (event instanceof KeyboardEvent && !this.isScrollKey(event)) {
      return;
    }

    this.clickedHeading = null;
    this.jumpGeneration += 1;
    this.manualListBrowsing = false;
    this.queueActiveUpdate();
  };

  private isScrollKey(event: KeyboardEvent): boolean {
    return ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key);
  }

  private refreshPageScrollListeners(answerElements: HTMLElement[]): void {
    const nextContainers = new Set<HTMLElement>();

    for (const answerElement of answerElements) {
      let current = answerElement.parentElement;
      while (current && current !== document.body) {
        if (this.isPageScrollContainer(current)) {
          nextContainers.add(current);
        }

        current = current.parentElement;
      }
    }

    for (const container of this.pageScrollContainers) {
      if (!nextContainers.has(container)) {
        container.removeEventListener("scroll", this.handlePageScroll);
      }
    }

    for (const container of nextContainers) {
      if (!this.pageScrollContainers.has(container)) {
        container.addEventListener("scroll", this.handlePageScroll, { passive: true });
      }
    }

    this.pageScrollContainers = nextContainers;
  }

  private isPageScrollContainer(element: HTMLElement): boolean {
    if (this.root?.contains(element)) {
      return false;
    }

    const style = getComputedStyle(element);
    if (!/(auto|scroll|overlay)/.test(style.overflowY)) {
      return false;
    }

    return element.scrollHeight > element.clientHeight + 20;
  }

  private updateActiveFromScroll(): void {
    const now = performance.now();
    const clickedElement = this.clickedHeading && this.allHeadings.find(
      (heading) => heading.id === this.clickedHeading?.id
    )?.element;
    if (
      (this.clickedHeading !== null && !clickedElement?.isConnected) ||
      now - this.lastIntegrityCheck >= SCROLL_INTEGRITY_CHECK_MS
    ) {
      this.lastIntegrityCheck = now;
      const checkVisibility = now - this.lastVisibilityCheck >= SCROLL_VISIBILITY_CHECK_MS;
      if (checkVisibility) {
        this.lastVisibilityCheck = now;
      }
      const anchorAnswerId = findAnswerAtAnchor(
        this.answerSnapshots,
        this.getActiveAnchorY(),
        this.currentAnswerId
      )?.id ?? this.currentAnswerId;
      if (answerSnapshotsChanged(
        this.answerSnapshots,
        this.collectAnswerElements(),
        anchorAnswerId,
        checkVisibility
      )) {
        this.scan();
        return;
      }
    }

    const active = this.findActiveSelection();
    const previousAnswerId = this.currentAnswerId;
    const previousHeadingId = this.currentHeadingId;

    if (
      active.headingId !== this.currentHeadingId ||
      active.answerId !== this.currentAnswerId
    ) {
      this.currentHeadingId = active.headingId;
      this.currentAnswerId = active.answerId;

      if (previousAnswerId !== active.answerId) {
        this.renderList();
      } else {
        this.syncActiveHeading(previousHeadingId);
      }
    }

    this.keepActiveHeadingInView();
    this.positionActiveDot();
  }

  private render(): void {
    if (!this.root) {
      return;
    }

    this.root.classList.toggle("is-disabled", !this.settings.enabled);
    syncPanelTitleWrapping(this.root, this.settings.wrapLongTitles);
    this.applyPanelDirection();
    this.applyPanelPresentation();
    this.root
      .querySelector<HTMLInputElement>("[data-gpt-reader-enabled]")
      ?.toggleAttribute("checked", this.settings.enabled);
    this.root
      .querySelector<HTMLInputElement>("[data-gpt-reader-expand-current]")
      ?.toggleAttribute("checked", this.settings.expandCurrentOnly);

    const enabledInput = this.root.querySelector<HTMLInputElement>("[data-gpt-reader-enabled]");
    if (enabledInput) {
      enabledInput.checked = this.settings.enabled;
    }

    const expandInput = this.root.querySelector<HTMLInputElement>("[data-gpt-reader-expand-current]");
    if (expandInput) {
      expandInput.checked = this.settings.expandCurrentOnly;
    }

    const maxRoundsInput = this.root.querySelector<HTMLInputElement>(
      "[data-gpt-reader-max-rounds]"
    );
    if (maxRoundsInput) {
      maxRoundsInput.value = String(this.settings.maxVisibleRounds);
    }

    this.renderDepthButtons();
    this.renderList();
  }

  private applyPanelPresentation(): void {
    if (!this.root) {
      return;
    }

    const presentation: PanelPresentation =
      this.panelDisclosure?.presentation ?? this.panelMode;
    const isRail = presentation === "rail";
    this.root.classList.toggle("is-collapsed", isRail);
    this.root.classList.toggle("is-peek", presentation === "peek");

    const pinButton = this.root.querySelector<HTMLButtonElement>("[data-gpt-reader-pin]");
    if (pinButton) {
      const pinned = this.panelDisclosure?.persistentMode === "expanded";
      const label = pinned ? "取消固定并收起目录" : "固定展开目录";
      pinButton.setAttribute("aria-pressed", String(pinned));
      pinButton.setAttribute("aria-label", label);
      pinButton.title = label;
    }

    const railButton = this.root.querySelector<HTMLButtonElement>(
      "[data-gpt-reader-collapsed-rail]"
    );
    if (railButton) {
      railButton.setAttribute("aria-expanded", String(!isRail));
      railButton.title = isRail ? "点击固定展开目录" : "ChatGPT 回答目录已展开";
    }
  }

  private renderCollapsedRail(): void {
    if (!this.collapsedRailMarkers) {
      return;
    }

    const markers = getRailMarkers({
      outlines: this.outlines,
      currentAnswerId: this.currentAnswerId,
      currentHeadingId: this.currentHeadingId,
      maxDepth: this.settings.maxDepth
    });

    if (markers.length === 0) {
      if (!this.collapsedRailMarkers.firstElementChild?.classList.contains("is-empty")) {
        const empty = document.createElement("span");
        empty.className = "gpt-reader-collapsed-marker is-empty";
        this.collapsedRailMarkers.replaceChildren(empty);
      }
    } else {
      const existing = Array.from(this.collapsedRailMarkers.children) as HTMLElement[];
      const canReuse = existing.length === markers.length && existing.every(
        (element, index) => element.dataset.depth === String(markers[index].relativeDepth)
      );
      if (canReuse) {
        existing.forEach((element, index) => {
          element.classList.toggle("is-active", markers[index].isActive);
        });
      } else {
        this.collapsedRailMarkers.replaceChildren(
          ...markers.map((marker) => {
            const element = document.createElement("span");
            element.className = "gpt-reader-collapsed-marker";
            element.dataset.depth = String(marker.relativeDepth);
            element.classList.toggle("is-active", marker.isActive);
            element.style.width = `${marker.width}px`;
            return element;
          })
        );
      }
    }

    this.collapsedRailMarkers.style.setProperty(
      "--gpt-reader-marker-count",
      String(Math.max(1, markers.length))
    );
    const railButton = this.root?.querySelector<HTMLButtonElement>(
      "[data-gpt-reader-collapsed-rail]"
    );
    railButton?.setAttribute(
      "aria-label",
      markers.length > 0
        ? `展开 ChatGPT 回答目录，当前回答 ${markers.length} 个标题`
        : "展开 ChatGPT 回答目录，当前回答暂无标题"
    );
  }

  private renderDepthButtons(): void {
    const container = this.root?.querySelector<HTMLElement>("[data-gpt-reader-depths]");
    if (!container) {
      return;
    }

    container.replaceChildren(
      ...headingDepths.map((depth) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.gptReaderDepth = String(depth);
        button.className = depth === this.settings.maxDepth ? "is-active" : "";
        button.textContent = String(depth);
        return button;
      })
    );
  }

  private renderList(): void {
    if (!this.list) {
      return;
    }

    if (!this.settings.enabled) {
      this.list.replaceChildren();
      return;
    }

    if (
      this.displayOutlines.length === 0 ||
      (this.currentAnswerId !== null && !this.displayOutlines.some((outline) => outline.id === this.currentAnswerId))
    ) {
      const empty = document.createElement("p");
      empty.className = "gpt-reader-empty";
      empty.textContent = "当前回答还没有 Markdown 标题";
      this.list.replaceChildren(empty);
      this.positionActiveDot();
      this.renderCollapsedRail();
      return;
    }

    const groups: HTMLElement[] = [];
    const existingGroups = new Map(
      Array.from(this.list.querySelectorAll<HTMLElement>(":scope > .gpt-reader-answer"))
        .map((group) => [group.dataset.gptReaderGroupId, group] as const)
    );
    this.displayOutlines.forEach((outline) => {
      const isCurrentAnswer = outline.id === this.currentAnswerId;
      const group = existingGroups.get(outline.id) ?? document.createElement("section");
      group.classList.add("gpt-reader-answer");
      group.dataset.gptReaderGroupId = outline.id;
      group.classList.toggle("is-current", isCurrentAnswer);
      const isManuallyCollapsed = this.collapsedAnswerIds.has(outline.id);
      const isPinnedOpen = !this.settings.expandCurrentOnly || isCurrentAnswer;
      const isExpanded =
        !isManuallyCollapsed && (isPinnedOpen || this.expandedAnswerIds.has(outline.id));

      const header = group.querySelector<HTMLElement>(":scope > .gpt-reader-answer-title") ??
        document.createElement("div");
      header.classList.add("gpt-reader-answer-title");
      header.classList.toggle("is-collapsed", !isExpanded);
      let toggle = header.querySelector<HTMLButtonElement>("[data-gpt-reader-answer-toggle]");
      if (!toggle) {
        toggle = document.createElement("button");
        toggle.type = "button";
        toggle.dataset.gptReaderAnswerToggle = "";
        toggle.innerHTML = `<span class="gpt-reader-answer-caret" aria-hidden="true"></span><span></span>`;
        header.append(toggle);
      }
      toggle.dataset.gptReaderAnswerId = outline.id;
      toggle.setAttribute("aria-expanded", String(isExpanded));
      const caret = toggle.querySelector<HTMLElement>(".gpt-reader-answer-caret");
      if (caret && caret.dataset.expanded !== String(isExpanded)) {
        caret.innerHTML = getAnswerChevronIcon(isExpanded);
        caret.dataset.expanded = String(isExpanded);
      }
      const label = toggle.querySelector<HTMLElement>("span:last-child");
      if (label) {
        label.textContent = outline.label;
      }
      const currentBadge = header.querySelector("em");
      if (isCurrentAnswer && !currentBadge) {
        const badge = document.createElement("em");
        badge.textContent = "当前";
        header.append(badge);
      } else if (!isCurrentAnswer) {
        currentBadge?.remove();
      }

      const headings = isExpanded
        ? getVisibleHeadingsForAnswer(
            outline,
            this.settings,
            isPinnedOpen ? this.currentAnswerId : outline.id
          )
        : [];

      const existingButtons = new Map(
        Array.from(group.querySelectorAll<HTMLButtonElement>(":scope > [data-gpt-reader-heading]"))
          .map((button) => [button.dataset.gptReaderHeading, button] as const)
      );
      const buttons = headings.map((heading) => {
        const button = existingButtons.get(heading.id) ?? document.createElement("button");
        button.type = "button";
        button.classList.add("gpt-reader-heading");
        button.dataset.gptReaderHeading = heading.id;
        button.dataset.gptReaderAnswerId = heading.answerId;
        const available = Boolean(
          heading.element.isConnected || this.cachedAnswers.get(heading.answerId)?.container.isConnected
        );
        button.disabled = !available;
        button.title = available ? heading.text : "目标暂不可跳转，请滚动到该回答后重试";
        button.classList.toggle("is-active", heading.id === this.currentHeadingId);
        if (heading.id === this.currentHeadingId) {
          button.setAttribute("aria-current", "location");
        } else {
          button.removeAttribute("aria-current");
        }
        button.style.setProperty(
          "--toc-indent",
          `${Math.min(40, Math.max(0, heading.relativeDepth - 1) * 10)}px`
        );
        if (
          button.dataset.gptReaderText !== heading.text ||
          button.dataset.gptReaderDepthLabel !== String(heading.relativeDepth)
        ) {
          button.innerHTML = `
            <span class="gpt-reader-heading-depth">H${heading.relativeDepth}</span>
            <span>${escapeText(heading.text)}</span>
          `;
          button.dataset.gptReaderText = heading.text;
          button.dataset.gptReaderDepthLabel = String(heading.relativeDepth);
        }
        return button;
      });
      this.reconcileChildren(group, [header, ...buttons]);
      groups.push(group);
    });

    const previousScrollTop = this.list.scrollTop;
    this.reconcileChildren(this.list, groups);
    if (this.manualListBrowsing) {
      this.list.scrollTop = previousScrollTop;
    }
    this.positionActiveDot();
    this.keepActiveHeadingInView();
    this.renderCollapsedRail();
  }

  private reconcileChildren(parent: HTMLElement, children: HTMLElement[]): void {
    children.forEach((child, index) => {
      if (parent.children[index] !== child) {
        parent.insertBefore(child, parent.children[index] ?? null);
      }
    });
    while (parent.children.length > children.length) {
      parent.lastElementChild?.remove();
    }
  }

  private syncActiveHeading(previousHeadingId: string | null): void {
    if (!this.list) {
      return;
    }

    if (previousHeadingId && previousHeadingId !== this.currentHeadingId) {
      const previousButton = this.list.querySelector<HTMLElement>(
        `[data-gpt-reader-heading="${CSS.escape(previousHeadingId)}"]`
      );
      previousButton?.classList.remove("is-active");
      previousButton?.removeAttribute("aria-current");
    }

    if (this.currentHeadingId) {
      const currentButton = this.list.querySelector<HTMLElement>(
        `[data-gpt-reader-heading="${CSS.escape(this.currentHeadingId)}"]`
      );
      currentButton?.classList.add("is-active");
      currentButton?.setAttribute("aria-current", "location");
    }

    this.keepActiveHeadingInView();
    this.renderCollapsedRail();
  }

  private positionActiveDot(): void {
    if (!this.list || !this.activeDot) {
      return;
    }

    const activeItem = this.getActiveListItem();
    if (!activeItem) {
      this.activeDot.style.opacity = "0";
      return;
    }

    const listRect = this.list.getBoundingClientRect();
    const activeRect = activeItem.getBoundingClientRect();
    const top = Math.min(
      Math.max(6, this.list.clientHeight - 6),
      Math.max(6, activeRect.top - listRect.top + activeRect.height / 2)
    );
    this.activeDot.style.opacity = "1";
    this.activeDot.style.transform = `translateY(${top}px)`;
  }

  private keepActiveHeadingInView(forceAlignment = false): void {
    if (!this.list || this.manualListBrowsing) {
      return;
    }

    const activeItem = this.getActiveListItem();
    if (!activeItem) {
      return;
    }

    const listRect = this.list.getBoundingClientRect();
    const activeRect = activeItem.getBoundingClientRect();
    const activeCenter = activeRect.top - listRect.top + activeRect.height / 2;
    const nextScrollTop = nextTocScrollTop(
      this.list.scrollTop,
      this.list.scrollHeight,
      this.list.clientHeight,
      activeCenter,
      forceAlignment
    );

    if (Math.abs(nextScrollTop - this.list.scrollTop) > 0.5) {
      this.list.scrollTop = nextScrollTop;
    }

    window.requestAnimationFrame(() => this.positionActiveDot());
  }

  private getActiveListItem(): HTMLElement | null {
    if (!this.list) {
      return null;
    }

    return (
      this.list.querySelector<HTMLElement>(".gpt-reader-heading.is-active") ??
      this.list.querySelector<HTMLElement>(".gpt-reader-answer.is-current .gpt-reader-answer-title")
    );
  }

  private scrollToHeading(headingId: string | undefined, answerId: string | undefined): void {
    if (!headingId) {
      return;
    }

    let heading = this.allHeadings.find(
      (item) => item.id === headingId && (!answerId || item.answerId === answerId)
    );
    if (!heading || !heading.element.isConnected) {
      this.scan();
      heading = this.allHeadings.find(
        (item) => item.id === headingId && (!answerId || item.answerId === answerId)
      ) ?? this.displayOutlines.flatMap((outline) => outline.headings).find(
        (item) => item.id === headingId && (!answerId || item.answerId === answerId)
      );
    }
    if (!heading) {
      return;
    }

    const previousAnswerId = this.currentAnswerId;
    const previousHeadingId = this.currentHeadingId;
    this.currentHeadingId = heading.id;
    this.currentAnswerId = heading.answerId;
    this.clickedHeading = { id: heading.id, answerId: heading.answerId, text: heading.text };
    this.manualListBrowsing = false;
    const jumpGeneration = ++this.jumpGeneration;
    const pageUrl = location.href;
    void this.completeHeadingJump(heading, jumpGeneration, pageUrl);
    if (previousAnswerId !== heading.answerId) {
      this.renderList();
    } else {
      this.syncActiveHeading(previousHeadingId);
    }
    this.keepActiveHeadingInView(true);
  }

  private async completeHeadingJump(
    heading: HeadingInfo,
    jumpGeneration: number,
    pageUrl: string
  ): Promise<void> {
    const isCancelled = (): boolean =>
      jumpGeneration !== this.jumpGeneration || location.href !== pageUrl;
    let target = this.resolveHeadingElement(heading);
    if (!target) {
      const container = this.cachedAnswers.get(heading.answerId)?.container;
      if (!container?.isConnected) {
        this.showJumpStatus("目标暂不可跳转，请滚动到该回答后重试");
        return;
      }
      container.scrollIntoView({ behavior: "instant", block: "start" });
      for (let attempt = 0; attempt < 25 && !target && !isCancelled(); attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 80));
        target = this.resolveHeadingElement(heading);
      }
    }
    if (!target || isCancelled()) {
      if (!isCancelled()) {
        this.showJumpStatus("目标尚未载入，请滚动到该回答后重试");
      }
      return;
    }

    this.showJumpStatus(null);
    const result = await scrollHeadingToPercent(target, this.settings.headingScrollPositionPercent, {
      resolveHeading: () => this.resolveHeadingElement(heading),
      isCancelled
    });
    if (isCancelled() || !result.element?.isConnected) {
      return;
    }
    if (result.status !== "reached" && result.status !== "clamped") {
      this.showJumpStatus("定位未完成，请重试");
      return;
    }
    this.scan();
    const currentElement = this.resolveHeadingElement(heading) ?? result.element;
    this.headingHighlighter.show(currentElement, {
      enabled: this.settings.targetHighlightEnabled,
      durationMs: this.settings.targetHighlightDurationMs,
      resolveElement: () => this.resolveHeadingElement(heading),
      observeRoot: this.cachedAnswers.get(heading.answerId)?.container ?? document.body,
      overlayHost: this.root ?? document.body
    });
  }

  private showJumpStatus(message: string | null): void {
    const status = this.root?.querySelector<HTMLElement>("[data-gpt-reader-jump-status]");
    if (!status) {
      return;
    }
    status.hidden = message === null;
    status.textContent = message ?? "";
  }

  private resolveHeadingElement(heading: HeadingInfo): HTMLElement | null {
    const answer = this.collectAnswerElements().find(
      (element) => ensureAnswerId(element) === heading.answerId
    );
    return answer?.querySelectorAll<HTMLElement>(headingSelector)[heading.order] ?? null;
  }

  private toggleSettings(): void {
    const settings = this.root?.querySelector<HTMLElement>("[data-gpt-reader-settings]");
    const toggle = this.root?.querySelector<HTMLButtonElement>("[data-gpt-reader-settings-toggle]");
    if (!settings || !toggle) {
      return;
    }

    const nextOpen = settings.hidden;
    settings.hidden = !nextOpen;
    toggle.setAttribute("aria-expanded", String(nextOpen));
  }

  private async updateSettings(patch: Partial<TocSettings>): Promise<void> {
    const revision = ++this.settingsRevision;
    this.settings = mergeSettings(this.settings, patch);
    const nextSettings = this.settings;
    this.scan(true);
    this.pendingSettingsSaves += 1;
    this.showPanelSaveStatus("正在保存…");
    try {
      await saveSettings(nextSettings);
      this.savedSettings = nextSettings;
      if (revision === this.settingsRevision) {
        this.showPanelSaveStatus("已保存");
      }
    } catch {
      if (revision === this.settingsRevision) {
        this.settings = this.savedSettings;
        this.scan(true);
        this.showPanelSaveStatus("保存失败，请重试", true);
      }
    } finally {
      this.pendingSettingsSaves -= 1;
    }
  }

  private showPanelSaveStatus(message: string, isError = false): void {
    const status = this.root?.querySelector<HTMLElement>("[data-gpt-reader-panel-save-status]");
    if (!status) {
      return;
    }
    status.hidden = false;
    status.textContent = message;
    status.classList.toggle("is-error", isError);
  }

  private parseRoundLimit(value: string): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return 0;
    }

    return Math.min(50, Math.max(0, Math.trunc(parsed)));
  }

  private applyRoundLimit(): void {
    this.restoreHiddenRounds();

    if (!this.settings.enabled || this.settings.maxVisibleRounds <= 0) {
      this.removeRoundLimitBanner();
      return;
    }

    const rounds = this.getConversationRounds();
    if (rounds.length <= this.settings.maxVisibleRounds) {
      this.removeRoundLimitBanner();
      return;
    }

    const hiddenRounds = rounds.slice(0, -this.settings.maxVisibleRounds);
    const visibleRounds = rounds.slice(-this.settings.maxVisibleRounds);
    const firstVisibleContainer = visibleRounds[0]?.containers[0];

    for (const round of hiddenRounds) {
      for (const container of round.containers) {
        this.hideRoundContainer(container);
      }
    }

    this.hidePreviousSiblingsBefore(firstVisibleContainer);
    this.insertRoundLimitBanner(firstVisibleContainer);
  }

  private hidePreviousSiblingsBefore(anchor: HTMLElement | undefined): void {
    if (!anchor?.parentElement) {
      return;
    }

    let sibling = anchor.previousElementSibling as HTMLElement | null;
    while (sibling) {
      const previousSibling = sibling.previousElementSibling as HTMLElement | null;
      this.hideRoundContainer(sibling);
      sibling = previousSibling;
    }
  }

  private hideRoundContainer(container: HTMLElement): void {
    if (
      container.id === ROOT_ID ||
      container.id === ROUND_LIMIT_BANNER_ID ||
      this.root?.contains(container) ||
      this.hiddenRoundContainers.has(container)
    ) {
      return;
    }

    container.dataset.gptReaderPreviousDisplay = container.style.getPropertyValue("display");
    container.dataset.gptReaderPreviousDisplayPriority =
      container.style.getPropertyPriority("display");
    container.setAttribute(HIDDEN_ROUND_ATTR, "true");
    container.style.setProperty("display", "none", "important");
    this.hiddenRoundContainers.add(container);
  }

  private restoreHiddenRounds(): void {
    for (const container of this.hiddenRoundContainers) {
      const previousDisplay = container.dataset.gptReaderPreviousDisplay ?? "";
      const previousPriority = container.dataset.gptReaderPreviousDisplayPriority ?? "";
      container.style.setProperty("display", previousDisplay, previousPriority);
      delete container.dataset.gptReaderPreviousDisplay;
      delete container.dataset.gptReaderPreviousDisplayPriority;
      container.removeAttribute(HIDDEN_ROUND_ATTR);
    }

    this.hiddenRoundContainers.clear();
  }

  private getConversationRounds(): ConversationRound[] {
    const rounds: ConversationRound[] = [];
    let currentRound: ConversationRound | null = null;

    const messages = Array.from(document.querySelectorAll<HTMLElement>(MESSAGE_SELECTOR));
    for (const message of messages) {
      if (this.root?.contains(message)) {
        continue;
      }

      const role = message.dataset.messageAuthorRole;
      const container = this.getMessageContainer(message);
      if (!container || container.id === ROUND_LIMIT_BANNER_ID) {
        continue;
      }

      if (role === "user" || !currentRound) {
        currentRound = { containers: [] };
        rounds.push(currentRound);
      }

      if (!currentRound.containers.includes(container)) {
        currentRound.containers.push(container);
      }
    }

    return rounds.filter((round) => round.containers.length > 0);
  }

  private getMessageContainer(message: HTMLElement): HTMLElement {
    return message.closest<HTMLElement>(TURN_SELECTOR) ?? message.closest<HTMLElement>("article") ?? message;
  }

  private insertRoundLimitBanner(anchor: HTMLElement | undefined): void {
    if (!anchor?.parentElement) {
      this.removeRoundLimitBanner();
      return;
    }

    const banner = this.getOrCreateRoundLimitBanner();
    if (banner.parentElement !== anchor.parentElement || banner.nextElementSibling !== anchor) {
      anchor.parentElement.insertBefore(banner, anchor);
    }
  }

  private getOrCreateRoundLimitBanner(): HTMLElement {
    const existing = document.getElementById(ROUND_LIMIT_BANNER_ID);
    if (existing) {
      return existing;
    }

    const banner = document.createElement("div");
    banner.id = ROUND_LIMIT_BANNER_ID;
    banner.textContent = "旧消息已从当前视图隐藏，调为 0 可恢复显示";
    return banner;
  }

  private removeRoundLimitBanner(): void {
    document.getElementById(ROUND_LIMIT_BANNER_ID)?.remove();
  }

  private toggleAnswer(answerId: string | undefined): void {
    if (!answerId) {
      return;
    }

    const outline = this.displayOutlines.find((item) => item.id === answerId);
    if (!outline) {
      return;
    }

    const isCurrentAnswer = answerId === this.currentAnswerId;
    const isPinnedOpen = !this.settings.expandCurrentOnly || isCurrentAnswer;
    const isExpanded =
      !this.collapsedAnswerIds.has(answerId) && (isPinnedOpen || this.expandedAnswerIds.has(answerId));

    if (isExpanded) {
      this.collapsedAnswerIds.add(answerId);
      this.expandedAnswerIds.delete(answerId);
    } else {
      this.collapsedAnswerIds.delete(answerId);
      this.expandedAnswerIds.add(answerId);
    }

    this.manualListBrowsing = true;
    this.renderList();
  }

  private refreshHeadingCaches(): void {
    this.allHeadings = flattenHeadings(this.outlines);
  }

  private findActiveSelection(): { answerId: string | null; headingId: string | null } {
    if (this.clickedHeading) {
      const selected = this.allHeadings.find((heading) =>
        heading.id === this.clickedHeading?.id &&
        heading.answerId === this.clickedHeading?.answerId &&
        heading.text === this.clickedHeading?.text
      );
      if (selected?.element.isConnected &&
        selected.relativeDepth <= this.settings.maxDepth &&
        isVisibleHeading(selected.element)) {
        return { answerId: selected.answerId, headingId: selected.id };
      }
      const cached = this.cachedAnswers.get(this.clickedHeading.answerId);
      if (
        cached?.container.isConnected &&
        cached.outline.headings.some((heading) =>
          heading.id === this.clickedHeading?.id && heading.text === this.clickedHeading?.text
        )
      ) {
        return { answerId: this.clickedHeading.answerId, headingId: this.clickedHeading.id };
      }
      this.clickedHeading = null;
    }

    const anchorY = this.getActiveAnchorY();
    const answer = findAnswerAtAnchor(this.answerSnapshots, anchorY, this.currentAnswerId);
    if (!answer) {
      return { answerId: null, headingId: null };
    }
    const outline = this.outlines.find((item) => item.id === answer.id);
    const heading = findHeadingAtAnchor(
      outline,
      anchorY,
      this.settings.maxDepth,
      answer.id === this.currentAnswerId ? this.currentHeadingId : null
    );
    return { answerId: answer.id, headingId: heading?.id ?? null };
  }

  private getActiveAnchorY(): number {
    const firstAnswer = this.answerSnapshots[0]?.element;
    const container = firstAnswer && findNearestVerticalScrollContainer(firstAnswer);
    if (container) {
      const rect = container.getBoundingClientRect();
      const top = Math.max(0, rect.top);
      const bottom = Math.min(window.innerHeight, rect.bottom);
      if (bottom > top) {
        return Math.round(top + (bottom - top) * ACTIVE_ANCHOR_RATIO);
      }
    }
    return Math.round(window.innerHeight * ACTIVE_ANCHOR_RATIO);
  }

  private async loadPanelUiState(): Promise<void> {
    const storedState = await this.readStoredPanelUiState();
    this.panelExpandDirection = normalizePanelExpandDirection(storedState.expandDirection);
    const legacyWidth = this.readStoredNumber(window.localStorage.getItem(WIDTH_STORAGE_KEY));
    const legacyHeight = this.readStoredNumber(window.localStorage.getItem(HEIGHT_STORAGE_KEY));
    const legacyPosition = this.readLegacyPanelPosition();
    const width = this.readStoredNumber(storedState.width) ?? legacyWidth;
    const height = this.readStoredNumber(storedState.height) ?? legacyHeight;
    this.panelMode = storedState.mode === "rail" ? "rail" : "expanded";
    this.heightMode = storedState.heightMode === "viewport" || storedState.heightMode === "fixed"
      ? storedState.heightMode
      : height === undefined ? "viewport" : "fixed";
    this.heightPercent = normalizeHeightPercent(storedState.heightPercent);
    this.centerYRatio = normalizeCenterRatio(storedState.centerYRatio);

    if (width !== undefined) {
      this.panelWidth = this.constrainPanelWidth(width);
    }

    this.panelPosition = normalizePanelPosition(storedState.position) ?? legacyPosition;

    if (height !== undefined) {
      this.panelHeight = Math.max(MIN_PANEL_HEIGHT, height);
    }
  }

  private readStoredNumber(value: unknown): number | undefined {
    if (value === null || value === undefined || value === "") {
      return undefined;
    }

    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : undefined;
  }

  private async readStoredPanelUiState(): Promise<PanelUiState> {
    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      return {};
    }

    try {
      const result = await chrome.storage.local.get(UI_STORAGE_KEY);
      const storedState = result[UI_STORAGE_KEY] as PanelUiState | undefined;
      return storedState && typeof storedState === "object" ? storedState : {};
    } catch {
      return {};
    }
  }

  private async savePanelUiState(): Promise<void> {
    const state: PanelUiState = {
      width: Math.round(this.panelWidth),
      height: Math.round(this.panelHeight),
      heightMode: this.heightMode,
      heightPercent: this.heightPercent,
      centerYRatio: this.centerYRatio,
      position: this.panelPosition,
      mode: this.panelDisclosure?.persistentMode ?? this.panelMode,
      expandDirection: this.panelExpandDirection
    };

    window.localStorage.setItem(WIDTH_STORAGE_KEY, String(state.width));
    window.localStorage.setItem(HEIGHT_STORAGE_KEY, String(state.height));
    if (state.position) {
      window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(state.position));
    }

    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      return;
    }

    const write = this.panelUiSaveQueue.then(() => chrome.storage.local.set({ [UI_STORAGE_KEY]: state }));
    this.panelUiSaveQueue = write.catch(() => {
      // Local storage fallback above still keeps the UI usable.
    });
    await this.panelUiSaveQueue;
  }

  private constrainPanelWidth(width: number): number {
    return Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, width));
  }

  private applyPanelWidth(): void {
    this.root?.style.setProperty("--gpt-reader-width", `${this.panelWidth}px`);
  }

  private applyPanelDirection(): void {
    if (!this.root) {
      return;
    }

    syncPanelDirectionControls(this.root, this.panelExpandDirection);
  }

  private togglePanelExpandDirection(): void {
    const currentRect = this.root?.getBoundingClientRect();
    this.panelExpandDirection = this.panelExpandDirection === "right" ? "left" : "right";
    if (currentRect) {
      this.panelPosition = this.constrainPanelPosition(currentRect.left, currentRect.top);
    }
    this.applyPanelDirection();
    this.applyPanelPosition();
    void this.savePanelUiState();
  }

  private constrainPanelHeight(height: number): number {
    const top = this.root?.getBoundingClientRect().top ?? 82;
    const maxHeight = Math.max(0, window.innerHeight - top - PANEL_EDGE_MARGIN);
    return Math.min(maxHeight, Math.max(Math.min(MIN_PANEL_HEIGHT, maxHeight), height));
  }

  private applyPanelHeight(): void {
    this.applyPanelPosition();
  }

  private syncPanelHeightControls(): void {
    const mode = this.root?.querySelector<HTMLSelectElement>("[data-gpt-reader-height-mode]");
    const percent = this.root?.querySelector<HTMLInputElement>("[data-gpt-reader-height-percent]");
    const field = this.root?.querySelector<HTMLElement>("[data-gpt-reader-height-percent-field]");
    if (mode) mode.value = this.heightMode;
    if (percent) percent.value = String(this.heightPercent);
    if (field) field.hidden = this.heightMode !== "viewport";
  }

  private setHeightMode(mode: PanelHeightMode): void {
    if (mode === this.heightMode) {
      this.syncPanelHeightControls();
      return;
    }
    const rect = this.root?.getBoundingClientRect();
    if (rect) {
      if (mode === "viewport") {
        this.centerYRatio = normalizeCenterRatio((rect.top + rect.height / 2) / window.innerHeight);
      } else {
        this.panelPosition = { left: rect.left, top: rect.top };
      }
    }
    this.heightMode = mode;
    this.applyPanelPosition();
    this.syncPanelHeightControls();
    void this.savePanelUiState();
  }

  private setHeightPercent(value: number): void {
    const nextPercent = normalizeHeightPercent(value);
    if (nextPercent !== this.heightPercent) {
      this.heightPercent = nextPercent;
      this.applyPanelPosition();
      void this.savePanelUiState();
    }
    this.syncPanelHeightControls();
  }

  private readLegacyPanelPosition(): PanelPosition | null {
    const rawPosition = window.localStorage.getItem(POSITION_STORAGE_KEY);
    if (!rawPosition) {
      return null;
    }

    try {
      const parsed = JSON.parse(rawPosition) as { left?: unknown; top?: unknown };
      const left = Number(parsed.left);
      const top = Number(parsed.top);
      if (!Number.isFinite(left) || !Number.isFinite(top)) {
        return null;
      }

      return normalizePanelPosition({ left, top });
    } catch {
      return null;
    }
  }

  private applyPanelPosition(): void {
    if (!this.root) {
      return;
    }

    if (!this.panelPosition) {
      const rect = this.root.getBoundingClientRect();
      this.panelPosition = { left: rect.left, top: rect.top };
    }

    const rendered = this.heightMode === "viewport"
      ? getViewportPanelLayout(
          this.panelPosition.left,
          this.heightPercent,
          this.centerYRatio,
          this.panelWidth,
          COLLAPSED_RAIL_WIDTH,
          this.panelExpandDirection,
          window.innerWidth,
          window.innerHeight,
          MIN_PANEL_HEIGHT,
          PANEL_EDGE_MARGIN
        )
      : getRenderedPanelLayout(
          this.panelPosition,
          this.panelWidth,
          this.panelHeight,
          COLLAPSED_RAIL_WIDTH,
          this.panelExpandDirection,
          window.innerWidth,
          window.innerHeight,
          PANEL_EDGE_MARGIN
        );
    this.root.style.setProperty("--gpt-reader-left", `${rendered.left}px`);
    this.root.style.setProperty("--gpt-reader-top", `${rendered.top}px`);
    this.root.style.setProperty("--gpt-reader-height", `${rendered.height}px`);
  }

  private constrainPanelPosition(left: number, top: number): PanelPosition {
    const rendered = getRenderedPanelLayout(
      { left, top },
      this.panelWidth,
      this.root?.getBoundingClientRect().height ?? this.panelHeight,
      COLLAPSED_RAIL_WIDTH,
      this.panelExpandDirection,
      window.innerWidth,
      window.innerHeight,
      PANEL_EDGE_MARGIN
    );
    return { left: rendered.left, top: rendered.top };
  }

  private startDrag(event: PointerEvent): void {
    if (!this.root) {
      return;
    }

    event.preventDefault();
    const rect = this.root.getBoundingClientRect();
    this.isDragging = true;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.dragStartLeft = rect.left;
    this.dragStartTop = rect.top;
    this.root.classList.add("is-dragging");
    this.panelDisclosure?.beginInteraction();
    window.addEventListener("pointermove", this.dragPanel);
    window.addEventListener("pointerup", this.stopDrag, { once: true });
    window.addEventListener("pointercancel", this.stopDrag, { once: true });
  }

  private dragPanel = (event: PointerEvent): void => {
    if (!this.isDragging) {
      return;
    }

    this.panelPosition = this.constrainPanelPosition(
      this.dragStartLeft + event.clientX - this.dragStartX,
      this.dragStartTop + event.clientY - this.dragStartY
    );
    if (this.heightMode === "viewport") {
      const height = this.root?.getBoundingClientRect().height ?? 0;
      this.centerYRatio = normalizeCenterRatio(
        (this.panelPosition.top + height / 2) / window.innerHeight
      );
    }
    this.applyPanelPosition();
    this.positionActiveDot();
  };

  private stopDrag = (): void => {
    this.isDragging = false;
    this.root?.classList.remove("is-dragging");
    window.removeEventListener("pointermove", this.dragPanel);
    window.removeEventListener("pointerup", this.stopDrag);
    window.removeEventListener("pointercancel", this.stopDrag);
    this.panelDisclosure?.endInteraction();
    void this.savePanelUiState();
  };

  private startResize(event: PointerEvent): void {
    event.preventDefault();
    this.isResizing = true;
    this.resizeStartX = event.clientX;
    this.resizeStartWidth = this.panelWidth;
    this.root?.classList.add("is-resizing");
    this.panelDisclosure?.beginInteraction();
    window.addEventListener("pointermove", this.resizePanel);
    window.addEventListener("pointerup", this.stopResize, { once: true });
    window.addEventListener("pointercancel", this.stopResize, { once: true });
  }

  private resizePanel = (event: PointerEvent): void => {
    if (!this.isResizing) {
      return;
    }

    const nextWidth = getResizedPanelWidth(
      this.resizeStartWidth,
      event.clientX - this.resizeStartX,
      this.panelExpandDirection
    );
    this.panelWidth = this.constrainPanelWidth(nextWidth);
    this.applyPanelWidth();
    this.applyPanelPosition();
    this.positionActiveDot();
  };

  private stopResize = (): void => {
    this.isResizing = false;
    this.root?.classList.remove("is-resizing");
    window.removeEventListener("pointermove", this.resizePanel);
    window.removeEventListener("pointerup", this.stopResize);
    window.removeEventListener("pointercancel", this.stopResize);
    this.panelDisclosure?.endInteraction();
    void this.savePanelUiState();
  };

  private startHeightResize(event: PointerEvent): void {
    event.preventDefault();
    this.isResizingHeight = true;
    this.resizeStartY = event.clientY;
    this.resizeStartHeight = this.root?.getBoundingClientRect().height ?? this.panelHeight;
    this.root?.classList.add("is-resizing-height");
    this.panelDisclosure?.beginInteraction();
    window.addEventListener("pointermove", this.resizePanelHeight);
    window.addEventListener("pointerup", this.stopHeightResize, { once: true });
    window.addEventListener("pointercancel", this.stopHeightResize, { once: true });
  }

  private resizePanelHeight = (event: PointerEvent): void => {
    if (!this.isResizingHeight) {
      return;
    }

    const delta = event.clientY - this.resizeStartY;
    if (this.heightMode === "viewport") {
      const nextHeight = this.resizeStartHeight + delta * 2;
      this.heightPercent = normalizeHeightPercent(nextHeight / window.innerHeight * 100);
      this.syncPanelHeightControls();
    } else {
      this.panelHeight = this.constrainPanelHeight(this.resizeStartHeight + delta);
    }
    this.applyPanelHeight();
    this.positionActiveDot();
  };

  private stopHeightResize = (): void => {
    this.isResizingHeight = false;
    this.root?.classList.remove("is-resizing-height");
    window.removeEventListener("pointermove", this.resizePanelHeight);
    window.removeEventListener("pointerup", this.stopHeightResize);
    window.removeEventListener("pointercancel", this.stopHeightResize);
    this.panelDisclosure?.endInteraction();
    void this.savePanelUiState();
  };
}

void new ChatGptReader().init();
