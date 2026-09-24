import { afterEach, describe, expect, it, vi } from "vitest";
import { extractAnswerOutlines } from "../shared/headings";
import {
  answerSnapshotsChanged,
  findAnswerAtAnchor,
  findHeadingAtAnchor,
  nextTocScrollTop,
  snapshotAnswers
} from "./outline-tracking";

const answers = (): HTMLElement[] =>
  Array.from(document.querySelectorAll<HTMLElement>("[data-message-author-role='assistant']"));

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("dynamic answer tracking", () => {
  it("notices a replaced writing block with 43 headings even when the message id stays fixed", () => {
    document.body.innerHTML = `
      <article data-message-author-role="assistant" data-message-id="long"><h2>Earlier</h2></article>
      <article data-message-author-role="assistant" data-message-id="later"><h2>Later</h2></article>
    `;
    const original = snapshotAnswers(answers());
    const replacement = document.createElement("article");
    replacement.setAttribute("data-message-author-role", "assistant");
    replacement.setAttribute("data-message-id", "long");
    replacement.innerHTML = Array.from({ length: 43 }, (_, index) => `<h2>Heading ${index + 1}</h2>`).join("");
    original[0].element.replaceWith(replacement);

    expect(answerSnapshotsChanged(original, answers(), original[0].id)).toBe(true);
    const refreshed = snapshotAnswers(answers());
    expect(refreshed[0].id).toBe(original[0].id);
    expect(extractAnswerOutlines(answers())[0].headings).toHaveLength(43);
    expect(answerSnapshotsChanged(refreshed, answers(), refreshed[0].id)).toBe(false);
  });

  it("notices reordered answers and heading replacement without changing the count", () => {
    document.body.innerHTML = `
      <article data-message-author-role="assistant" data-message-id="first"><h2>First</h2></article>
      <article data-message-author-role="assistant" data-message-id="second"><h2>Second</h2></article>
    `;
    const original = snapshotAnswers(answers());
    original[0].element.querySelector("h2")?.replaceWith(document.createElement("h2"));
    expect(answerSnapshotsChanged(original, answers(), original[0].id)).toBe(true);

    const refreshed = snapshotAnswers(answers());
    document.body.prepend(refreshed[1].element);
    expect(answerSnapshotsChanged(refreshed, answers(), refreshed[0].id)).toBe(true);
  });

  it("notices a heading revealed by style changes during page scrolling", () => {
    document.body.innerHTML = `
      <article data-message-author-role="assistant" data-message-id="writing-block">
        <h2>Visible</h2><h2 style="display: none">Revealed later</h2>
      </article>
    `;
    const original = snapshotAnswers(answers());
    (original[0].headingElements[1] as HTMLElement).style.display = "block";
    expect(answerSnapshotsChanged(original, answers(), original[0].id, false)).toBe(false);
    expect(answerSnapshotsChanged(original, answers(), original[0].id)).toBe(true);
  });

  it("selects the answer at the viewport anchor, including one with no headings", () => {
    document.body.innerHTML = `
      <article data-message-author-role="assistant" data-message-id="first"><h2>First</h2></article>
      <article data-message-author-role="assistant" data-message-id="empty"><p>No headings</p></article>
    `;
    const snapshots = snapshotAnswers(answers());
    vi.spyOn(snapshots[0].element, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ y: -500, width: 400, height: 700 })
    );
    vi.spyOn(snapshots[1].element, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ y: 220, width: 400, height: 800 })
    );
    const active = findAnswerAtAnchor(snapshots, 865);
    expect(active?.id).toBe(snapshots[1].id);
    expect(findHeadingAtAnchor(extractAnswerOutlines(answers()).find((outline) => outline.id === active?.id), 865, 2)).toBeNull();
  });

  it("keeps the current answer and heading through small boundary movement", () => {
    document.body.innerHTML = `
      <article data-message-author-role="assistant" data-message-id="first"><h2>First</h2><h2>Second</h2></article>
      <article data-message-author-role="assistant" data-message-id="next"><h2>Next answer</h2></article>
    `;
    const snapshots = snapshotAnswers(answers());
    const outlines = extractAnswerOutlines(answers());
    const firstHeading = outlines[0].headings[0];
    const secondHeading = outlines[0].headings[1];
    let secondTop = 490;
    vi.spyOn(firstHeading.element, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ y: 100, width: 500, height: 30 })
    );
    vi.spyOn(secondHeading.element, "getBoundingClientRect").mockImplementation(() =>
      DOMRect.fromRect({ y: secondTop, width: 500, height: 30 })
    );
    expect(findHeadingAtAnchor(outlines[0], 500, 2, firstHeading.id)?.id).toBe(firstHeading.id);
    secondTop = 460;
    expect(findHeadingAtAnchor(outlines[0], 500, 2, firstHeading.id)?.id).toBe(secondHeading.id);
    secondTop = 490;
    expect(findHeadingAtAnchor(outlines[0], 480, 2, secondHeading.id)?.id).toBe(secondHeading.id);
    expect(findHeadingAtAnchor(outlines[0], 450, 2, secondHeading.id)?.id).toBe(firstHeading.id);

    let firstBottom = 495;
    let nextTop = 500;
    vi.spyOn(snapshots[0].element, "getBoundingClientRect").mockImplementation(() =>
      DOMRect.fromRect({ y: firstBottom - 800, width: 500, height: 800 })
    );
    vi.spyOn(snapshots[1].element, "getBoundingClientRect").mockImplementation(() =>
      DOMRect.fromRect({ y: nextTop, width: 500, height: 800 })
    );
    expect(findAnswerAtAnchor(snapshots, 500, snapshots[0].id)?.id).toBe(snapshots[0].id);
    firstBottom = 460;
    nextTop = 465;
    expect(findAnswerAtAnchor(snapshots, 500, snapshots[0].id)?.id).toBe(snapshots[1].id);
  });

  it("keeps the clicked ninth item in view within a 652px list", () => {
    const next = nextTocScrollTop(300, 1550, 652, 62, true);
    expect(next).toBeCloseTo(75.12, 1);
    expect(62 + 300 - next).toBeGreaterThan(94);
    expect(62 + 300 - next).toBeLessThan(652);
    expect(nextTocScrollTop(next, 1550, 652, 287, false)).toBe(next);
  });
});
