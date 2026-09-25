import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PromptPreviewController } from "./prompt-preview";

let root: HTMLElement;
let list: HTMLElement;
let header: HTMLElement;
let promptButton: HTMLButtonElement;
let controller: PromptPreviewController;
let promptText = "A full prompt\nwith a second line";
let onOpen: ReturnType<typeof vi.fn<() => void>>;
let onClose: ReturnType<typeof vi.fn<() => void>>;

const pointer = (type: string, target: Element, relatedTarget: EventTarget | null = null) => {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, "relatedTarget", { value: relatedTarget });
  target.dispatchEvent(event);
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 0));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
  document.body.innerHTML = `<div id="gpt-reader-root" data-expand-direction="left">
    <div data-gpt-reader-list><section data-gpt-reader-group-id="answer-1">
      <div class="gpt-reader-answer-title"><button data-gpt-reader-answer-toggle>今天 10:00</button>
      <button data-gpt-reader-prompt-jump>Question</button></div>
    </section></div></div>`;
  root = document.querySelector<HTMLElement>("#gpt-reader-root")!;
  list = root.querySelector<HTMLElement>("[data-gpt-reader-list]")!;
  header = root.querySelector<HTMLElement>(".gpt-reader-answer-title")!;
  promptButton = root.querySelector<HTMLButtonElement>("[data-gpt-reader-prompt-jump]")!;
  vi.spyOn(list, "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ x: 700, y: 20, width: 300, height: 500 }));
  vi.spyOn(header, "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ x: 700, y: 100, width: 300, height: 30 }));
  promptText = "A full prompt\nwith a second line";
  onOpen = vi.fn<() => void>();
  onClose = vi.fn<() => void>();
  controller = new PromptPreviewController({ root, list, getPrompt: () => promptText, onOpen, onClose });
});

afterEach(() => {
  controller.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("prompt preview", () => {
  it("opens quickly, reuses one preview, and stays open across the header and preview", () => {
    const toggle = header.querySelector("[data-gpt-reader-answer-toggle]")!;
    const preview = root.querySelector<HTMLElement>(".gpt-reader-prompt-preview")!;
    pointer("pointerover", toggle);
    vi.advanceTimersByTime(89);
    expect(preview.hidden).toBe(true);
    vi.advanceTimersByTime(1);
    expect(preview.hidden).toBe(false);
    expect(preview.textContent).toBe(promptText);
    expect(onOpen).toHaveBeenCalledOnce();
    pointer("pointerout", toggle, promptButton);
    pointer("pointerover", promptButton, toggle);
    vi.advanceTimersByTime(200);
    expect(preview.hidden).toBe(false);
    pointer("pointerout", promptButton, preview);
    vi.advanceTimersByTime(60);
    pointer("pointerover", preview, promptButton);
    vi.advanceTimersByTime(200);
    expect(preview.hidden).toBe(false);
    pointer("pointerout", preview);
    vi.advanceTimersByTime(140);
    expect(preview.hidden).toBe(true);
    expect(onClose).toHaveBeenCalledOnce();
    expect(root.querySelectorAll(".gpt-reader-prompt-preview")).toHaveLength(1);
  });

  it("shows on keyboard focus and closes on Escape", () => {
    const preview = root.querySelector<HTMLElement>(".gpt-reader-prompt-preview")!;
    promptButton.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(preview.hidden).toBe(false);
    expect(promptButton.getAttribute("aria-describedby")).toBe(preview.id);
    promptButton.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    expect(preview.hidden).toBe(true);
    expect(promptButton.hasAttribute("aria-describedby")).toBe(false);
  });

  it("updates visible content without replacing the preview and closes when the card disappears", () => {
    pointer("pointerover", header);
    vi.advanceTimersByTime(90);
    const preview = root.querySelector<HTMLElement>(".gpt-reader-prompt-preview")!;
    promptText = "Updated question";
    controller.refresh();
    vi.advanceTimersByTime(0);
    expect(preview.textContent).toBe("Updated question");
    header.remove();
    controller.refresh();
    vi.advanceTimersByTime(0);
    expect(preview.hidden).toBe(true);
  });

  it("does not open when no prompt is known", () => {
    promptText = "";
    pointer("pointerover", header);
    vi.advanceTimersByTime(200);
    expect(root.querySelector<HTMLElement>(".gpt-reader-prompt-preview")?.hidden).toBe(true);
  });
});
