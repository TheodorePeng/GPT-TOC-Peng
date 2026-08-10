import type { TargetHighlightDurationMs } from "../shared/settings";

type HighlightOptions = {
  enabled: boolean;
  durationMs: TargetHighlightDurationMs;
};

export class HeadingHighlighter {
  private activeElement: HTMLElement | null = null;
  private timer: number | null = null;

  show(element: HTMLElement, options: HighlightOptions): void {
    this.clear();
    if (!options.enabled) {
      return;
    }

    this.activeElement = element;
    element.style.setProperty("--gpt-reader-highlight-duration", `${options.durationMs}ms`);
    element.classList.add("gpt-reader-target-highlight");
    this.timer = window.setTimeout(() => this.clear(), options.durationMs);
  }

  clear(): void {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.activeElement) {
      this.activeElement.classList.remove("gpt-reader-target-highlight");
      this.activeElement.style.removeProperty("--gpt-reader-highlight-duration");
      this.activeElement = null;
    }
  }
}
