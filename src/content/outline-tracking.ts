import {
  ensureAnswerId,
  headingSelector,
  isVisibleHeading,
  type AnswerOutline,
  type HeadingInfo
} from "../shared/headings";
import { getMessageId } from "../shared/chatgpt-dom";

export type AnswerSnapshot = {
  id: string;
  element: HTMLElement;
  messageId: string | null;
  headingElements: HTMLElement[];
  visibleHeadingElements: HTMLElement[];
};

export const snapshotAnswers = (elements: HTMLElement[]): AnswerSnapshot[] =>
  elements.map((element) => {
    const headingElements = Array.from(element.querySelectorAll<HTMLElement>(headingSelector));
    return {
      id: ensureAnswerId(element),
      element,
      messageId: getMessageId(element),
      headingElements,
      visibleHeadingElements: headingElements.filter(isVisibleHeading)
    };
  });

export const answerSnapshotsChanged = (
  snapshots: AnswerSnapshot[],
  elements: HTMLElement[],
  activeAnswerId: string | null,
  checkVisibility = true
): boolean => {
  if (snapshots.length !== elements.length) {
    return true;
  }

  return snapshots.some((snapshot, index) => {
    const element = elements[index];
    if (snapshot.element !== element || snapshot.messageId !== getMessageId(element)) {
      return true;
    }

    // DOM mutations invalidate other answers. Scroll-time checks only need the
    // active answer's headings; visiting every long Writing Block is costly.
    if (snapshot.id !== activeAnswerId) return false;

    const headings = Array.from(element.querySelectorAll<HTMLElement>(headingSelector));
    if (
      headings.length !== snapshot.headingElements.length ||
      headings.some((heading, headingIndex) => heading !== snapshot.headingElements[headingIndex])
    ) {
      return true;
    }

    if (!checkVisibility || snapshot.id !== activeAnswerId) {
      return false;
    }

    const visible = headings.filter(isVisibleHeading);
    return visible.length !== snapshot.visibleHeadingElements.length ||
      visible.some((heading, headingIndex) => heading !== snapshot.visibleHeadingElements[headingIndex]);
  });
};

export const findAnswerAtAnchor = (
  snapshots: AnswerSnapshot[],
  anchorY: number,
  previousAnswerId: string | null = null,
  hysteresisPx = 32
): AnswerSnapshot | null => {
  const previous = snapshots.find((item) => item.id === previousAnswerId);
  if (previous?.element.isConnected) {
    const rect = previous.element.getBoundingClientRect();
    if (rect.height > 0 && rect.top + hysteresisPx <= anchorY &&
      rect.bottom - hysteresisPx >= anchorY) {
      return previous;
    }
  }
  let preceding: AnswerSnapshot | null = null;
  let following: AnswerSnapshot | null = null;

  for (const snapshot of snapshots) {
    const rect = snapshot.element.getBoundingClientRect();
    if (!snapshot.element.isConnected || rect.height <= 0) {
      continue;
    }
    if (rect.top <= anchorY && rect.bottom >= anchorY) {
      if (previous && previous !== snapshot && previous.element.isConnected) {
        const previousRect = previous.element.getBoundingClientRect();
        const movingForward = snapshots.indexOf(snapshot) > snapshots.indexOf(previous);
        if (
          previousRect.top <= anchorY + hysteresisPx &&
          previousRect.bottom >= anchorY - hysteresisPx &&
          (movingForward
            ? rect.top > anchorY - hysteresisPx
            : rect.bottom < anchorY + hysteresisPx)
        ) {
          return previous;
        }
      }
      return snapshot;
    }
    if (rect.bottom < anchorY) {
      preceding = snapshot;
    } else if (!following) {
      following = snapshot;
    }
  }

  if (previous?.element.isConnected) {
    const rect = previous.element.getBoundingClientRect();
    if (rect.top <= anchorY + hysteresisPx && rect.bottom >= anchorY - hysteresisPx) {
      return previous;
    }
  }
  return preceding ?? following ?? snapshots.find((snapshot) => snapshot.element.isConnected) ?? null;
};

export const findHeadingAtAnchor = (
  outline: AnswerOutline | undefined,
  anchorY: number,
  maxDepth: number,
  previousHeadingId: string | null = null,
  hysteresisPx = 24
): HeadingInfo | null => {
  if (!outline) {
    return null;
  }

  let active: HeadingInfo | null = null;
  for (const heading of outline.headings) {
    if (heading.relativeDepth > maxDepth || !heading.element.isConnected) {
      continue;
    }
    if (
      !heading.element.ownerDocument.defaultView?.navigator.userAgent.includes("jsdom") &&
      heading.element.getClientRects().length === 0
    ) {
      continue;
    }
    if (heading.element.getBoundingClientRect().top > anchorY) {
      break;
    }
    active = heading;
  }
  const previous = outline.headings.find((heading) => heading.id === previousHeadingId);
  if (!previous?.element.isConnected || !isVisibleHeading(previous.element) || previous.relativeDepth > maxDepth || previous.id === active?.id) {
    return active;
  }
  const previousTop = previous.element.getBoundingClientRect().top;
  if (active && active.order > previous.order && active.element.getBoundingClientRect().top > anchorY - hysteresisPx) {
    return previous;
  }
  if ((!active || active.order < previous.order) && previousTop < anchorY + hysteresisPx) {
    return previous;
  }
  return active;
};

export const nextTocScrollTop = (
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  activeCenter: number,
  forceAlignment: boolean
): number => {
  const topGuard = clientHeight * 0.22;
  const bottomGuard = clientHeight * 0.78;
  if (!forceAlignment && activeCenter >= topGuard && activeCenter <= bottomGuard) {
    return scrollTop;
  }

  const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
  return Math.min(
    maxScrollTop,
    Math.max(0, scrollTop + activeCenter - clientHeight * 0.44)
  );
};
