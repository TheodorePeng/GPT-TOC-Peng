import type { TargetHighlightDurationMs } from "../shared/settings";

type HighlightOptions = {
  enabled: boolean;
  durationMs: TargetHighlightDurationMs;
  resolveElement?: () => HTMLElement | null;
  observeRoot?: Node;
  overlayHost?: HTMLElement;
};

export class HeadingHighlighter {
  private overlay: HTMLElement | null = null;
  private observer: MutationObserver | null = null;
  private timer: number | null = null;
  private frame: number | null = null;
  private ownerDocument: Document | null = null;
  private ownerWindow: Window | null = null;
  private schedulePosition: (() => void) | null = null;

  show(element: HTMLElement, options: HighlightOptions): void {
    this.clear();
    if (!options.enabled) {
      return;
    }

    const ownerDocument = element.ownerDocument;
    const ownerWindow = ownerDocument.defaultView;
    if (!ownerWindow) {
      return;
    }
    const overlay = ownerDocument.createElement("div");
    overlay.className = "gpt-reader-target-overlay";
    overlay.setAttribute("aria-hidden", "true");
    overlay.style.setProperty("--gpt-reader-highlight-duration", `${options.durationMs}ms`);
    (options.overlayHost ?? ownerDocument.body).append(overlay);
    this.overlay = overlay;
    this.ownerDocument = ownerDocument;
    this.ownerWindow = ownerWindow;

    const position = (): void => {
      if (this.overlay !== overlay) {
        return;
      }
      const target = options.resolveElement ? options.resolveElement() : element;
      if (!target?.isConnected) {
        overlay.hidden = true;
        return;
      }
      const rect = target.getBoundingClientRect();
      const left = Math.max(0, rect.left);
      const top = Math.max(0, rect.top);
      const right = Math.min(ownerWindow.innerWidth, rect.right);
      const bottom = Math.min(ownerWindow.innerHeight, rect.bottom);
      if (right <= left || bottom <= top) {
        overlay.hidden = true;
        return;
      }
      overlay.hidden = false;
      overlay.style.left = `${left}px`;
      overlay.style.top = `${top}px`;
      overlay.style.width = `${right - left}px`;
      overlay.style.height = `${bottom - top}px`;
    };
    this.schedulePosition = () => {
      if (this.frame !== null) {
        return;
      }
      this.frame = ownerWindow.requestAnimationFrame(() => {
        this.frame = null;
        position();
      });
    };

    ownerDocument.addEventListener("scroll", this.schedulePosition, true);
    ownerWindow.addEventListener("resize", this.schedulePosition);
    if (options.resolveElement) {
      this.observer = new MutationObserver(this.schedulePosition);
      this.observer.observe(options.observeRoot ?? element.ownerDocument.body, {
        childList: true,
        subtree: true
      });
    }
    position();
    this.timer = ownerWindow.setTimeout(() => this.clear(), options.durationMs);
  }

  clear(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.schedulePosition) {
      this.ownerDocument?.removeEventListener("scroll", this.schedulePosition, true);
      this.ownerWindow?.removeEventListener("resize", this.schedulePosition);
      this.schedulePosition = null;
    }
    if (this.frame !== null) {
      this.ownerWindow?.cancelAnimationFrame(this.frame);
      this.frame = null;
    }
    if (this.timer !== null) {
      this.ownerWindow?.clearTimeout(this.timer);
      this.timer = null;
    }
    this.overlay?.remove();
    this.overlay = null;
    this.ownerDocument = null;
    this.ownerWindow = null;
  }
}
