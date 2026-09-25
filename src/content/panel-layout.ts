export type PanelExpandDirection = "right" | "left";
export type PanelHeightMode = "smart" | "fixed" | "viewport";

export type PanelPosition = { left: number; top: number };

export const DEFAULT_HEIGHT_PERCENT = 65;
export const MIN_HEIGHT_PERCENT = 30;
export const MAX_HEIGHT_PERCENT = 90;

export const normalizeHeightPercent = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(MAX_HEIGHT_PERCENT, Math.max(MIN_HEIGHT_PERCENT, Math.round(value)))
    : DEFAULT_HEIGHT_PERCENT;

export const getSmartPanelHeight = (
  viewportHeight: number,
  heightPercent: number,
  contentHeight: number,
  chromeHeight: number,
  edgeMargin = 8
): number => {
  const cap = Math.max(0, Math.min(viewportHeight - edgeMargin * 2,
    Math.round(viewportHeight * normalizeHeightPercent(heightPercent) / 100)));
  return Math.min(cap, Math.max(72, Math.ceil(contentHeight + chromeHeight)));
};

export const normalizeCenterRatio = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : 0.5;

export const normalizePanelPosition = (value: unknown): PanelPosition | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const position = value as Partial<PanelPosition>;
  return typeof position.left === "number" &&
    Number.isFinite(position.left) &&
    typeof position.top === "number" &&
    Number.isFinite(position.top)
    ? { left: position.left, top: position.top }
    : null;
};

export const normalizePanelExpandDirection = (value: unknown): PanelExpandDirection =>
  value === "left" ? "left" : "right";

export const getPanelLeft = (
  anchorLeft: number,
  panelWidth: number,
  railWidth: number,
  direction: PanelExpandDirection
): number => direction === "left" ? anchorLeft - panelWidth + railWidth : anchorLeft;

export const constrainPanelAnchorLeft = (
  anchorLeft: number,
  panelWidth: number,
  railWidth: number,
  direction: PanelExpandDirection,
  viewportWidth: number,
  edgeMargin = 8
): number => {
  let nextAnchor = anchorLeft;
  const effectiveWidth = Math.max(0, Math.min(panelWidth, viewportWidth - edgeMargin * 2));
  const panelLeft = getPanelLeft(nextAnchor, effectiveWidth, railWidth, direction);
  if (panelLeft < edgeMargin) {
    nextAnchor += edgeMargin - panelLeft;
  }

  const maximumPanelRight = viewportWidth - edgeMargin;
  const panelRight = getPanelLeft(nextAnchor, effectiveWidth, railWidth, direction) + effectiveWidth;
  if (panelRight > maximumPanelRight) {
    nextAnchor -= panelRight - maximumPanelRight;
  }

  return nextAnchor;
};

export const getRenderedPanelLayout = (
  preferred: PanelPosition,
  panelWidth: number,
  panelHeight: number,
  railWidth: number,
  direction: PanelExpandDirection,
  viewportWidth: number,
  viewportHeight: number,
  edgeMargin = 8
): PanelPosition & { height: number } => {
  const availableHeight = Math.max(0, viewportHeight - edgeMargin * 2);
  const visibleHeight = Math.min(panelHeight, availableHeight);
  const maxTop = Math.max(edgeMargin, viewportHeight - visibleHeight - edgeMargin);
  const top = Math.min(maxTop, Math.max(edgeMargin, preferred.top));

  return {
    left: constrainPanelAnchorLeft(
      preferred.left,
      panelWidth,
      railWidth,
      direction,
      viewportWidth,
      edgeMargin
    ),
    top,
    height: Math.max(0, Math.min(panelHeight, viewportHeight - top - edgeMargin))
  };
};

export const getViewportPanelLayout = (
  anchorLeft: number,
  heightPercent: number,
  centerRatio: number,
  panelWidth: number,
  railWidth: number,
  direction: PanelExpandDirection,
  viewportWidth: number,
  viewportHeight: number,
  minHeight: number,
  edgeMargin = 8
): PanelPosition & { height: number } => {
  const availableHeight = Math.max(0, viewportHeight - edgeMargin * 2);
  const height = Math.min(
    availableHeight,
    Math.max(Math.min(minHeight, availableHeight), Math.round(viewportHeight * normalizeHeightPercent(heightPercent) / 100))
  );
  const preferredTop = normalizeCenterRatio(centerRatio) * viewportHeight - height / 2;
  return getRenderedPanelLayout(
    { left: anchorLeft, top: preferredTop },
    panelWidth,
    height,
    railWidth,
    direction,
    viewportWidth,
    viewportHeight,
    edgeMargin
  );
};

export const getResizedPanelWidth = (
  startWidth: number,
  deltaX: number,
  direction: PanelExpandDirection
): number => startWidth + (direction === "left" ? -deltaX : deltaX);
