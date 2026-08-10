import { describe, expect, it } from "vitest";
import { createPanelShell, syncPanelDirectionControls } from "./panel-shell";

describe("compact panel shell", () => {
  it("uses an icon-only toolbar without redundant title or heading count", () => {
    const root = createPanelShell();
    const header = root.querySelector<HTMLElement>(".gpt-reader-header");
    const buttons = [
      root.querySelector<HTMLButtonElement>("[data-gpt-reader-direction]"),
      root.querySelector<HTMLButtonElement>("[data-gpt-reader-settings-toggle]"),
      root.querySelector<HTMLButtonElement>("[data-gpt-reader-collapse]")
    ];

    expect(header?.textContent).not.toContain("回答目录");
    expect(header?.textContent).not.toContain("标题");
    expect(buttons.every((button) => Boolean(button?.querySelector("svg")))).toBe(true);
    expect(buttons.map((button) => button?.getAttribute("aria-label"))).toEqual([
      "当前向右展开，点击改为向左展开",
      "打开快捷设置",
      "收起为左侧刻度轨道"
    ]);
  });

  it("updates direction and collapse descriptions without replacing the toolbar", () => {
    const root = createPanelShell();
    const directionButton = root.querySelector<HTMLButtonElement>("[data-gpt-reader-direction]");

    syncPanelDirectionControls(root, "left");

    expect(root.dataset.expandDirection).toBe("left");
    expect(directionButton?.getAttribute("aria-label")).toBe(
      "当前向左展开，点击改为向右展开"
    );
    expect(
      root.querySelector("[data-gpt-reader-collapse]")?.getAttribute("aria-label")
    ).toBe("收起为右侧刻度轨道");
  });
});
