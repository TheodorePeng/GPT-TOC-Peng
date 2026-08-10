import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../shared/settings";
import { createPopupMarkup } from "./view";

describe("popup settings view", () => {
  it("renders title wrapping and synchronized percentage controls", () => {
    const host = document.createElement("div");
    host.innerHTML = createPopupMarkup({
      ...DEFAULT_SETTINGS,
      headingScrollPositionPercent: 37
    });

    const wrap = host.querySelector<HTMLInputElement>("[data-setting-wrap-titles]");
    const range = host.querySelector<HTMLInputElement>("[data-setting-scroll-position-range]");
    const number = host.querySelector<HTMLInputElement>("[data-setting-scroll-position-number]");
    const output = host.querySelector<HTMLOutputElement>("[data-setting-scroll-position-output]");

    expect(wrap?.checked).toBe(true);
    expect([range?.min, range?.max, range?.step, range?.value]).toEqual(["0", "100", "1", "37"]);
    expect([number?.min, number?.max, number?.step, number?.value]).toEqual(["0", "100", "1", "37"]);
    expect(output?.textContent).toBe("37%");
    expect(host.textContent).toContain("0% 顶部（原行为）");
    expect(host.textContent).toContain("100% 底部");
    expect(host.textContent).toContain("实际位置可能受滚动边界限制");
  });
});
