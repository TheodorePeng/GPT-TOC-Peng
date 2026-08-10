import { describe, expect, it } from "vitest";
import {
  readHeadingScrollPositionInput,
  syncHeadingScrollPositionControls
} from "./scroll-position-control";

const createControls = (): HTMLElement => {
  const host = document.createElement("div");
  host.innerHTML = `
    <input data-setting-scroll-position-range type="range" />
    <input data-setting-scroll-position-number type="number" />
    <output data-setting-scroll-position-output></output>
  `;
  return host;
};

describe("popup heading position controls", () => {
  it("keeps the slider, numeric input, and output synchronized", () => {
    const host = createControls();

    syncHeadingScrollPositionControls(host, 42);

    expect(host.querySelector<HTMLInputElement>("[type=range]")?.value).toBe("42");
    expect(host.querySelector<HTMLInputElement>("[type=number]")?.value).toBe("42");
    expect(host.querySelector("output")?.textContent).toBe("42%");
  });

  it("restores the last saved value for empty input and clamps valid numbers", () => {
    expect(readHeadingScrollPositionInput("", 37)).toBe(37);
    expect(readHeadingScrollPositionInput("-4", 37)).toBe(0);
    expect(readHeadingScrollPositionInput("109", 37)).toBe(100);
    expect(readHeadingScrollPositionInput("26.7", 37)).toBe(27);
  });
});
