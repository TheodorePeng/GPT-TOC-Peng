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

  it("defers the percentage adjustment until after the initial start scroll", () => {
    const scroller = document.createElement("div");
    const heading = document.createElement("h2");
    scroller.style.overflowY = "auto";
    setSize(scroller, 900, 1800);
    scroller.append(heading);
    document.body.append(scroller);

    const scrollIntoView = vi.fn();
    const scrollBy = vi.fn();
    Object.defineProperty(heading, "scrollIntoView", { configurable: true, value: scrollIntoView });
    Object.defineProperty(scroller, "scrollBy", { configurable: true, value: scrollBy });
    vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue({
      top: 10,
      bottom: 910,
      left: 0,
      right: 500,
      width: 500,
      height: 900,
      x: 0,
      y: 10,
      toJSON: () => ({})
    });
    vi.spyOn(heading, "getBoundingClientRect").mockReturnValue({
      top: 106,
      bottom: 146,
      left: 0,
      right: 400,
      width: 400,
      height: 40,
      x: 0,
      y: 106,
      toJSON: () => ({})
    });
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });

    scrollHeadingToPercent(heading, 50);

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
    expect(scrollBy).not.toHaveBeenCalled();
    frames[0](0);
    expect(scrollBy).toHaveBeenCalledWith({ behavior: "auto", top: -382 });
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
