export type AnswerWindow = {
  visibleIds: string[];
  hiddenBefore: number;
  hiddenAfter: number;
};

/** The current item may have no headings; only its neighbors consume the configured counts. */
export const selectAnswerWindow = (
  orderedIds: string[],
  currentId: string | null,
  before: number,
  after: number,
  extraBefore = 0,
  extraAfter = 0
): AnswerWindow => {
  if (orderedIds.length === 0) return { visibleIds: [], hiddenBefore: 0, hiddenAfter: 0 };
  const currentIndex = Math.max(0, currentId ? orderedIds.indexOf(currentId) : orderedIds.length - 1);
  const start = Math.max(0, currentIndex - before - extraBefore);
  const end = Math.min(orderedIds.length, currentIndex + after + extraAfter + 1);
  return {
    visibleIds: orderedIds.slice(start, end),
    hiddenBefore: start,
    hiddenAfter: orderedIds.length - end
  };
};
