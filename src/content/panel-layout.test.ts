import { describe, expect, it } from "vitest";
import {
  constrainPanelAnchorLeft,
  getPanelLeft,
  getResizedPanelWidth,
  normalizePanelExpandDirection
} from "./panel-layout";

describe("panel expansion layout", () => {
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

  it("mirrors horizontal resize deltas around the rail anchor", () => {
    expect(getResizedPanelWidth(296, 40, "right")).toBe(336);
    expect(getResizedPanelWidth(296, 40, "left")).toBe(256);
  });
});
