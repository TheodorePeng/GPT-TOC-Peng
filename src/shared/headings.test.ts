import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./settings";
import { extractAnswerOutlines, getVisibleHeadingsForAnswer } from "./headings";

const renderAnswers = (html: string): Element[] => {
  document.body.innerHTML = html;
  return Array.from(document.querySelectorAll("[data-message-author-role='assistant']"));
};

describe("heading outline extraction", () => {
  it("extracts non-empty visible headings from assistant answers", () => {
    const outlines = extractAnswerOutlines(
      renderAnswers(`
        <article data-message-author-role="assistant">
          <h1>二十五、补充说明</h1>
          <h2>25.1 一句话理解</h2>
          <h2 style="display: none">隐藏标题</h2>
          <h3>   </h3>
        </article>
      `)
    );

    expect(outlines).toHaveLength(1);
    expect(outlines[0].headings.map((heading) => heading.text)).toEqual([
      "二十五、补充说明",
      "25.1 一句话理解"
    ]);
    expect(outlines[0].minDepth).toBe(1);
  });

  it("expands the current answer to max depth and collapses other answers to their first heading level", () => {
    const outlines = extractAnswerOutlines(
      renderAnswers(`
        <article data-message-author-role="assistant">
          <h2>回答一标题</h2>
          <h3>回答一细节</h3>
        </article>
        <article data-message-author-role="assistant">
          <h1>回答二标题</h1>
          <h2>回答二细节</h2>
          <h3>回答二更深层</h3>
        </article>
      `)
    );

    const settings = { ...DEFAULT_SETTINGS, maxDepth: 2 as const, expandCurrentOnly: true };
    const firstAnswerVisible = getVisibleHeadingsForAnswer(outlines[0], settings, outlines[1].id);
    const secondAnswerVisible = getVisibleHeadingsForAnswer(outlines[1], settings, outlines[1].id);

    expect(firstAnswerVisible.map((heading) => heading.text)).toEqual(["回答一标题"]);
    expect(secondAnswerVisible.map((heading) => heading.text)).toEqual([
      "回答二标题",
      "回答二细节"
    ]);
  });

  it("treats the first heading level in each answer as relative level one", () => {
    const outlines = extractAnswerOutlines(
      renderAnswers(`
        <article data-message-author-role="assistant">
          <h2>回答一顶层</h2>
          <h3>回答一第二层</h3>
          <h4>回答一第三层</h4>
        </article>
        <article data-message-author-role="assistant">
          <h2>回答二顶层</h2>
          <h3>回答二第二层</h3>
        </article>
      `)
    );

    const settings = { ...DEFAULT_SETTINGS, maxDepth: 2 as const, expandCurrentOnly: true };
    const currentAnswerVisible = getVisibleHeadingsForAnswer(outlines[0], settings, outlines[0].id);
    const otherAnswerVisible = getVisibleHeadingsForAnswer(outlines[1], settings, outlines[0].id);

    expect(currentAnswerVisible.map((heading) => heading.text)).toEqual([
      "回答一顶层",
      "回答一第二层"
    ]);
    expect(currentAnswerVisible.map((heading) => heading.relativeDepth)).toEqual([1, 2]);
    expect(otherAnswerVisible.map((heading) => heading.text)).toEqual(["回答二顶层"]);
  });

  it("uses stable message ids across answer reordering and DOM replacement", () => {
    const outlines = extractAnswerOutlines(
      renderAnswers(`
        <article data-message-author-role="assistant" data-message-id="message-a" data-gpt-reader-answer-id="old-answer">
          <h1 data-gpt-reader-heading-id="old-heading">旧回答标题</h1>
        </article>
        <article data-message-author-role="assistant" data-message-id="message-b" data-gpt-reader-answer-id="old-answer">
          <h1 data-gpt-reader-heading-id="old-heading">新回答标题</h1>
        </article>
      `)
    );

    expect(outlines.map((outline) => outline.id)).toEqual([
      "gpt-reader-answer-message-a",
      "gpt-reader-answer-message-b"
    ]);
    expect(outlines.flatMap((outline) => outline.headings.map((heading) => heading.id))).toEqual([
      "gpt-reader-answer-message-a-heading-1",
      "gpt-reader-answer-message-b-heading-1"
    ]);

    const reordered = extractAnswerOutlines(
      renderAnswers(`
        <article data-message-author-role="assistant" data-message-id="message-b"><h1>新回答标题</h1></article>
        <article data-message-author-role="assistant" data-message-id="message-a"><h1>旧回答标题</h1></article>
      `)
    );
    expect(reordered.map((outline) => outline.id)).toEqual([outlines[1].id, outlines[0].id]);
    expect(reordered[1].headings[0].id).toBe(outlines[0].headings[0].id);
  });

  it("keeps a session-only fallback id for the same message element", () => {
    const [element] = renderAnswers(`
      <article data-message-author-role="assistant"><h2>First</h2></article>
    `);
    const firstId = extractAnswerOutlines([element])[0].id;
    expect(extractAnswerOutlines([element])[0].id).toBe(firstId);
    const replacement = element.cloneNode(true) as Element;
    expect(extractAnswerOutlines([replacement])[0].id).not.toBe(firstId);
  });

  it("ignores headings hidden by an ancestor", () => {
    const outlines = extractAnswerOutlines(
      renderAnswers(`
        <article data-message-author-role="assistant" style="display: none">
          <h1>Hidden parent heading</h1>
        </article>
        <article data-message-author-role="assistant">
          <h1>Visible heading</h1>
        </article>
      `)
    );

    expect(outlines).toHaveLength(1);
    expect(outlines[0].headings.map((heading) => heading.text)).toEqual(["Visible heading"]);
  });

  it("indexes Writing Block headings without changing the host editor DOM", () => {
    const [answer] = renderAnswers(`
      <article data-message-author-role="assistant" data-message-id="writing-block">
        <div data-testid="writing-block-container">
          <div class="ProseMirror" contenteditable="true">
            <h1>Document title</h1><h2>Chapter one</h2><h2>Chapter two</h2>
          </div>
        </div>
      </article>
    `);
    const originalMarkup = answer.outerHTML;

    const first = extractAnswerOutlines([answer]);
    const second = extractAnswerOutlines([answer]);

    expect(first[0].headings.map((heading) => heading.id)).toEqual(
      second[0].headings.map((heading) => heading.id)
    );
    expect(answer.outerHTML).toBe(originalMarkup);
  });
});
