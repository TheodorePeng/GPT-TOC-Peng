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
import {
  findNearestVerticalScrollContainer,
  scrollElementNearViewport,
  scrollHeadingToPercent
} from "../shared/heading-scroll";
import { HeadingHighlighter } from "./highlighter";
import { PromptPreviewController } from "./prompt-preview";
import {
  DEFAULT_HEIGHT_PERCENT,
  getSmartPanelHeight,
  getRenderedPanelLayout,
  getPanelLeft,
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
import { selectAnswerWindow } from "./answer-window";
import {
  answerSnapshotsChanged,
  findAnswerAtAnchor,
  findHeadingAtAnchor,
  nextTocScrollTop,
  snapshotAnswers,
  type AnswerSnapshot
} from "./outline-tracking";
import {
  type AnswerMetadata,
  MESSAGE_TIME_READY_EVENT,
  MESSAGE_TIME_REQUEST_EVENT,
  MESSAGE_TIME_RESPONSE_EVENT,
  formatAnswerTime,
  getAnswerHeaderText,
  normalizeMessageTime,
  normalizePrompt
} from "../shared/answer-metadata";
import {
  ASSISTANT_SELECTOR,
  MESSAGE_SELECTOR,
  TURN_SELECTOR,
  USER_SELECTOR,
  getMessageId,
  getMessageRole,
  getTurnIndex
} from "../shared/chatgpt-dom";

const ROOT_ID = "gpt-reader-root";
const READER_OWNER = Symbol.for("gpt-toc-peng:active-reader");
const HIDDEN_ROUND_ATTR = "data-gpt-reader-hidden-round";
const ROUND_LIMIT_BANNER_ID = "gpt-reader-round-limit-banner";
const WIDTH_STORAGE_KEY = "gptReaderPanelWidth";
const POSITION_STORAGE_KEY = "gptReaderPanelPosition";
const HEIGHT_STORAGE_KEY = "gptReaderPanelHeight";
const UI_STORAGE_KEY = "gptReaderUiState";
const DEFAULT_PANEL_WIDTH = 296;
const MIN_PANEL_WIDTH = 24;
const NARROW_PANEL_WIDTH = 128;
const MAX_PANEL_WIDTH = 440;
const COLLAPSED_RAIL_WIDTH = 32;
const PANEL_EDGE_MARGIN = 8;
const DEFAULT_PANEL_HEIGHT = 680;
const MIN_PANEL_HEIGHT = 320;
const MIN_FIXED_PANEL_HEIGHT = 72;
const SCAN_DEBOUNCE_MS = 120;
const SCAN_MAX_WAIT_MS = 1000;
const ACTIVE_ANCHOR_RATIO = 0.48;
const SCROLL_INTEGRITY_CHECK_MS = 350;
const SCROLL_VISIBILITY_CHECK_MS = 1500;
const POST_SCROLL_CHECK_MS = 450;
const MIN_MEANINGFUL_LIST_OVERFLOW = 16;
const MESSAGE_TIME_REQUEST_INTERVAL_MS = 2000;

type PanelUiState = {
  width?: number;
  lastReadableWidth?: number;
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
  container: HTMLElement | null;
  turnIndex: number | null;
  sequence: number;
};

type JumpOrigin = {
  answerId: string | null;
  headingId: string | null;
  clickedHeading: { id: string; answerId: string; text: string } | null;
  scrollContainer: HTMLElement | null;
  scrollTop: number;
  forcedVisibleAnswerId: string | null;
  promptJumpAnswerId: string | null;
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
  private listContent: HTMLElement | null = null;
  private listResizeObserver: ResizeObserver | null = null;
  private smartHeightFrame: number | null = null;
  private collapsedRailMarkers: HTMLElement | null = null;
  private settings: TocSettings = DEFAULT_SETTINGS;
  private savedSettings: TocSettings = DEFAULT_SETTINGS;
  private outlines: AnswerOutline[] = [];
  private displayOutlines: AnswerOutline[] = [];
  private cachedAnswers = new Map<string, CachedAnswer>();
  private answerMetadata = new Map<string, AnswerMetadata>();
  private promptTextCache = new WeakMap<HTMLElement, string>();
  private dirtyPrompts = new Set<HTMLElement>();
  private timeRequestAttempts = new Map<string, { count: number; lastAt: number; element: Element }>();
  private pendingTimeRequests = new Map<string, string>();
  private nextTimeRequestId = 0;
  private nextCachedAnswerSequence = 0;
  private cachedConversationPath = location.pathname;
  private answerSnapshots: AnswerSnapshot[] = [];
  private allHeadings: HeadingInfo[] = [];
  private hiddenRoundContainers = new Set<HTMLElement>();
  private pageScrollContainers = new Set<HTMLElement>();
  private activeScrollContainer: HTMLElement | null = null;
  private expandedAnswerIds = new Set<string>();
  private collapsedAnswerIds = new Set<string>();
  private currentHeadingId: string | null = null;
  private currentAnswerId: string | null = null;
  private mutationObserver: MutationObserver | null = null;
  private dirtyAnswerElements = new Set<HTMLElement>();
  private structuralScanPending = false;
  private scanTimer: number | null = null;
  private scanMaxTimer: number | null = null;
  private activeFrame: number | null = null;
  private postScrollTimer: number | null = null;
  private lastIntegrityCheck = -Infinity;
  private lastVisibilityCheck = -Infinity;
  private clickedHeading: { id: string; answerId: string; text: string } | null = null;
  private promptJumpAnswerId: string | null = null;
  private jumpGeneration = 0;
  private jumpInProgress = false;
  private forcedVisibleAnswerId: string | null = null;
  private exposeRoundsDuringSeek = false;
  private manualListBrowsing = false;
  private extraAnswersBefore = 0;
  private extraAnswersAfter = 0;
  private answerWindowKey = "";
  private panelWidth = DEFAULT_PANEL_WIDTH;
  private lastReadableWidth = DEFAULT_PANEL_WIDTH;
  private lastMeasuredSmartHeight = DEFAULT_PANEL_HEIGHT;
  private panelHeight = DEFAULT_PANEL_HEIGHT;
  private heightMode: PanelHeightMode = "smart";
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
  private promptPreview: PromptPreviewController | null = null;
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
    const ownerDocument = document as Document & { [READER_OWNER]?: ChatGptReader };
    ownerDocument[READER_OWNER]?.dispose();
    ownerDocument[READER_OWNER] = this;
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
    if (this.root && this.list) {
      this.promptPreview = new PromptPreviewController({
        root: this.root,
        list: this.list,
        getPrompt: (answerId) => {
          const metadata = this.answerMetadata.get(answerId);
          return metadata?.fullPrompt || metadata?.prompt;
        },
        onOpen: () => this.panelDisclosure?.beginInteraction(),
        onClose: () => this.panelDisclosure?.endInteraction()
      });
    }
    this.bindEvents();
    document.addEventListener(MESSAGE_TIME_RESPONSE_EVENT, this.handleMessageTimeResponse);
    document.addEventListener(MESSAGE_TIME_READY_EVENT, this.handleMessageTimeReady);
    this.observePage();
    this.render();
    this.scan();
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

  private dispose(): void {
    this.jumpGeneration += 1;
    this.jumpInProgress = false;
    this.mutationObserver?.disconnect();
    this.listResizeObserver?.disconnect();
    this.panelDisclosure?.dispose();
    this.promptPreview?.dispose();
    this.unsubscribeSettings?.();
    for (const container of this.pageScrollContainers) {
      container.removeEventListener("scroll", this.handlePageScroll);
    }
    if (this.scanTimer !== null) window.clearTimeout(this.scanTimer);
    if (this.scanMaxTimer !== null) window.clearTimeout(this.scanMaxTimer);
    if (this.postScrollTimer !== null) window.clearTimeout(this.postScrollTimer);
    if (this.smartHeightFrame !== null) window.cancelAnimationFrame(this.smartHeightFrame);
    if (this.activeFrame !== null) window.cancelAnimationFrame(this.activeFrame);
    window.removeEventListener("scroll", this.handlePageScroll);
    window.removeEventListener("resize", this.handleWindowResize);
    window.removeEventListener("pointermove", this.dragPanel);
    window.removeEventListener("pointerup", this.stopDrag);
    window.removeEventListener("pointercancel", this.stopDrag);
    window.removeEventListener("pointermove", this.resizePanel);
    window.removeEventListener("pointerup", this.stopResize);
    window.removeEventListener("pointercancel", this.stopResize);
    window.removeEventListener("pointermove", this.resizePanelHeight);
    window.removeEventListener("pointerup", this.stopHeightResize);
    window.removeEventListener("pointercancel", this.stopHeightResize);
    document.removeEventListener("scroll", this.handleDocumentScroll, true);
    document.removeEventListener("wheel", this.handleUserPageNavigation, true);
    document.removeEventListener("touchstart", this.handleUserPageNavigation, true);
    document.removeEventListener("pointerdown", this.handleUserPageNavigation, true);
    document.removeEventListener("keydown", this.handleUserPageNavigation, true);
    document.removeEventListener(MESSAGE_TIME_RESPONSE_EVENT, this.handleMessageTimeResponse);
    document.removeEventListener(MESSAGE_TIME_READY_EVENT, this.handleMessageTimeReady);
    this.restoreHiddenRounds();
    this.root?.remove();
  }

  private ensureShell(): void {
    const existing = document.getElementById(ROOT_ID);
    if (existing?.querySelector("[data-gpt-reader-direction]")) {
      this.root = existing;
      this.list = existing.querySelector<HTMLElement>("[data-gpt-reader-list]");
      this.listContent = existing.querySelector<HTMLElement>("[data-gpt-reader-list-content]");
      this.collapsedRailMarkers = existing.querySelector<HTMLElement>(
        "[data-gpt-reader-collapsed-markers]"
      );
      this.applyPanelWidth();
      this.applyPanelHeight();
      this.applyPanelDirection();
      this.applyPanelPosition();
      this.applyPanelPresentation();
      this.syncPanelHeightControls();
      this.observeListHeight();
      return;
    }

    existing?.remove();
    const root = createPanelShell();

    document.body.append(root);
    this.root = root;
    this.list = root.querySelector<HTMLElement>("[data-gpt-reader-list]");
    this.listContent = root.querySelector<HTMLElement>("[data-gpt-reader-list-content]");
    this.collapsedRailMarkers = root.querySelector<HTMLElement>(
      "[data-gpt-reader-collapsed-markers]"
    );
    this.applyPanelWidth();
    this.applyPanelHeight();
    this.applyPanelDirection();
    this.applyPanelPosition();
    this.applyPanelPresentation();
    this.syncPanelHeightControls();
    this.observeListHeight();
  }

  private observeListHeight(): void {
    if (!this.listContent || typeof ResizeObserver === "undefined") return;
    this.listResizeObserver?.disconnect();
    this.listResizeObserver = new ResizeObserver(() => this.scheduleSmartHeight());
    this.listResizeObserver.observe(this.listContent);
  }

  private scheduleSmartHeight(): void {
    if (this.smartHeightFrame !== null) return;
    this.smartHeightFrame = window.requestAnimationFrame(() => {
      this.smartHeightFrame = null;
      if (this.heightMode === "smart") this.applyPanelPosition();
      if (this.list) {
        this.list.classList.toggle(
          "gpt-reader-list-scrollable",
          this.list.scrollHeight > this.list.clientHeight + MIN_MEANINGFUL_LIST_OVERFLOW
        );
        this.root?.style.setProperty("--gpt-reader-list-height",
          `${Math.max(28, this.list.getBoundingClientRect().height)}px`);
        this.root?.style.setProperty("--gpt-reader-scrollbar-gutter",
          `${Math.max(0, this.list.offsetWidth - this.list.clientWidth)}px`);
      }
    });
  }

  private bindEvents(): void {
    this.root?.addEventListener("submit", (event) => {
      if (event.target instanceof HTMLElement && event.target.matches("[data-gpt-reader-settings]")) {
        event.preventDefault();
      }
    });
    this.list?.addEventListener("wheel", this.handleListWheel, { passive: false });
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
      if (event.target instanceof HTMLElement && event.target.matches("[data-gpt-reader-drag]")) {
        const movement: Record<string, [number, number]> = {
          ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]
        };
        const direction = movement[event.key];
        if (direction && this.root) {
          event.preventDefault();
          const step = event.shiftKey ? 20 : 5;
          const rect = this.root.getBoundingClientRect();
          this.panelPosition = this.constrainPanelPosition(
            rect.left + direction[0] * step, rect.top + direction[1] * step
          );
          if (this.heightMode === "viewport") {
            this.centerYRatio = normalizeCenterRatio(
              (this.panelPosition.top + rect.height / 2) / window.innerHeight
            );
          }
          this.applyPanelPosition();
          void this.savePanelUiState();
          return;
        }
      }
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
        if (this.panelWidth >= NARROW_PANEL_WIDTH) this.panelDisclosure?.setMode("expanded");
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
      const promptJump = target.closest<HTMLButtonElement>("[data-gpt-reader-prompt-jump]");

      if (headingButton) {
        this.scrollToHeading(
          headingButton.dataset.gptReaderHeading,
          headingButton.dataset.gptReaderAnswerId
        );
        return;
      }

      if (answerToggle) {
        this.promptPreview?.close();
        this.toggleAnswer(answerToggle.dataset.gptReaderAnswerId);
        return;
      }

      if (promptJump) {
        this.promptPreview?.close();
        this.scrollToPrompt(promptJump.dataset.gptReaderPromptJump);
        return;
      }

      const reveal = target.closest<HTMLButtonElement>("[data-gpt-reader-reveal]");
      if (reveal) {
        const side = reveal.dataset.gptReaderReveal;
        const count = side === "before"
          ? this.settings.visibleAnswersBeforeCurrent : this.settings.visibleAnswersAfterCurrent;
        if (side === "before") this.extraAnswersBefore += Math.max(1, count);
        if (side === "after") this.extraAnswersAfter += Math.max(1, count);
        this.manualListBrowsing = true;
        this.renderList();
        (this.listContent?.querySelector<HTMLButtonElement>(`[data-gpt-reader-reveal="${side}"]`) ??
          this.listContent?.querySelector<HTMLButtonElement>("[data-gpt-reader-reveal-collapse]"))
          ?.focus({ preventScroll: true });
        return;
      }

      if (target.closest("[data-gpt-reader-reveal-collapse]")) {
        this.extraAnswersBefore = 0;
        this.extraAnswersAfter = 0;
        this.manualListBrowsing = true;
        this.renderList();
        this.listContent?.querySelector<HTMLButtonElement>(".gpt-reader-answer.is-current [data-gpt-reader-answer-toggle]")
          ?.focus({ preventScroll: true });
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
        if (this.panelWidth < NARROW_PANEL_WIDTH) this.restoreReadableWidth();
        else this.panelDisclosure?.setMode("expanded");
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

      if (target.matches("[data-gpt-reader-before-count], [data-gpt-reader-after-count]")) {
        const value = Number(target.value);
        const before = target.matches("[data-gpt-reader-before-count]");
        if (target.value.trim() === "" || !Number.isInteger(value) || value < 0 || value > 20) {
          target.value = String(before ? this.settings.visibleAnswersBeforeCurrent : this.settings.visibleAnswersAfterCurrent);
          this.showPanelSaveStatus("显示数量无效：请输入 0–20 的整数", true);
        } else {
          void this.updateSettings(before
            ? { visibleAnswersBeforeCurrent: value } : { visibleAnswersAfterCurrent: value });
        }
      }

      if (target.matches("[data-gpt-reader-wrap-titles]")) {
        void this.updateSettings({ wrapLongTitles: target.checked });
      }

      if (target.matches("[data-gpt-reader-height-mode]")) {
        this.setHeightMode(target.value === "smart" ? "smart" : target.value === "viewport" ? "viewport" : "fixed");
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
      const observedDocument = this.root?.ownerDocument;
      if (!observedDocument?.defaultView || typeof window === "undefined") return;
      const PageElement = observedDocument.defaultView.Element;
      let relevant = observedDocument.location.pathname !== this.cachedConversationPath;
      if (relevant) this.structuralScanPending = true;
      // ChatGPT may replace body children after the content script runs.
      // Reattach the existing shell so its event listeners and local UI state survive.
      if (this.root && !this.root.isConnected && observedDocument.body) {
        observedDocument.body.append(this.root);
        this.structuralScanPending = true;
        relevant = true;
      }
      for (const mutation of mutations) {
        if (this.root?.contains(mutation.target)) continue;
        const target = mutation.target instanceof PageElement
          ? mutation.target : mutation.target.parentElement;
        if (!target) continue;
        if (mutation.type === "childList" && [...mutation.addedNodes, ...mutation.removedNodes]
          .some((node) => node instanceof PageElement &&
            (node.matches(MESSAGE_SELECTOR) || node.querySelector(MESSAGE_SELECTOR)))) {
          this.structuralScanPending = true;
          relevant = true;
          continue;
        }
        const answer = target.closest<HTMLElement>(ASSISTANT_SELECTOR);
        if (answer) {
          this.dirtyAnswerElements.add(answer);
          relevant = true;
          continue;
        }
        const user = target.closest<HTMLElement>(USER_SELECTOR);
        if (user) {
          this.dirtyPrompts.add(user);
          relevant = true;
        }
      }
      if (relevant) this.queueScan();
    });
    this.mutationObserver.observe(document.documentElement, {
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
      if (settings.maxVisibleRounds !== this.settings.maxVisibleRounds) {
        this.forcedVisibleAnswerId = null;
        this.exposeRoundsDuringSeek = false;
        this.jumpGeneration += 1;
        this.jumpInProgress = false;
        this.showJumpStatus(null);
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
    if (!this.structuralScanPending && this.dirtyAnswerElements.size === 0 &&
      this.dirtyPrompts.size === 0) return;
    const dirtyAnswers = this.structuralScanPending ? undefined : new Set(this.dirtyAnswerElements);
    this.structuralScanPending = false;
    this.dirtyAnswerElements.clear();
    this.scan(false, dirtyAnswers);
  };

  private scan(forceRender = false, dirtyAnswers?: Set<HTMLElement>): void {
    this.structuralScanPending = false;
    this.dirtyAnswerElements.clear();
    if (location.pathname !== this.cachedConversationPath) {
      dirtyAnswers = undefined;
      this.cachedConversationPath = location.pathname;
      this.cachedAnswers.clear();
      this.answerMetadata.clear();
      this.promptTextCache = new WeakMap();
      this.dirtyPrompts.clear();
      this.timeRequestAttempts.clear();
      this.pendingTimeRequests.clear();
      this.nextCachedAnswerSequence = 0;
      this.forcedVisibleAnswerId = null;
      this.exposeRoundsDuringSeek = false;
      this.clickedHeading = null;
      this.promptJumpAnswerId = null;
      this.jumpGeneration += 1;
      this.jumpInProgress = false;
      this.showJumpStatus(null);
    }
    const previousOutlines = this.outlines;
    const previousDisplayOutlines = this.displayOutlines;
    const previousAnswerId = this.currentAnswerId;
    const previousHeadingId = this.currentHeadingId;
    this.applyRoundLimit();
    const canUpdateIncrementally = dirtyAnswers !== undefined &&
      [...dirtyAnswers].every((answer) => answer.isConnected &&
        this.answerSnapshots.some((snapshot) => snapshot.element === answer));
    const answerElements = canUpdateIncrementally
      ? this.answerSnapshots.map((snapshot) => snapshot.element) : this.collectAnswerElements();
    if (canUpdateIncrementally) {
      const changed = new Map([...dirtyAnswers!].map((answer) => [ensureAnswerId(answer), answer]));
      const existing = new Map(this.outlines.map((outline) => [outline.id, outline]));
      for (const [id, answer] of changed) {
        const outline = extractAnswerOutlines([answer])[0];
        if (outline) existing.set(id, outline);
        else existing.delete(id);
      }
      this.outlines = answerElements.map((element) => existing.get(ensureAnswerId(element)))
        .filter((outline): outline is AnswerOutline => Boolean(outline));
      const changedSnapshots = new Map(snapshotAnswers([...changed.values()])
        .map((snapshot) => [snapshot.element, snapshot]));
      this.answerSnapshots = this.answerSnapshots.map((snapshot) =>
        changedSnapshots.get(snapshot.element) ?? snapshot);
    } else {
      this.refreshPageScrollListeners(answerElements);
      this.outlines = extractAnswerOutlines(answerElements);
      this.answerSnapshots = snapshotAnswers(answerElements);
    }
    const metadataChanged = this.refreshAnswerCache(answerElements);
    if (!canUpdateIncrementally) this.requestMessageTimes();
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
      metadataChanged ||
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

  private refreshAnswerCache(answerElements: HTMLElement[]): boolean {
    const metadataChanged = this.refreshPromptMetadata();

    for (const outline of this.outlines) {
      const container = this.getMessageContainer(outline.element as HTMLElement);
      const previous = this.cachedAnswers.get(outline.id);
      this.cachedAnswers.set(outline.id, {
        outline: { ...outline, label: getAnswerHeaderText(this.answerMetadata.get(outline.id)) },
        container,
        turnIndex: getTurnIndex(container) ?? previous?.turnIndex ?? null,
        sequence: previous?.sequence ?? this.nextCachedAnswerSequence++
      });
    }

    const liveIds = new Set(this.outlines.map((outline) => outline.id));
    const mountedIds = new Set(answerElements.map(ensureAnswerId));
    for (const [id, answer] of this.cachedAnswers) {
      if ((mountedIds.has(id) && !liveIds.has(id)) ||
        (!answer.container?.isConnected && answer.turnIndex === null && id.startsWith("gpt-reader-answer-local-"))) {
        this.cachedAnswers.delete(id);
        continue;
      }
      if (!liveIds.has(id) && !answer.outline.element.isConnected &&
        !answer.outline.element.hasAttribute("data-gpt-reader-cache-placeholder")) {
        const placeholder = document.createElement("div");
        placeholder.setAttribute("data-gpt-reader-cache-placeholder", "");
        answer.outline = {
          ...answer.outline,
          element: placeholder,
          headings: answer.outline.headings.map((heading) => ({
            ...heading,
            element: placeholder
          }))
        };
      }
      if (!answer.container?.isConnected) answer.container = null;
    }

    this.displayOutlines = [...this.cachedAnswers.values()]
      .sort((left, right) => {
        if (left.turnIndex !== null && right.turnIndex !== null && left.turnIndex !== right.turnIndex) {
          return left.turnIndex - right.turnIndex;
        }
        if (!left.container?.isConnected || !right.container?.isConnected || left.container === right.container) {
          return left.sequence - right.sequence;
        }
        const position = left.container.compareDocumentPosition(right.container);
        if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
        return left.sequence - right.sequence;
      })
      .map((answer) => answer.outline);
    return metadataChanged;
  }

  private refreshPromptMetadata(): boolean {
    let latestUser: HTMLElement | null = null;
    let changed = false;
    for (const message of document.querySelectorAll<HTMLElement>(MESSAGE_SELECTOR)) {
      if (this.root?.contains(message)) continue;
      if (getMessageRole(message) === "user") {
        latestUser = message;
        continue;
      }
      const turn = this.getMessageContainer(message);
      const sameTurnUser = turn === message ? null :
        turn.querySelector<HTMLElement>(USER_SELECTOR);
      const user = sameTurnUser ?? latestUser;
      const answerId = ensureAnswerId(message);
      const previous = this.answerMetadata.get(answerId);
      if (!user) continue;
      const promptMessageId = getMessageId(user);
      const promptTurnIndex = getTurnIndex(this.getMessageContainer(user));
      let fullPrompt = this.promptTextCache.get(user);
      if (fullPrompt === undefined || this.dirtyPrompts.has(user)) {
        fullPrompt = (user.textContent ?? "").replace(/\s+/g, " ").trim();
        this.promptTextCache.set(user, fullPrompt);
      }
      if (previous?.fullPrompt === fullPrompt && previous.promptMessageId === promptMessageId &&
        previous.promptTurnIndex === promptTurnIndex) continue;
      this.answerMetadata.set(answerId, {
        createdAtMs: previous?.createdAtMs ?? null,
        prompt: normalizePrompt(fullPrompt),
        fullPrompt,
        promptMessageId,
        promptTurnIndex
      });
      changed = true;
    }
    this.dirtyPrompts.clear();
    return changed;
  }

  private handleMessageTimeReady = (): void => this.requestMessageTimes(true);

  private requestMessageTimes = (force = false): void => {
    if (location.pathname !== this.cachedConversationPath) return;
    const now = performance.now();
    const ids: string[] = [];
    for (const message of document.querySelectorAll<HTMLElement>(ASSISTANT_SELECTOR)) {
      const messageId = getMessageId(message);
      const createdAtMs = this.answerMetadata.get(ensureAnswerId(message))?.createdAtMs;
      if (!messageId || createdAtMs !== null && createdAtMs !== undefined) continue;
      const previous = this.timeRequestAttempts.get(messageId);
      const count = previous?.element === message ? previous.count : 0;
      if (count >= 3 || !force && previous?.element === message &&
        now - previous.lastAt < MESSAGE_TIME_REQUEST_INTERVAL_MS) continue;
      ids.push(messageId);
      this.timeRequestAttempts.set(messageId, { count: count + 1, lastAt: now, element: message });
      if (ids.length === 100) break;
    }
    if (ids.length === 0) return;
    const requestId = `toc-${++this.nextTimeRequestId}`;
    this.pendingTimeRequests.set(requestId, location.pathname);
    document.dispatchEvent(new CustomEvent(MESSAGE_TIME_REQUEST_EVENT, {
      detail: JSON.stringify({ requestId, ids })
    }));
  };

  private handleMessageTimeResponse = (event: Event): void => {
    let response: { requestId: string; entries: { id: string; createdAtMs: number }[] };
    try {
      response = JSON.parse((event as CustomEvent<string>).detail);
    } catch {
      return;
    }
    if (!response || typeof response.requestId !== "string" || !Array.isArray(response.entries)) return;
    const requestPath = this.pendingTimeRequests.get(response.requestId);
    this.pendingTimeRequests.delete(response.requestId);
    if (!requestPath || requestPath !== location.pathname) return;
    let changed = false;
    for (const entry of response.entries.slice(0, 100)) {
      if (typeof entry?.id !== "string" || typeof entry.createdAtMs !== "number") continue;
      const attempted = this.timeRequestAttempts.get(entry.id);
      if (!attempted || !attempted.element.isConnected ||
        getMessageId(attempted.element) !== entry.id) continue;
      const createdAtMs = normalizeMessageTime(entry.createdAtMs / 1000);
      if (createdAtMs === null) continue;
      const answerId = ensureAnswerId(attempted.element);
      const previous = this.answerMetadata.get(answerId);
      if (previous?.createdAtMs === createdAtMs) continue;
      this.answerMetadata.set(answerId, { ...previous, createdAtMs, prompt: previous?.prompt ?? "" });
      const cached = this.cachedAnswers.get(answerId);
      if (cached) cached.outline = { ...cached.outline, label: getAnswerHeaderText(this.answerMetadata.get(answerId)) };
      changed = true;
    }
    if (changed) this.renderList();
  };

  private sameOutlineStructure(previous: AnswerOutline[], next: AnswerOutline[]): boolean {
    return previous.length === next.length && previous.every((outline, index) => {
      const current = next[index];
      return outline.id === current.id &&
        outline.label === current.label &&
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
    this.activeScrollContainer = null;
    if (this.panelPosition) {
      this.applyPanelPosition();
    } else {
      this.applyPanelHeight();
    }
    this.scheduleSmartHeight();
    this.queueActiveUpdate();
  };

  private handleDocumentScroll = (event: Event): void => {
    if (this.root && event.target instanceof Node && this.root.contains(event.target)) {
      return;
    }

    this.handlePageScroll();
  };

  private handleListWheel = (event: WheelEvent): void => {
    this.manualListBrowsing = true;
    if (!this.list || this.list.scrollHeight > this.list.clientHeight + MIN_MEANINGFUL_LIST_OVERFLOW ||
      event.ctrlKey || Math.abs(event.deltaY) < 0.5 || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      return;
    }

    const container = this.getPageScrollContainer();
    if (!container) return;

    const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 :
      event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? container.clientHeight : 1;
    event.preventDefault();
    container.scrollBy({ top: event.deltaY * unit, behavior: "instant" });
  };

  private handlePageScroll = (): void => {
    if (location.pathname !== this.cachedConversationPath) {
      this.scan(true);
      return;
    }
    if (!this.jumpInProgress) this.manualListBrowsing = false;
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
      if (event.type === "wheel" || event.type === "touchstart" ||
        (event instanceof KeyboardEvent && this.isScrollKey(event))) {
        if (this.jumpInProgress) this.showJumpStatus(null);
        this.clickedHeading = null;
        this.promptJumpAnswerId = null;
        this.jumpGeneration += 1;
        this.jumpInProgress = false;
        this.manualListBrowsing = true;
      }
      return;
    }
    if (event instanceof KeyboardEvent && !this.isScrollKey(event)) {
      return;
    }

    if (this.jumpInProgress) this.showJumpStatus(null);
    this.clickedHeading = null;
    this.promptJumpAnswerId = null;
    this.jumpGeneration += 1;
    this.jumpInProgress = false;
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
    this.activeScrollContainer = answerElements[0]
      ? findNearestVerticalScrollContainer(answerElements[0]) : null;
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
  }

  private render(): void {
    if (!this.root) {
      return;
    }

    this.root.classList.toggle("is-disabled", !this.settings.enabled);
    syncPanelTitleWrapping(this.root, this.settings.wrapLongTitles);
    const opacity = this.settings.panelSurfaceOpacityPercent;
    if (opacity === null) {
      this.root.style.removeProperty("--gpt-reader-surface-alpha");
    } else {
      this.root.style.setProperty("--gpt-reader-surface-alpha", String(opacity / 100));
    }
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

    const beforeInput = this.root.querySelector<HTMLInputElement>("[data-gpt-reader-before-count]");
    if (beforeInput) beforeInput.value = String(this.settings.visibleAnswersBeforeCurrent);
    const afterInput = this.root.querySelector<HTMLInputElement>("[data-gpt-reader-after-count]");
    if (afterInput) afterInput.value = String(this.settings.visibleAnswersAfterCurrent);

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
      const isNarrow = this.panelWidth < NARROW_PANEL_WIDTH;
      railButton.setAttribute("aria-expanded", String(!isRail && !isNarrow));
      railButton.setAttribute("aria-label", isNarrow
        ? "恢复目录宽度" : "展开 ChatGPT 回答目录");
      railButton.title = isNarrow
        ? "恢复上次可读宽度" : isRail ? "点击固定展开目录" : "ChatGPT 回答目录已展开";
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
    if (!this.list || !this.listContent) {
      return;
    }

    if (!this.settings.enabled) {
      this.promptPreview?.close();
      this.listContent.replaceChildren();
      this.scheduleSmartHeight();
      return;
    }

    if (this.displayOutlines.length === 0 && this.currentAnswerId === null) {
      this.promptPreview?.close();
      const empty = document.createElement("p");
      empty.className = "gpt-reader-empty";
      empty.textContent = "当前回答还没有 Markdown 标题";
      this.listContent.replaceChildren(empty);
      this.scheduleSmartHeight();
      this.renderCollapsedRail();
      return;
    }

    const windowKey = `${location.pathname}:${this.currentAnswerId ?? ""}:${this.settings.visibleAnswersBeforeCurrent}:${this.settings.visibleAnswersAfterCurrent}`;
    if (windowKey !== this.answerWindowKey) {
      this.answerWindowKey = windowKey;
      this.extraAnswersBefore = 0;
      this.extraAnswersAfter = 0;
    }
    const orderedIds = this.displayOutlines.map((outline) => outline.id);
    const emptyCurrentId = this.currentAnswerId && !orderedIds.includes(this.currentAnswerId)
      ? this.currentAnswerId : null;
    if (emptyCurrentId) {
      orderedIds.splice(this.getEmptyCurrentInsertionIndex(), 0, emptyCurrentId);
    }
    const visibleWindow = selectAnswerWindow(
      orderedIds, this.currentAnswerId,
      this.settings.visibleAnswersBeforeCurrent,
      this.settings.visibleAnswersAfterCurrent,
      this.extraAnswersBefore,
      this.extraAnswersAfter
    );
    const outlineById = new Map(this.displayOutlines.map((outline) => [outline.id, outline]));
    const groups: HTMLElement[] = [];
    const existingGroups = new Map(
      Array.from(this.listContent.querySelectorAll<HTMLElement>(":scope > .gpt-reader-answer"))
        .map((group) => [group.dataset.gptReaderGroupId, group] as const)
    );
    visibleWindow.visibleIds.forEach((answerId) => {
      const outline = outlineById.get(answerId);
      const isCurrentAnswer = answerId === this.currentAnswerId;
      const group = existingGroups.get(answerId) ?? document.createElement("section");
      group.classList.add("gpt-reader-answer");
      group.dataset.gptReaderGroupId = answerId;
      group.classList.toggle("is-current", isCurrentAnswer);
      if (!outline) {
        const header = this.updateAnswerHeader(group, answerId, false, isCurrentAnswer, false);
        const empty = group.querySelector<HTMLElement>(".gpt-reader-answer-empty") ?? document.createElement("p");
        empty.className = "gpt-reader-answer-empty";
        empty.textContent = "当前回答暂无 Markdown 标题";
        this.reconcileChildren(group, [header, empty]);
        groups.push(group);
        return;
      }
      const isManuallyCollapsed = this.collapsedAnswerIds.has(outline.id);
      const isPinnedOpen = !this.settings.expandCurrentOnly || isCurrentAnswer;
      const isExpanded =
        !isManuallyCollapsed && (isPinnedOpen || this.expandedAnswerIds.has(outline.id));

      const header = this.updateAnswerHeader(group, outline.id, isExpanded, isCurrentAnswer);

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
        button.disabled = false;
        button.title = heading.text;
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
    const children: HTMLElement[] = [];
    if (visibleWindow.hiddenBefore > 0) {
      children.push(this.createRevealButton("before", visibleWindow.hiddenBefore));
    }
    children.push(...groups);
    if (visibleWindow.hiddenAfter > 0) {
      children.push(this.createRevealButton("after", visibleWindow.hiddenAfter));
    }
    if (this.extraAnswersBefore > 0 || this.extraAnswersAfter > 0) {
      const collapse = this.listContent.querySelector<HTMLButtonElement>(":scope > [data-gpt-reader-reveal-collapse]") ??
        document.createElement("button");
      collapse.type = "button";
      collapse.className = "gpt-reader-reveal-collapse";
      collapse.dataset.gptReaderRevealCollapse = "";
      collapse.textContent = "收起额外回答";
      children.push(collapse);
    }
    this.reconcileChildren(this.listContent, children);
    this.scheduleSmartHeight();
    if (this.manualListBrowsing) {
      this.list.scrollTop = previousScrollTop;
    }
    this.keepActiveHeadingInView();
    this.renderCollapsedRail();
    this.promptPreview?.refresh();
  }

  private updateAnswerHeader(
    group: HTMLElement,
    answerId: string,
    isExpanded: boolean,
    isCurrentAnswer: boolean,
    canExpand = true
  ): HTMLElement {
    const header = group.querySelector<HTMLElement>(":scope > .gpt-reader-answer-title") ??
      document.createElement("div");
    header.className = "gpt-reader-answer-title";
    header.classList.toggle("is-collapsed", !isExpanded);
    let toggle = header.querySelector<HTMLButtonElement>("[data-gpt-reader-answer-toggle]");
    if (!toggle) {
      toggle = document.createElement("button");
      toggle.type = "button";
      toggle.dataset.gptReaderAnswerToggle = "";
      toggle.innerHTML = `<span class="gpt-reader-answer-caret" aria-hidden="true"></span><time class="gpt-reader-answer-time"></time><span class="gpt-reader-answer-time-fallback">回答</span>`;
      header.append(toggle);
    }
    toggle.dataset.gptReaderAnswerId = answerId;
    toggle.disabled = !canExpand;
    toggle.setAttribute("aria-expanded", String(isExpanded));
    if (isCurrentAnswer) toggle.setAttribute("aria-current", "true");
    else toggle.removeAttribute("aria-current");
    const caret = toggle.querySelector<HTMLElement>(".gpt-reader-answer-caret");
    if (caret && caret.dataset.expanded !== String(isExpanded)) {
      caret.innerHTML = getAnswerChevronIcon(isExpanded);
      caret.dataset.expanded = String(isExpanded);
    }
    const metadata = this.answerMetadata.get(answerId);
    const time = toggle.querySelector<HTMLTimeElement>(".gpt-reader-answer-time");
    const fallback = toggle.querySelector<HTMLElement>(".gpt-reader-answer-time-fallback");
    if (time) {
      const hasTime = metadata?.createdAtMs !== null && metadata?.createdAtMs !== undefined;
      time.hidden = !hasTime;
      if (fallback) fallback.hidden = hasTime;
      time.textContent = hasTime ? formatAnswerTime(metadata!.createdAtMs!) : "";
      if (hasTime) time.dateTime = new Date(metadata!.createdAtMs!).toISOString();
      else time.removeAttribute("datetime");
    }
    toggle.setAttribute("aria-label", `${isExpanded ? "折叠" : "展开"}${time?.textContent || "回答"}`);
    toggle.removeAttribute("title");

    let prompt = header.querySelector<HTMLButtonElement>("[data-gpt-reader-prompt-jump]");
    if (!prompt) {
      prompt = document.createElement("button");
      prompt.type = "button";
      prompt.className = "gpt-reader-answer-prompt";
      prompt.dataset.gptReaderPromptJump = "";
      header.append(prompt);
    }
    prompt.dataset.gptReaderPromptJump = answerId;
    prompt.disabled = !metadata?.prompt;
    const promptLabel = metadata?.prompt || "暂无提问";
    if (prompt.textContent !== promptLabel) prompt.textContent = promptLabel;
    prompt.removeAttribute("title");
    prompt.setAttribute("aria-label", metadata?.prompt
      ? `跳转到提问：${metadata.prompt}` : "提问暂不可用");

    header.querySelector("em")?.remove();
    return header;
  }

  private getEmptyCurrentInsertionIndex(): number {
    const active = this.answerSnapshots.find((snapshot) => snapshot.id === this.currentAnswerId)?.element;
    if (!active) return this.displayOutlines.length;
    const currentIndex = getTurnIndex(this.getMessageContainer(active));
    const nextIndex = this.displayOutlines.findIndex((outline) => {
      const cached = this.cachedAnswers.get(outline.id);
      if (currentIndex !== null && cached?.turnIndex !== null && cached?.turnIndex !== undefined) {
        return cached.turnIndex > currentIndex;
      }
      const other = cached?.container;
      return Boolean(other?.isConnected && active.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    return nextIndex < 0 ? this.displayOutlines.length : nextIndex;
  }

  private createRevealButton(side: "before" | "after", count: number): HTMLButtonElement {
    const button = this.listContent?.querySelector<HTMLButtonElement>(
      `:scope > [data-gpt-reader-reveal="${side}"]`
    ) ?? document.createElement("button");
    button.type = "button";
    button.className = "gpt-reader-reveal";
    button.dataset.gptReaderReveal = side;
    button.textContent = side === "before" ? `更早 ${count} 轮` : `更晚 ${count} 轮`;
    return button;
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

  private keepActiveHeadingInView(forceAlignment = false): void {
    if (!this.list || this.manualListBrowsing && !forceAlignment) {
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

  private resolvePromptElement(answerId: string): HTMLElement | null {
    const metadata = this.answerMetadata.get(answerId);
    if (!metadata?.prompt) return null;
    const users = Array.from(document.querySelectorAll<HTMLElement>(USER_SELECTOR));
    if (metadata.promptMessageId) {
      const byId = users.find((user) => getMessageId(user) === metadata.promptMessageId);
      if (byId) return byId;
    }
    if (metadata.promptTurnIndex !== null && metadata.promptTurnIndex !== undefined) {
      const byTurn = users.find((user) =>
        getTurnIndex(this.getMessageContainer(user)) === metadata.promptTurnIndex &&
        normalizePrompt(user.textContent ?? "") === metadata.prompt
      );
      if (byTurn) return byTurn;
    }
    if (metadata.promptMessageId || metadata.promptTurnIndex !== null &&
      metadata.promptTurnIndex !== undefined) return null;
    const matching = users.filter((user) => normalizePrompt(user.textContent ?? "") === metadata.prompt);
    return matching.length === 1 ? matching[0] : null;
  }

  private scrollToPrompt(answerId: string | undefined): void {
    if (!answerId || !this.answerMetadata.get(answerId)?.prompt) {
      this.showJumpStatus("对应提问暂不可用");
      return;
    }
    const scrollContainer = this.getPageScrollContainer();
    const origin: JumpOrigin = {
      answerId: this.currentAnswerId,
      headingId: this.currentHeadingId,
      clickedHeading: this.clickedHeading,
      promptJumpAnswerId: this.promptJumpAnswerId,
      scrollContainer,
      scrollTop: scrollContainer?.scrollTop ?? window.scrollY,
      forcedVisibleAnswerId: this.forcedVisibleAnswerId
    };
    const previousAnswerId = this.currentAnswerId;
    this.currentAnswerId = answerId;
    this.currentHeadingId = null;
    this.clickedHeading = null;
    this.promptJumpAnswerId = answerId;
    this.jumpInProgress = true;
    this.manualListBrowsing = true;
    const jumpGeneration = ++this.jumpGeneration;
    this.showJumpStatus("正在定位提问…");
    void this.completePromptJump(answerId, jumpGeneration, location.href, origin);
    if (previousAnswerId !== answerId) this.renderList();
    else this.syncActiveHeading(origin.headingId);
  }

  private async completePromptJump(
    answerId: string,
    jumpGeneration: number,
    pageUrl: string,
    origin: JumpOrigin
  ): Promise<void> {
    const isCancelled = (): boolean =>
      jumpGeneration !== this.jumpGeneration || location.href !== pageUrl;
    let target = this.resolvePromptElement(answerId);
    let succeeded = false;
    let failure = "对应提问尚未载入，请稍后重试";
    try {
      if (target?.closest(`[${HIDDEN_ROUND_ATTR}="true"]`)) {
        this.forcedVisibleAnswerId = answerId;
        this.scan(true);
        target = this.resolvePromptElement(answerId);
      }
      if (!target) {
        const container = this.cachedAnswers.get(answerId)?.container;
        if (container?.isConnected) {
          if (container.closest(`[${HIDDEN_ROUND_ATTR}="true"]`)) {
            this.exposeRoundsDuringSeek = true;
            this.scan(true);
          }
          scrollElementNearViewport(container);
          for (let attempt = 0; attempt < 8 && !target && !isCancelled(); attempt += 1) {
            await new Promise((resolve) => window.setTimeout(resolve, 100));
            target = this.resolvePromptElement(answerId);
          }
        }
      }
      if (!target && !isCancelled()) {
        target = await this.seekUnmountedTarget(
          answerId, () => this.resolvePromptElement(answerId), isCancelled,
          this.answerMetadata.get(answerId)?.promptTurnIndex, -1
        );
      }
      if (!target || isCancelled()) return;
      if (this.exposeRoundsDuringSeek) {
        this.forcedVisibleAnswerId = answerId;
        this.exposeRoundsDuringSeek = false;
        this.scan(true);
        target = this.resolvePromptElement(answerId);
        if (!target) return;
      }
      const result = await scrollHeadingToPercent(target, 0, {
        resolveHeading: () => this.resolvePromptElement(answerId), isCancelled
      });
      if (isCancelled()) return;
      if (!result.element?.isConnected ||
        (result.status !== "reached" && result.status !== "clamped")) {
        failure = "提问定位未完成，请重试";
        return;
      }
      this.scan();
      const currentElement = this.resolvePromptElement(answerId) ?? result.element;
      this.headingHighlighter.show(currentElement, {
        enabled: this.settings.targetHighlightEnabled,
        durationMs: this.settings.targetHighlightDurationMs,
        resolveElement: () => this.resolvePromptElement(answerId),
        observeRoot: this.cachedAnswers.get(answerId)?.container ?? document.body,
        overlayHost: this.root ?? document.body
      });
      succeeded = true;
    } catch {
      failure = "提问定位失败，请重试";
    } finally {
      if (isCancelled()) return;
      this.jumpInProgress = false;
      if (succeeded) {
        this.showJumpStatus(null);
      } else {
        this.exposeRoundsDuringSeek = false;
        this.forcedVisibleAnswerId = origin.forcedVisibleAnswerId;
        this.clickedHeading = origin.clickedHeading;
        this.promptJumpAnswerId = origin.promptJumpAnswerId;
        this.currentAnswerId = origin.answerId;
        this.currentHeadingId = origin.headingId;
        this.scan(true);
        this.restoreJumpOrigin(origin);
        this.showJumpStatus(failure);
        this.queueActiveUpdate();
      }
    }
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
      this.showJumpStatus("目标标题已变化，请刷新目录后重试");
      return;
    }

    const scrollContainer = this.getPageScrollContainer();
    const origin: JumpOrigin = {
      answerId: this.currentAnswerId,
      headingId: this.currentHeadingId,
      clickedHeading: this.clickedHeading,
      scrollContainer,
      scrollTop: scrollContainer?.scrollTop ?? window.scrollY,
      forcedVisibleAnswerId: this.forcedVisibleAnswerId,
      promptJumpAnswerId: this.promptJumpAnswerId
    };
    const previousAnswerId = this.currentAnswerId;
    const previousHeadingId = this.currentHeadingId;
    this.currentHeadingId = heading.id;
    this.currentAnswerId = heading.answerId;
    this.clickedHeading = { id: heading.id, answerId: heading.answerId, text: heading.text };
    this.promptJumpAnswerId = null;
    this.jumpInProgress = true;
    this.manualListBrowsing = true;
    const jumpGeneration = ++this.jumpGeneration;
    const pageUrl = location.href;
    this.showJumpStatus("正在定位标题…");
    void this.completeHeadingJump(heading, jumpGeneration, pageUrl, origin);
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
    pageUrl: string,
    origin: JumpOrigin
  ): Promise<void> {
    const isCancelled = (): boolean =>
      jumpGeneration !== this.jumpGeneration || location.href !== pageUrl;
    let failure = "目标尚未载入，请稍后重试";
    let succeeded = false;
    let target = this.resolveHeadingElement(heading);
    try {
      if (!target) {
        const mounted = this.findMountedAnswer(heading.answerId);
        if (mounted?.closest(`[${HIDDEN_ROUND_ATTR}="true"]`)) {
          this.forcedVisibleAnswerId = heading.answerId;
          this.scan(true);
          target = this.resolveHeadingElement(heading);
        }
      }
      if (!target) {
        const container = this.cachedAnswers.get(heading.answerId)?.container;
        if (container?.isConnected) {
          if (container.closest(`[${HIDDEN_ROUND_ATTR}="true"]`)) {
            this.exposeRoundsDuringSeek = true;
            this.scan(true);
          }
          scrollElementNearViewport(container);
          for (let attempt = 0; attempt < 8 && !target && !isCancelled(); attempt += 1) {
            await new Promise((resolve) => window.setTimeout(resolve, 100));
            target = this.resolveHeadingElement(heading);
          }
        }
      }
      if (!target && !isCancelled()) {
        target = await this.seekUnmountedTarget(
          heading.answerId, () => this.resolveHeadingElement(heading), isCancelled
        );
      }
      if (!target || isCancelled()) return;

      if (this.exposeRoundsDuringSeek) {
        this.forcedVisibleAnswerId = heading.answerId;
        this.exposeRoundsDuringSeek = false;
        this.scan(true);
        target = this.resolveHeadingElement(heading);
        if (!target) return;
      }
      const result = await scrollHeadingToPercent(target, this.settings.headingScrollPositionPercent, {
        resolveHeading: () => this.resolveHeadingElement(heading),
        isCancelled
      });
      if (isCancelled()) return;
      if (!result.element?.isConnected ||
        (result.status !== "reached" && result.status !== "clamped")) {
        failure = "定位未完成，请重试";
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
      succeeded = true;
    } catch {
      failure = "定位失败，请重试";
    } finally {
      if (isCancelled()) return;
      this.jumpInProgress = false;
      if (succeeded) {
        this.showJumpStatus(null);
      } else {
        this.exposeRoundsDuringSeek = false;
        this.forcedVisibleAnswerId = origin.forcedVisibleAnswerId;
        this.clickedHeading = origin.clickedHeading;
        this.promptJumpAnswerId = origin.promptJumpAnswerId;
        this.currentAnswerId = origin.answerId;
        this.currentHeadingId = origin.headingId;
        this.scan(true);
        this.restoreJumpOrigin(origin);
        this.showJumpStatus(failure);
        this.queueActiveUpdate();
      }
    }
  }

  private restoreJumpOrigin(origin: JumpOrigin): void {
    if (origin.scrollContainer?.isConnected) {
      origin.scrollContainer.scrollTop = origin.scrollTop;
    } else if (!origin.scrollContainer && Math.abs(window.scrollY - origin.scrollTop) > 1) {
      window.scrollTo({ top: origin.scrollTop, behavior: "instant" });
    }
  }

  private getPageScrollContainer(): HTMLElement | null {
    if (this.activeScrollContainer?.isConnected) return this.activeScrollContainer;
    const answer = this.answerSnapshots.find((snapshot) => snapshot.element.isConnected)?.element ??
      this.collectAnswerElements()[0];
    this.activeScrollContainer = answer ? findNearestVerticalScrollContainer(answer) : null;
    return this.activeScrollContainer;
  }

  private findMountedAnswer(answerId: string): HTMLElement | null {
    return Array.from(document.querySelectorAll<HTMLElement>(ASSISTANT_SELECTOR)).find(
      (element) => ensureAnswerId(element) === answerId
    ) ?? null;
  }

  private async seekUnmountedTarget(
    answerId: string,
    resolveTarget: () => HTMLElement | null,
    isCancelled: () => boolean,
    targetTurnIndex?: number | null,
    directionOnEqual: -1 | 1 = 1
  ): Promise<HTMLElement | null> {
    const targetIndex = targetTurnIndex ?? this.cachedAnswers.get(answerId)?.turnIndex;
    if (targetIndex === null || targetIndex === undefined) return null;
    this.exposeRoundsDuringSeek = true;
    this.scan(true);
    const scrollContainer = this.getPageScrollContainer();
    const deadline = performance.now() + 5000;
    let stalled = 0;
    let lastPosition = scrollContainer?.scrollTop ?? window.scrollY;
    for (let step = 0; step < 20 && performance.now() < deadline && !isCancelled(); step += 1) {
      const target = resolveTarget();
      if (target) return target;
      const mounted = this.collectAnswerElements()
        .map((element) => ({
          element,
          index: getTurnIndex(this.getMessageContainer(element))
        }))
        .filter((item): item is { element: HTMLElement; index: number } => item.index !== null);
      const nearest = mounted.sort((a, b) => Math.abs(a.index - targetIndex) - Math.abs(b.index - targetIndex))[0];
      if (!nearest) return null;
      const direction = targetIndex === nearest.index ? directionOnEqual :
        targetIndex < nearest.index ? -1 : 1;
      if (step === 0) scrollElementNearViewport(nearest.element, 50);
      const distance = Math.max(240, (scrollContainer?.clientHeight ?? window.innerHeight) * 0.8);
      if (scrollContainer) scrollContainer.scrollBy({ top: direction * distance, behavior: "instant" });
      else window.scrollBy({ top: direction * distance, behavior: "instant" });
      await new Promise((resolve) => window.setTimeout(resolve, 160));
      this.scan();
      const position = scrollContainer?.scrollTop ?? window.scrollY;
      stalled = Math.abs(position - lastPosition) < 1 ? stalled + 1 : 0;
      if (stalled >= 3) return null;
      lastPosition = position;
    }
    return resolveTarget();
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
    if (!answer) return null;
    const elements = Array.from(answer.querySelectorAll<HTMLElement>(headingSelector));
    const sameHeading = (element: HTMLElement): boolean =>
      element.textContent?.replace(/\s+/g, " ").trim() === heading.text &&
      Number(element.tagName.slice(1)) === heading.depth && isVisibleHeading(element);
    const original = elements[heading.order];
    if (original && sameHeading(original)) return original;
    const matches = elements.filter(sameHeading);
    return matches.length === 1 ? matches[0] : null;
  }

  private toggleSettings(): void {
    const settings = this.root?.querySelector<HTMLElement>("[data-gpt-reader-settings]");
    const toggle = this.root?.querySelector<HTMLButtonElement>("[data-gpt-reader-settings-toggle]");
    if (!settings || !toggle) {
      return;
    }

    const nextOpen = settings.hidden !== false;
    settings.hidden = !nextOpen;
    this.root?.classList.toggle("is-settings-open", nextOpen);
    toggle.setAttribute("aria-expanded", String(nextOpen));
    if (nextOpen) this.positionSettingsPopover();
  }

  private positionSettingsPopover(): void {
    const panel = this.root?.querySelector<HTMLElement>(".gpt-reader-panel");
    const header = this.root?.querySelector<HTMLElement>(".gpt-reader-header");
    const settings = this.root?.querySelector<HTMLElement>("[data-gpt-reader-settings]");
    if (!panel || !header || !settings || settings.hidden) return;
    const panelRect = panel.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    const availableBelow = window.innerHeight - headerRect.bottom - PANEL_EDGE_MARGIN;
    const availableAbove = headerRect.top - PANEL_EDGE_MARGIN;
    const openAbove = availableBelow < 240 && availableAbove > availableBelow;
    const maximum = Math.max(0, Math.min(420, (openAbove ? availableAbove : availableBelow) - 6));
    settings.style.maxHeight = `${maximum}px`;
    settings.style.top = openAbove ? "auto" : `${headerRect.bottom - panelRect.top + 6}px`;
    settings.style.bottom = openAbove ? `${panelRect.bottom - headerRect.top + 6}px` : "auto";
  }

  private async updateSettings(patch: Partial<TocSettings>): Promise<void> {
    const revision = ++this.settingsRevision;
    if (patch.maxVisibleRounds !== undefined) {
      this.forcedVisibleAnswerId = null;
      this.exposeRoundsDuringSeek = false;
      this.jumpGeneration += 1;
      this.jumpInProgress = false;
      this.showJumpStatus(null);
    }
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

  private applyRoundLimit(): void {
    this.restoreHiddenRounds();

    if (!this.settings.enabled || this.settings.maxVisibleRounds <= 0 || this.exposeRoundsDuringSeek) {
      this.removeRoundLimitBanner();
      return;
    }

    const rounds = this.getConversationRounds();
    if (rounds.length <= this.settings.maxVisibleRounds) {
      this.removeRoundLimitBanner();
      return;
    }

    const visibleRounds = new Set(rounds.slice(-this.settings.maxVisibleRounds));
    if (this.forcedVisibleAnswerId) {
      const mounted = this.findMountedAnswer(this.forcedVisibleAnswerId);
      const forcedRound = rounds.find((round) => mounted && round.containers.some((container) => container.contains(mounted)));
      if (forcedRound) visibleRounds.add(forcedRound);
    }
    const firstVisibleContainer = rounds.find((round) => visibleRounds.has(round))?.containers[0];

    for (const round of rounds) {
      if (visibleRounds.has(round)) continue;
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

      const role = getMessageRole(message);
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
    if (this.promptJumpAnswerId) {
      return { answerId: this.promptJumpAnswerId, headingId: null };
    }
    if (this.jumpInProgress && this.clickedHeading) {
      return { answerId: this.clickedHeading.answerId, headingId: this.clickedHeading.id };
    }
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
        cached?.container?.isConnected &&
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
    const container = this.getPageScrollContainer();
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
    this.heightMode = storedState.heightMode === "smart" || storedState.heightMode === "viewport" || storedState.heightMode === "fixed"
      ? storedState.heightMode
      : height === undefined ? "smart" : "fixed";
    this.heightPercent = normalizeHeightPercent(storedState.heightPercent);
    this.centerYRatio = normalizeCenterRatio(storedState.centerYRatio);

    if (width !== undefined) {
      this.panelWidth = this.constrainPanelWidth(width);
    }
    const lastReadableWidth = this.readStoredNumber(storedState.lastReadableWidth);
    this.lastReadableWidth = lastReadableWidth !== undefined &&
      lastReadableWidth >= NARROW_PANEL_WIDTH
      ? this.constrainPanelWidth(lastReadableWidth)
      : this.panelWidth >= NARROW_PANEL_WIDTH ? this.panelWidth : DEFAULT_PANEL_WIDTH;

    this.panelPosition = normalizePanelPosition(storedState.position) ?? legacyPosition;

    if (height !== undefined) {
      this.panelHeight = Math.max(MIN_FIXED_PANEL_HEIGHT, height);
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
      lastReadableWidth: Math.round(this.lastReadableWidth),
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
    this.root?.classList.toggle("is-ultra-narrow", this.panelWidth < NARROW_PANEL_WIDTH);
    const rail = this.root?.querySelector<HTMLButtonElement>("[data-gpt-reader-collapsed-rail]");
    if (rail) {
      rail.setAttribute("aria-label", this.panelWidth < NARROW_PANEL_WIDTH
        ? "恢复目录宽度" : "展开 ChatGPT 回答目录");
      rail.title = this.panelWidth < NARROW_PANEL_WIDTH ? "恢复目录宽度" : "展开目录";
    }
  }

  private restoreReadableWidth(): void {
    this.panelWidth = this.constrainPanelWidth(this.lastReadableWidth);
    this.applyPanelWidth();
    this.applyPanelPosition();
    this.scheduleSmartHeight();
    this.panelDisclosure?.setMode("expanded");
    void this.savePanelUiState();
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
    return Math.min(maxHeight, Math.max(Math.min(MIN_FIXED_PANEL_HEIGHT, maxHeight), height));
  }

  private applyPanelHeight(): void {
    this.applyPanelPosition();
  }

  private syncPanelHeightControls(): void {
    const mode = this.root?.querySelector<HTMLSelectElement>("[data-gpt-reader-height-mode]");
    const percent = this.root?.querySelector<HTMLInputElement>("[data-gpt-reader-height-percent]");
    const field = this.root?.querySelector<HTMLElement>("[data-gpt-reader-height-percent-field]");
    const label = this.root?.querySelector<HTMLElement>("[data-gpt-reader-height-percent-label]");
    const hint = this.root?.querySelector<HTMLElement>("[data-gpt-reader-height-percent-hint]");
    if (mode) mode.value = this.heightMode;
    if (percent) percent.value = String(this.heightPercent);
    if (field) field.hidden = this.heightMode === "fixed";
    if (label) label.textContent = this.heightMode === "smart" ? "智能高度上限" : "窗口高度比例";
    if (hint) hint.textContent = this.heightMode === "smart"
      ? "目录较短时自动收紧；较长时最多占窗口的该比例。"
      : "范围 30%–90%；窗口较小时会自动限制到可见范围。";
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
        if (mode === "fixed" && this.heightMode === "smart") {
          this.panelHeight = rect.height;
        }
      }
    }
    this.heightMode = mode;
    this.applyPanelPosition();
    this.scheduleSmartHeight();
    this.syncPanelHeightControls();
    void this.savePanelUiState();
  }

  private setHeightPercent(value: number): void {
    const nextPercent = normalizeHeightPercent(value);
    if (nextPercent !== this.heightPercent) {
      this.heightPercent = nextPercent;
      this.applyPanelPosition();
      this.scheduleSmartHeight();
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
          this.heightMode === "smart" ? this.getMeasuredSmartHeight() : this.panelHeight,
          COLLAPSED_RAIL_WIDTH,
          this.panelExpandDirection,
          window.innerWidth,
          window.innerHeight,
          PANEL_EDGE_MARGIN
        );
    this.root.style.setProperty("--gpt-reader-left", `${rendered.left}px`);
    this.root.style.setProperty("--gpt-reader-top", `${rendered.top}px`);
    this.root.style.setProperty("--gpt-reader-height", `${rendered.height}px`);
    const panelLeft = getPanelLeft(
      rendered.left, this.panelWidth, COLLAPSED_RAIL_WIDTH, this.panelExpandDirection
    );
    this.root.dataset.panelSide = panelLeft + this.panelWidth / 2 >= window.innerWidth / 2
      ? "right" : "left";
    this.positionSettingsPopover();
  }

  private getMeasuredSmartHeight(): number {
    if (this.panelWidth < NARROW_PANEL_WIDTH) return this.lastMeasuredSmartHeight;
    const contentHeight = this.listContent?.getBoundingClientRect().height || this.listContent?.scrollHeight || 0;
    const headerHeight = this.root?.querySelector<HTMLElement>(".gpt-reader-header")?.offsetHeight || 36;
    const body = this.root?.querySelector<HTMLElement>(".gpt-reader-body");
    const bodyStyles = body ? getComputedStyle(body) : null;
    const measuredBodySpacing = bodyStyles
      ? (Number.parseFloat(bodyStyles.paddingTop) || 0) +
        (Number.parseFloat(bodyStyles.paddingBottom) || 0) : 0;
    const bodySpacing = measuredBodySpacing || 8;
    const status = this.root?.querySelector<HTMLElement>("[data-gpt-reader-jump-status]");
    const statusHeight = status && !status.hidden ? status.offsetHeight : 0;
    this.lastMeasuredSmartHeight = getSmartPanelHeight(window.innerHeight, this.heightPercent, contentHeight,
      headerHeight + bodySpacing + statusHeight, PANEL_EDGE_MARGIN);
    return this.lastMeasuredSmartHeight;
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
    if (this.panelWidth >= NARROW_PANEL_WIDTH) this.lastReadableWidth = this.panelWidth;
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
    this.scheduleSmartHeight();
  };

  private stopResize = (): void => {
    this.isResizing = false;
    if (this.panelWidth >= NARROW_PANEL_WIDTH) this.lastReadableWidth = this.panelWidth;
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
    if (this.heightMode === "smart") {
      this.heightMode = "fixed";
      this.panelHeight = this.resizeStartHeight;
      this.syncPanelHeightControls();
    }
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
    this.scheduleSmartHeight();
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
