export type PanelExpandDirection = "right" | "left";

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
  const panelLeft = getPanelLeft(nextAnchor, panelWidth, railWidth, direction);
  if (panelLeft < edgeMargin) {
    nextAnchor += edgeMargin - panelLeft;
  }

  const maximumPanelRight = viewportWidth - edgeMargin;
  const panelRight = getPanelLeft(nextAnchor, panelWidth, railWidth, direction) + panelWidth;
  if (panelRight > maximumPanelRight) {
    nextAnchor -= panelRight - maximumPanelRight;
  }

  return nextAnchor;
};

export const getResizedPanelWidth = (
  startWidth: number,
  deltaX: number,
  direction: PanelExpandDirection
): number => startWidth + (direction === "left" ? -deltaX : deltaX);
