import { normalizeHeadingScrollPositionPercent } from "./settings";

export const HEADING_SCROLL_TOP_INSET_PX = 96;

export type HeadingTargetTopInput = {
  containerTop: number;
  containerHeight: number;
  headingHeight: number;
  topInset: number;
  percent: number;
};

export const calculateHeadingTargetTop = ({
  containerTop,
  containerHeight,
  headingHeight,
  topInset,
  percent
}: HeadingTargetTopInput): number => {
  const availableRange = Math.max(0, containerHeight - topInset - headingHeight);
  return (
    containerTop +
    topInset +
    (availableRange * normalizeHeadingScrollPositionPercent(percent)) / 100
  );
};

export const findNearestVerticalScrollContainer = (
  element: HTMLElement
): HTMLElement | null => {
  let current = element.parentElement;

  while (current) {
    const style = current.ownerDocument.defaultView?.getComputedStyle(current);
    if (
      style &&
      /(auto|scroll|overlay)/.test(style.overflowY) &&
      current.scrollHeight > current.clientHeight
    ) {
      return current;
    }
    current = current.parentElement;
  }

  return null;
};

const scrollWindowToHeading = (heading: HTMLElement, percent: number): void => {
  const view = heading.ownerDocument.defaultView;
  if (!view) {
    return;
  }

  const headingRect = heading.getBoundingClientRect();
  const targetTop = calculateHeadingTargetTop({
    containerTop: 0,
    containerHeight: view.innerHeight,
    headingHeight: headingRect.height,
    topInset: HEADING_SCROLL_TOP_INSET_PX,
    percent
  });
  view.scrollBy({ behavior: "auto", top: headingRect.top - targetTop });
};

export const scrollHeadingToPercent = (heading: HTMLElement, percent: number): void => {
  if (!heading.isConnected) {
    return;
  }

  heading.scrollIntoView({ behavior: "auto", block: "start" });
  requestAnimationFrame(() => {
    if (!heading.isConnected) {
      return;
    }

    const scrollContainer = findNearestVerticalScrollContainer(heading);
    if (!scrollContainer) {
      scrollWindowToHeading(heading, percent);
      return;
    }

    const containerRect = scrollContainer.getBoundingClientRect();
    const headingRect = heading.getBoundingClientRect();
    const targetTop = calculateHeadingTargetTop({
      containerTop: containerRect.top,
      containerHeight: scrollContainer.clientHeight,
      headingHeight: headingRect.height,
      topInset: HEADING_SCROLL_TOP_INSET_PX,
      percent
    });
    scrollContainer.scrollBy({ behavior: "auto", top: headingRect.top - targetTop });
  });
};
