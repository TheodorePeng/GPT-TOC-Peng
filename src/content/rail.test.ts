import { describe, expect, it } from "vitest";
import { extractAnswerOutlines } from "../shared/headings";
import { getRailMarkers } from "./rail";

const outlinesFrom = (html: string) => {
  document.body.innerHTML = html;
  return extractAnswerOutlines(
    Array.from(document.querySelectorAll("[data-message-author-role='assistant']"))
  );
};

describe("current-answer rail markers", () => {
  it("shows only the current answer up to the configured relative depth", () => {
    const outlines = outlinesFrom(`
      <article data-message-author-role="assistant">
        <h1>First answer</h1><h2>First detail</h2>
      </article>
      <article data-message-author-role="assistant">
        <h2>Second answer</h2><h3>Second detail</h3><h4>Hidden depth</h4>
      </article>
    `);

    const markers = getRailMarkers({
      outlines,
      currentAnswerId: outlines[1].id,
      currentHeadingId: outlines[1].headings[1].id,
      maxDepth: 2
    });

    expect(markers).toEqual([
      {
        id: outlines[1].headings[0].id,
        answerId: outlines[1].id,
        relativeDepth: 1,
        width: 26,
        isActive: false
      },
      {
        id: outlines[1].headings[1].id,
        answerId: outlines[1].id,
        relativeDepth: 2,
        width: 22,
        isActive: true
      }
    ]);
  });

  it("falls back to the latest answer when the current answer is unavailable", () => {
    const outlines = outlinesFrom(`
      <article data-message-author-role="assistant"><h1>Earlier</h1></article>
      <article data-message-author-role="assistant"><h1>Latest</h1></article>
    `);

    expect(
      getRailMarkers({
        outlines,
        currentAnswerId: "missing-answer",
        currentHeadingId: null,
        maxDepth: 6
      }).map((marker) => marker.answerId)
    ).toEqual([outlines[1].id]);
  });

  it("maps relative H1-H6 to the fixed descending line widths", () => {
    const outlines = outlinesFrom(`
      <article data-message-author-role="assistant">
        <h1>H1</h1><h2>H2</h2><h3>H3</h3><h4>H4</h4><h5>H5</h5><h6>H6</h6>
      </article>
    `);

    expect(
      getRailMarkers({
        outlines,
        currentAnswerId: outlines[0].id,
        currentHeadingId: null,
        maxDepth: 6
      }).map((marker) => marker.width)
    ).toEqual([26, 22, 18, 15, 12, 9]);
  });
});
