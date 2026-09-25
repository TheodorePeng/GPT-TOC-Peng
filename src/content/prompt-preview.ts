type PromptPreviewOptions = {
  root: HTMLElement;
  list: HTMLElement;
  getPrompt: (answerId: string) => string | undefined;
  onOpen?: () => void;
  onClose?: () => void;
};

const OPEN_DELAY_MS = 90;
const CLOSE_DELAY_MS = 140;
const VIEWPORT_MARGIN = 8;
const PREVIEW_GAP = 10;

export class PromptPreviewController {
  private readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private readonly getPrompt: (answerId: string) => string | undefined;
  private readonly onOpen?: () => void;
  private readonly onClose?: () => void;
  private readonly preview: HTMLElement;
  private anchor: HTMLElement | null = null;
  private openTimer: number | null = null;
  private closeTimer: number | null = null;
  private frame: number | null = null;
  private pointerInHeader = false;
  private pointerInPreview = false;
  private focusInPrompt = false;

  constructor(options: PromptPreviewOptions) {
    this.root = options.root;
    this.list = options.list;
    this.getPrompt = options.getPrompt;
    this.onOpen = options.onOpen;
    this.onClose = options.onClose;
    this.preview = document.createElement("div");
    this.preview.className = "gpt-reader-prompt-preview";
    this.preview.id = "gpt-reader-prompt-preview";
    this.preview.setAttribute("role", "tooltip");
    this.preview.hidden = true;
    this.root.append(this.preview);
    this.root.addEventListener("pointerover", this.handlePointerOver);
    this.root.addEventListener("pointerout", this.handlePointerOut);
    this.root.addEventListener("focusin", this.handleFocusIn);
    this.root.addEventListener("focusout", this.handleFocusOut);
    this.root.addEventListener("keydown", this.handleKeyDown);
    this.list.addEventListener("scroll", this.handleScroll, { passive: true });
    window.addEventListener("resize", this.handleResize, { passive: true });
  }

  private findHeader(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) return null;
    const header = target.closest<HTMLElement>(".gpt-reader-answer-title");
    return header && this.list.contains(header) ? header : null;
  }

  private setAnchor(header: HTMLElement, immediate: boolean): void {
    const answerId = header.closest<HTMLElement>("[data-gpt-reader-group-id]")?.dataset.gptReaderGroupId;
    if (!answerId || !this.getPrompt(answerId)) {
      this.close();
      return;
    }
    this.clearCloseTimer();
    if (this.anchor === header && !this.preview.hidden) return;
    this.clearOpenTimer();
    if (this.anchor !== header) this.close();
    this.anchor = header;
    this.pointerInHeader = true;
    if (immediate) this.open();
    else this.openTimer = window.setTimeout(() => {
      this.openTimer = null;
      this.open();
    }, OPEN_DELAY_MS);
  }

  private readonly handlePointerOver = (event: PointerEvent): void => {
    if (event.target instanceof Node && this.preview.contains(event.target)) {
      this.pointerInPreview = true;
      this.clearCloseTimer();
      return;
    }
    const header = this.findHeader(event.target);
    if (!header) return;
    this.pointerInHeader = true;
    this.setAnchor(header, false);
  };

  private readonly handlePointerOut = (event: PointerEvent): void => {
    const next = event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (event.target instanceof Node && this.preview.contains(event.target) && !this.preview.contains(next)) {
      this.pointerInPreview = false;
      this.scheduleClose();
      return;
    }
    const header = this.findHeader(event.target);
    if (header && !header.contains(next)) {
      this.pointerInHeader = false;
      this.scheduleClose();
    }
  };

  private readonly handleFocusIn = (event: FocusEvent): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.matches("[data-gpt-reader-prompt-jump]")) return;
    const header = this.findHeader(target);
    if (!header) return;
    this.focusInPrompt = true;
    this.setAnchor(header, true);
  };

  private readonly handleFocusOut = (event: FocusEvent): void => {
    if (!(event.target instanceof HTMLElement) || !event.target.matches("[data-gpt-reader-prompt-jump]")) return;
    this.focusInPrompt = false;
    this.scheduleClose();
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && !this.preview.hidden) {
      this.close();
      event.stopPropagation();
    }
  };

  private readonly handleScroll = (): void => {
    if (!this.preview.hidden) this.refresh();
  };

  private readonly handleResize = (): void => this.refresh();

  private scheduleClose(): void {
    if (this.pointerInHeader || this.pointerInPreview || this.focusInPrompt) return;
    this.clearOpenTimer();
    this.clearCloseTimer();
    this.closeTimer = window.setTimeout(() => {
      this.closeTimer = null;
      if (!this.pointerInHeader && !this.pointerInPreview && !this.focusInPrompt) this.close();
    }, CLOSE_DELAY_MS);
  }

  private open(): void {
    const answerId = this.anchor?.closest<HTMLElement>("[data-gpt-reader-group-id]")?.dataset.gptReaderGroupId;
    const prompt = answerId ? this.getPrompt(answerId) : undefined;
    if (!prompt || !this.anchor || !this.list.contains(this.anchor)) {
      this.close();
      return;
    }
    if (this.preview.textContent !== prompt) this.preview.textContent = prompt;
    const wasHidden = this.preview.hidden;
    this.preview.hidden = false;
    this.anchor.querySelector("[data-gpt-reader-prompt-jump]")?.setAttribute("aria-describedby", this.preview.id);
    if (wasHidden) this.onOpen?.();
    this.position();
  }

  refresh(): void {
    if (this.preview.hidden || this.frame !== null) return;
    this.frame = window.requestAnimationFrame(() => {
      this.frame = null;
      if (this.preview.hidden || !this.anchor || !this.list.contains(this.anchor)) {
        this.close();
        return;
      }
      const answerId = this.anchor.closest<HTMLElement>("[data-gpt-reader-group-id]")?.dataset.gptReaderGroupId;
      const prompt = answerId ? this.getPrompt(answerId) : undefined;
      if (!prompt) {
        this.close();
        return;
      }
      if (this.preview.textContent !== prompt) this.preview.textContent = prompt;
      this.position();
    });
  }

  private position(): void {
    if (!this.anchor) return;
    const anchor = this.anchor.getBoundingClientRect();
    const list = this.list.getBoundingClientRect();
    if (anchor.bottom < list.top || anchor.top > list.bottom) {
      this.close();
      return;
    }
    const width = Math.min(420, Math.max(220, window.innerWidth - VIEWPORT_MARGIN * 2));
    this.preview.style.maxWidth = `${width}px`;
    const previewWidth = Math.min(width, this.preview.offsetWidth || width);
    const outsideLeft = this.root.dataset.expandDirection === "left";
    const preferredLeft = outsideLeft
      ? anchor.left - previewWidth - PREVIEW_GAP
      : anchor.right + PREVIEW_GAP;
    const alternateLeft = outsideLeft
      ? anchor.right + PREVIEW_GAP
      : anchor.left - previewWidth - PREVIEW_GAP;
    const fits = (left: number) => left >= VIEWPORT_MARGIN && left + previewWidth <= window.innerWidth - VIEWPORT_MARGIN;
    const left = fits(preferredLeft) ? preferredLeft : fits(alternateLeft) ? alternateLeft :
      Math.max(VIEWPORT_MARGIN, Math.min(preferredLeft, window.innerWidth - previewWidth - VIEWPORT_MARGIN));
    const top = Math.max(VIEWPORT_MARGIN, Math.min(anchor.top,
      window.innerHeight - this.preview.offsetHeight - VIEWPORT_MARGIN));
    this.preview.style.left = `${left}px`;
    this.preview.style.top = `${top}px`;
  }

  close(): void {
    this.clearOpenTimer();
    this.clearCloseTimer();
    if (this.frame !== null) window.cancelAnimationFrame(this.frame);
    this.frame = null;
    if (this.anchor) this.anchor.querySelector("[data-gpt-reader-prompt-jump]")?.removeAttribute("aria-describedby");
    this.anchor = null;
    this.pointerInHeader = false;
    this.pointerInPreview = false;
    this.focusInPrompt = false;
    if (!this.preview.hidden) {
      this.preview.hidden = true;
      this.onClose?.();
    }
  }

  dispose(): void {
    this.close();
    this.root.removeEventListener("pointerover", this.handlePointerOver);
    this.root.removeEventListener("pointerout", this.handlePointerOut);
    this.root.removeEventListener("focusin", this.handleFocusIn);
    this.root.removeEventListener("focusout", this.handleFocusOut);
    this.root.removeEventListener("keydown", this.handleKeyDown);
    this.list.removeEventListener("scroll", this.handleScroll);
    window.removeEventListener("resize", this.handleResize);
    this.preview.remove();
  }

  private clearOpenTimer(): void {
    if (this.openTimer !== null) window.clearTimeout(this.openTimer);
    this.openTimer = null;
  }

  private clearCloseTimer(): void {
    if (this.closeTimer !== null) window.clearTimeout(this.closeTimer);
    this.closeTimer = null;
  }
}
