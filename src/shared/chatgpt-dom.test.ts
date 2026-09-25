import { describe, expect, it } from "vitest";
import {
  ASSISTANT_SELECTOR,
  MESSAGE_SELECTOR,
  USER_SELECTOR,
  getMessageId,
  getMessageRole,
  getTurnIndex
} from "./chatgpt-dom";
import { extractAnswerOutlines } from "./headings";

describe("ChatGPT message markup compatibility", () => {
  it("recognizes the current search-unit markup and keeps answer ids stable", () => {
    document.body.innerHTML = `
      <div data-content-search-turn-key="fallback-turn-3">
        <div data-content-search-unit-key="fallback-turn-3:0:user">Question</div>
        <div data-content-search-unit-key="fallback-turn-3:2:assistant"
             data-chatgpt-search-unit-key="fallback-turn-3:2:assistant">
          <h4 class="sr-only" data-conversation-role="assistant">ChatGPT said:</h4>
          <div data-chatgpt-selection-message-id="message-3">
            <div data-markdown-text-style="assistant-message"><h2>Actual heading</h2></div>
          </div>
        </div>
      </div>`;
    const messages = [...document.querySelectorAll(MESSAGE_SELECTOR)];
    const user = document.querySelector(USER_SELECTOR)!;
    const assistant = document.querySelector(ASSISTANT_SELECTOR)!;
    expect(messages).toHaveLength(2);
    expect(getMessageRole(user)).toBe("user");
    expect(getMessageRole(assistant)).toBe("assistant");
    expect(getTurnIndex(assistant.parentElement!)).toBe(3);
    expect(getMessageId(assistant)).toBe("message-3");
    expect(extractAnswerOutlines([assistant])[0].headings.map((heading) => heading.text))
      .toEqual(["Actual heading"]);

    const replacement = assistant.cloneNode(true) as Element;
    expect(extractAnswerOutlines([replacement])[0].id)
      .toBe(extractAnswerOutlines([assistant])[0].id);
    document.body.replaceChildren();
  });

  it("keeps the original message and turn attributes working", () => {
    document.body.innerHTML = `
      <article data-testid="conversation-turn-7">
        <div data-message-author-role="user" data-message-id="user-7">Question</div>
        <div data-message-author-role="assistant" data-message-id="answer-7"><h1>Answer</h1></div>
      </article>`;
    const assistant = document.querySelector(ASSISTANT_SELECTOR)!;
    expect(getMessageId(assistant)).toBe("answer-7");
    expect(getTurnIndex(assistant.parentElement!)).toBe(7);
    expect(extractAnswerOutlines([assistant])[0].headings[0].text).toBe("Answer");
    document.body.replaceChildren();
  });
});
