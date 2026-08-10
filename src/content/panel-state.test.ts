import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PanelDisclosureController } from "./panel-state";

describe("PanelDisclosureController", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("persists only manual expanded and rail mode changes", () => {
    const modes: string[] = [];
    const controller = new PanelDisclosureController({
      mode: "expanded",
      hoverEnabled: true,
      onModeChange: (mode) => modes.push(mode)
    });

    controller.setMode("rail");
    controller.pointerEnter();
    vi.advanceTimersByTime(120);

    expect(controller.presentation).toBe("peek");
    expect(modes).toEqual(["rail"]);

    controller.promote();
    expect(controller.presentation).toBe("expanded");
    expect(modes).toEqual(["rail", "expanded"]);
  });

  it("opens after 120 ms and closes after 280 ms without flicker on re-entry", () => {
    const controller = new PanelDisclosureController({ mode: "rail", hoverEnabled: true });

    controller.pointerEnter();
    vi.advanceTimersByTime(119);
    expect(controller.presentation).toBe("rail");
    vi.advanceTimersByTime(1);
    expect(controller.presentation).toBe("peek");

    controller.pointerLeave();
    vi.advanceTimersByTime(200);
    controller.pointerEnter();
    vi.advanceTimersByTime(100);
    expect(controller.presentation).toBe("peek");

    controller.pointerLeave();
    vi.advanceTimersByTime(280);
    expect(controller.presentation).toBe("rail");
  });

  it("disables pointer peek while retaining keyboard focus and escape behavior", () => {
    const controller = new PanelDisclosureController({ mode: "rail", hoverEnabled: false });

    controller.pointerEnter();
    vi.advanceTimersByTime(120);
    expect(controller.presentation).toBe("rail");

    controller.focusEnter();
    expect(controller.presentation).toBe("peek");
    controller.escape();
    expect(controller.presentation).toBe("rail");
  });

  it("keeps a keyboard preview open until focus leaves the component", () => {
    const controller = new PanelDisclosureController({ mode: "rail", hoverEnabled: true });

    controller.focusEnter();
    controller.pointerLeave();
    vi.advanceTimersByTime(280);
    expect(controller.presentation).toBe("peek");

    controller.focusLeave();
    vi.advanceTimersByTime(280);
    expect(controller.presentation).toBe("rail");
  });
});
