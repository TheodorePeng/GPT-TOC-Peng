import { describe, expect, it } from "vitest";
import {
  constrainPanelAnchorLeft,
  getPanelLeft,
  getRenderedPanelLayout,
  getSmartPanelHeight,
  getViewportPanelLayout,
  getResizedPanelWidth,
  normalizeCenterRatio,
  normalizeHeightPercent,
  normalizePanelExpandDirection,
  normalizePanelPosition
} from "./panel-layout";

describe("panel expansion layout", () => {
  it("shrinks to short content and caps long lists without a 320px floor", () => {
    expect(getSmartPanelHeight(1000, 65, 82, 56)).toBe(138);
    expect(getSmartPanelHeight(1000, 65, 1800, 56)).toBe(650);
    expect(getSmartPanelHeight(600, 30, 0, 56)).toBe(72);
  });
  it("normalizes missing and invalid stored directions to right", () => {
    expect(normalizePanelExpandDirection(undefined)).toBe("right");
    expect(normalizePanelExpandDirection("up")).toBe("right");
    expect(normalizePanelExpandDirection("left")).toBe("left");
  });

  it("positions the panel from a stable rail-left anchor", () => {
    expect(getPanelLeft(400, 296, 32, "right")).toBe(400);
    expect(getPanelLeft(400, 296, 32, "left")).toBe(136);
  });

  it("constrains the anchor so the expanded panel stays inside viewport margins", () => {
    expect(constrainPanelAnchorLeft(2, 296, 32, "right", 1000)).toBe(8);
    expect(constrainPanelAnchorLeft(900, 296, 32, "right", 1000)).toBe(696);
    expect(constrainPanelAnchorLeft(100, 296, 32, "left", 1000)).toBe(272);
    expect(constrainPanelAnchorLeft(990, 296, 32, "left", 1000)).toBe(960);
  });

  it("recovers an off-screen saved rail without changing the preferred position", () => {
    const preferred = Object.freeze({ left: 1456, top: 50 });
    const narrow = getRenderedPanelLayout(preferred, 265, 710, 32, "left", 1269, 1735);
    expect(narrow).toEqual({ left: 1229, top: 50, height: 710 });
    expect(getPanelLeft(narrow.left, 265, 32, "left") + 265).toBe(1261);

    const wide = getRenderedPanelLayout(preferred, 265, 710, 32, "left", 1600, 1735);
    expect(wide.left).toBe(1456);
    expect(preferred).toEqual({ left: 1456, top: 50 });
  });

  it("keeps both expansion directions inside a narrow viewport", () => {
    const preferred = { left: 1456, top: 50 };
    const right = getRenderedPanelLayout(preferred, 440, 710, 32, "right", 320, 900);
    const left = getRenderedPanelLayout(preferred, 440, 710, 32, "left", 320, 900);

    expect(right.left).toBe(8);
    expect(left.left).toBe(280);
    expect(getPanelLeft(left.left, 304, 32, "left")).toBe(8);
    expect(left.left + 32).toBe(312);
  });

  it("temporarily constrains top and height, then restores them in a tall viewport", () => {
    const preferred = Object.freeze({ left: 400, top: 900 });
    expect(getRenderedPanelLayout(preferred, 265, 710, 32, "left", 1600, 500)).toEqual({
      left: 400,
      top: 8,
      height: 484
    });
    expect(getRenderedPanelLayout(preferred, 265, 710, 32, "left", 1600, 1800)).toEqual({
      left: 400,
      top: 900,
      height: 710
    });
  });

  it("rejects malformed saved positions", () => {
    expect(normalizePanelPosition({ left: 1456, top: 50 })).toEqual({ left: 1456, top: 50 });
    expect(normalizePanelPosition({ left: Infinity, top: 50 })).toBeNull();
    expect(normalizePanelPosition({ left: 1456, top: NaN })).toBeNull();
    expect(normalizePanelPosition({ left: "1456", top: 50 })).toBeNull();
    expect(normalizePanelPosition(null)).toBeNull();
  });

  it("mirrors horizontal resize deltas around the rail anchor", () => {
    expect(getResizedPanelWidth(296, 40, "right")).toBe(336);
    expect(getResizedPanelWidth(296, 40, "left")).toBe(256);
  });

  it("centers a percentage-height panel and preserves its center across viewport sizes", () => {
    const tall = getViewportPanelLayout(400, 65, 0.5, 296, 32, "right", 1600, 1800, 320);
    const short = getViewportPanelLayout(400, 65, 0.5, 296, 32, "right", 1600, 800, 320);
    expect(tall).toEqual({ left: 400, top: 315, height: 1170 });
    expect(short).toEqual({ left: 400, top: 140, height: 520 });
    expect(tall.top + tall.height / 2).toBe(900);
    expect(short.top + short.height / 2).toBe(400);
  });

  it("clamps ratio and center while keeping a tiny viewport usable", () => {
    expect(normalizeHeightPercent(999)).toBe(90);
    expect(normalizeHeightPercent(NaN)).toBe(65);
    expect(normalizeCenterRatio(Infinity)).toBe(0.5);
    expect(getViewportPanelLayout(400, 30, 0.95, 296, 32, "left", 1600, 300, 320))
      .toEqual({ left: 400, top: 8, height: 284 });
  });
});
