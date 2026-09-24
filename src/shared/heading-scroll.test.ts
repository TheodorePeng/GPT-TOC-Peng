import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HEADING_SCROLL_TOP_INSET_PX,
  calculateHeadingTargetTop,
  findNearestVerticalScrollContainer,
  scrollHeadingToPercent
} from "./heading-scroll";

const setSize = (element: HTMLElement, clientHeight: number, scrollHeight: number): void => {
  Object.defineProperties(element, {
    clientHeight: { configurable: true, value: clientHeight },
    scrollHeight: { configurable: true, value: scrollHeight }
  });
};

describe("heading scroll geometry", () => {
  it("maps 0, 25, 50, and 100 percent across the usable viewport", () => {
    const input = {
      containerTop: 10,
      containerHeight: 900,
      headingHeight: 40,
      topInset: HEADING_SCROLL_TOP_INSET_PX
    };

    expect(calculateHeadingTargetTop({ ...input, percent: 0 })).toBe(106);
    expect(calculateHeadingTargetTop({ ...input, percent: 25 })).toBe(297);
    expect(calculateHeadingTargetTop({ ...input, percent: 50 })).toBe(488);
    expect(calculateHeadingTargetTop({ ...input, percent: 100 })).toBe(870);
  });

  it("keeps an oversized heading at the safe top", () => {
    expect(
      calculateHeadingTargetTop({
        containerTop: 20,
        containerHeight: 180,
        headingHeight: 140,
        topInset: HEADING_SCROLL_TOP_INSET_PX,
        percent: 100
      })
    ).toBe(116);
  });
});

describe("heading scroll container adapter", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("selects the nearest eligible vertical scroller", () => {
    const outer = document.createElement("div");
    const inner = document.createElement("div");
    const heading = document.createElement("h2");
    outer.style.overflowY = "auto";
    inner.style.overflowY = "scroll";
    setSize(outer, 500, 1000);
    setSize(inner, 300, 700);
    inner.append(heading);
    outer.append(inner);
    document.body.append(outer);

    expect(findNearestVerticalScrollContainer(heading)).toBe(inner);
  });

  it("reacquires a replaced heading and lands at distinct 0, 50, and 100 percent positions", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("innerHeight", 900);
    const scroller = document.createElement("div");
    const heading = document.createElement("h2");
    scroller.style.overflowY = "auto";
    setSize(scroller, 900, 5000);
    scroller.append(heading);
    document.body.append(scroller);

    const replacement = document.createElement("h2");
    const scrollIntoView = vi.fn(() => {
      scroller.scrollTop = 800;
      heading.replaceWith(replacement);
    });
    const scrollBy = vi.fn(({ top }: ScrollToOptions) => {
      scroller.scrollTop += top ?? 0;
    });
    Object.defineProperty(heading, "scrollIntoView", { configurable: true, value: scrollIntoView });
    Object.defineProperty(scroller, "scrollBy", { configurable: true, value: scrollBy });
    vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ y: 0, width: 500, height: 900 })
    );
    vi.spyOn(replacement, "getBoundingClientRect").mockImplementation(() =>
      DOMRect.fromRect({ y: 96 - (scroller.scrollTop - 800), width: 400, height: 40 })
    );
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 16)
    );

    Object.defineProperty(replacement, "scrollIntoView", {
      configurable: true,
      value: vi.fn(() => { scroller.scrollTop = 800; })
    });
    for (const [percent, expectedTop] of [[0, 96], [50, 478], [100, 860]]) {
      const landing = scrollHeadingToPercent(heading, percent, {
        resolveHeading: () => scroller.querySelector("h2")
      });
      await vi.advanceTimersByTimeAsync(2000);
      const result = await landing;

      expect(result.status).toBe("reached");
      expect(result.element).toBe(replacement);
      expect(result.actualTop).toBeCloseTo(expectedTop, 0);
      expect(Math.abs((result.actualTop ?? 0) - (result.targetTop ?? 0))).toBeLessThan(12);
    }
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "instant", block: "start" });
    expect(scrollBy).toHaveBeenCalled();
  });

  it("safely ignores a heading removed before the deferred adjustment", () => {
    const heading = document.createElement("h2");
    const scrollIntoView = vi.fn();
    Object.defineProperty(heading, "scrollIntoView", { configurable: true, value: scrollIntoView });
    document.body.append(heading);
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    });

    scrollHeadingToPercent(heading, 25);
    heading.remove();

    expect(() => frame?.(0)).not.toThrow();
    expect(scrollIntoView).toHaveBeenCalledOnce();
  });
});
