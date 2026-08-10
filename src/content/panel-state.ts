export type PanelMode = "expanded" | "rail";
export type PanelPresentation = PanelMode | "peek";

type PanelDisclosureOptions = {
  mode: PanelMode;
  hoverEnabled: boolean;
  onModeChange?: (mode: PanelMode) => void;
  onPresentationChange?: (presentation: PanelPresentation) => void;
};

const ENTER_DELAY_MS = 120;
const LEAVE_DELAY_MS = 280;

export class PanelDisclosureController {
  private mode: PanelMode;
  private hoverEnabled: boolean;
  private peeking = false;
  private focused = false;
  private enterTimer: number | null = null;
  private leaveTimer: number | null = null;
  private readonly onModeChange?: (mode: PanelMode) => void;
  private readonly onPresentationChange?: (presentation: PanelPresentation) => void;

  constructor(options: PanelDisclosureOptions) {
    this.mode = options.mode;
    this.hoverEnabled = options.hoverEnabled;
    this.onModeChange = options.onModeChange;
    this.onPresentationChange = options.onPresentationChange;
  }

  get presentation(): PanelPresentation {
    return this.mode === "rail" && this.peeking ? "peek" : this.mode;
  }

  get persistentMode(): PanelMode {
    return this.mode;
  }

  setMode(mode: PanelMode): void {
    this.clearTimers();
    const modeChanged = mode !== this.mode;
    const presentationChanged = this.presentation !== mode;
    this.mode = mode;
    this.peeking = false;

    if (modeChanged) {
      this.onModeChange?.(mode);
    }
    if (presentationChanged) {
      this.onPresentationChange?.(this.presentation);
    }
  }

  setHoverEnabled(enabled: boolean): void {
    this.hoverEnabled = enabled;
    if (!enabled) {
      this.closePeek();
    }
  }

  pointerEnter(): void {
    this.clearLeaveTimer();
    if (this.mode !== "rail" || this.peeking || !this.hoverEnabled || this.enterTimer !== null) {
      return;
    }

    this.enterTimer = window.setTimeout(() => {
      this.enterTimer = null;
      this.openPeek();
    }, ENTER_DELAY_MS);
  }

  pointerLeave(): void {
    this.clearEnterTimer();
    if (
      this.focused ||
      this.mode !== "rail" ||
      !this.peeking ||
      this.leaveTimer !== null
    ) {
      return;
    }

    this.leaveTimer = window.setTimeout(() => {
      this.leaveTimer = null;
      this.closePeek();
    }, LEAVE_DELAY_MS);
  }

  focusEnter(): void {
    this.focused = true;
    this.clearLeaveTimer();
    if (this.mode === "rail") {
      this.openPeek();
    }
  }

  focusLeave(): void {
    this.focused = false;
    this.pointerLeave();
  }

  escape(): void {
    if (this.mode === "rail") {
      this.closePeek();
    }
  }

  promote(): void {
    this.setMode("expanded");
  }

  dispose(): void {
    this.clearTimers();
  }

  private openPeek(): void {
    if (this.mode !== "rail" || this.peeking) {
      return;
    }
    this.peeking = true;
    this.onPresentationChange?.(this.presentation);
  }

  private closePeek(): void {
    this.clearTimers();
    if (!this.peeking) {
      return;
    }
    this.peeking = false;
    this.onPresentationChange?.(this.presentation);
  }

  private clearEnterTimer(): void {
    if (this.enterTimer !== null) {
      window.clearTimeout(this.enterTimer);
      this.enterTimer = null;
    }
  }

  private clearLeaveTimer(): void {
    if (this.leaveTimer !== null) {
      window.clearTimeout(this.leaveTimer);
      this.leaveTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearEnterTimer();
    this.clearLeaveTimer();
  }
}
