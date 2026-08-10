import { normalizeHeadingScrollPositionPercent } from "../shared/settings";

const RANGE_SELECTOR = "[data-setting-scroll-position-range]";
const NUMBER_SELECTOR = "[data-setting-scroll-position-number]";
const OUTPUT_SELECTOR = "[data-setting-scroll-position-output]";

export const readHeadingScrollPositionInput = (
  value: string,
  lastValidValue: number
): number => {
  if (value.trim() === "") {
    return normalizeHeadingScrollPositionPercent(lastValidValue);
  }

  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? normalizeHeadingScrollPositionPercent(parsed)
    : normalizeHeadingScrollPositionPercent(lastValidValue);
};

export const syncHeadingScrollPositionControls = (
  root: ParentNode,
  percent: number
): void => {
  const normalized = normalizeHeadingScrollPositionPercent(percent);
  const range = root.querySelector<HTMLInputElement>(RANGE_SELECTOR);
  const number = root.querySelector<HTMLInputElement>(NUMBER_SELECTOR);
  const output = root.querySelector<HTMLOutputElement>(OUTPUT_SELECTOR);

  if (range) {
    range.value = String(normalized);
    range.setAttribute("aria-valuetext", `${normalized}%`);
  }
  if (number) {
    number.value = String(normalized);
  }
  if (output) {
    output.value = `${normalized}%`;
    output.textContent = `${normalized}%`;
  }
};
