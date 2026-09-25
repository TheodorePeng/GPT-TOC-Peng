import { normalizeHeadingScrollPositionPercent } from "./settings";

export const HEADING_SCROLL_TOP_INSET_PX = 96;

export type HeadingTargetTopInput = {
  containerTop: number;
  containerHeight: number;
  headingHeight: number;
  topInset: number;
  percent: number;
};

export type HeadingScrollResult = {
  status: "reached" | "clamped" | "missing" | "cancelled" | "unsettled";
  element: HTMLElement | null;
  targetTop: number | null;
  actualTop: number | null;
};

export type HeadingScrollOptions = {
  resolveHeading?: () => HTMLElement | null;
  isCancelled?: () => boolean;
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

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

const pause = (durationMs: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, durationMs));

const getScrollGeometry = (
  heading: HTMLElement,
  percent: number
): { container: HTMLElement | null; targetTop: number; actualTop: number; visibleTop: number; visibleBottom: number; scrollTop: number; minScrollTop: number; maxScrollTop: number } => {
  const view = heading.ownerDocument.defaultView;
  const container = findNearestVerticalScrollContainer(heading);
  const rect = container?.getBoundingClientRect();
  const visibleTop = rect ? Math.max(0, rect.top) : 0;
  const visibleBottom = rect
    ? Math.min(view?.innerHeight ?? rect.bottom, rect.bottom)
    : view?.innerHeight ?? 0;
  const headingRect = heading.getBoundingClientRect();
  const scrollTop = container?.scrollTop ?? view?.scrollY ?? 0;
  const reverse = container && view?.getComputedStyle(container).flexDirection === "column-reverse";
  const scrollRange = container
    ? Math.max(0, container.scrollHeight - container.clientHeight)
    : Math.max(0, heading.ownerDocument.documentElement.scrollHeight - (view?.innerHeight ?? 0));

  return {
    container,
    targetTop: calculateHeadingTargetTop({
      containerTop: visibleTop,
      containerHeight: Math.max(0, visibleBottom - visibleTop),
      headingHeight: headingRect.height,
      topInset: HEADING_SCROLL_TOP_INSET_PX,
      percent
    }),
    actualTop: headingRect.top,
    visibleTop,
    visibleBottom,
    scrollTop,
    minScrollTop: reverse ? -scrollRange : 0,
    maxScrollTop: reverse ? 0 : scrollRange
  };
};

const moveTowardsTarget = (geometry: ReturnType<typeof getScrollGeometry>): number => {
  const destination = Math.min(geometry.maxScrollTop,
    Math.max(geometry.minScrollTop, geometry.scrollTop + geometry.actualTop - geometry.targetTop));
  const delta = destination - geometry.scrollTop;
  if (Math.abs(delta) < 1) return 0;
  if (geometry.container) geometry.container.scrollBy({ behavior: "instant", top: delta });
  else window.scrollBy({ behavior: "instant", top: delta });
  return delta;
};

export const scrollElementNearViewport = (element: HTMLElement, percent = 0): void => {
  if (!findNearestVerticalScrollContainer(element)) {
    element.scrollIntoView({ behavior: "instant", block: percent >= 50 ? "center" : "start" });
    return;
  }
  moveTowardsTarget(getScrollGeometry(element, percent));
};

export const scrollHeadingToPercent = async (
  heading: HTMLElement,
  percent: number,
  options: HeadingScrollOptions = {}
): Promise<HeadingScrollResult> => {
  const resolveHeading = options.resolveHeading ?? (() => heading.isConnected ? heading : null);
  const initial = resolveHeading();
  if (!initial) {
    return { status: "missing", element: null, targetTop: null, actualTop: null };
  }
  if (!findNearestVerticalScrollContainer(initial)) {
    initial.scrollIntoView({ behavior: "instant", block: "start" });
    await nextFrame();
    await pause(80);
  }

  const deadline = performance.now() + 2400;
  let corrections = 0;
  let stableSince: number | null = null;
  let lastError = Infinity;
  let lastResult: HeadingScrollResult = {
    status: "missing", element: null, targetTop: null, actualTop: null
  };

  while (performance.now() < deadline) {
    if (options.isCancelled?.()) {
      return { status: "cancelled", element: null, targetTop: null, actualTop: null };
    }

    const current = resolveHeading();
    if (!current?.isConnected) {
      stableSince = null;
      await nextFrame();
      await pause(80);
      continue;
    }

    const geometry = getScrollGeometry(current, percent);
    const delta = geometry.actualTop - geometry.targetTop;
    lastError = Math.abs(delta);
    const now = performance.now();
    lastResult = {
      status: "reached", element: current,
      targetTop: geometry.targetTop, actualTop: geometry.actualTop
    };

    if (Math.abs(delta) <= 12) {
      stableSince ??= now;
      if (now - stableSince >= 320) {
        return lastResult;
      }
    } else {
      stableSince = null;
      if (corrections >= 4) return { ...lastResult, status: "unsettled" };
      const appliedDelta = moveTowardsTarget(geometry);
      if (Math.abs(appliedDelta) < 1) {
        const visible = geometry.actualTop < geometry.visibleBottom &&
          geometry.actualTop + current.getBoundingClientRect().height > geometry.visibleTop;
        return { ...lastResult, status: !geometry.container || visible ? "clamped" : "unsettled" };
      }
      corrections += 1;
    }
    await nextFrame();
    await pause(80);
  }

  return lastResult.element && lastError > 12
    ? { ...lastResult, status: "unsettled" }
    : lastResult;
};
