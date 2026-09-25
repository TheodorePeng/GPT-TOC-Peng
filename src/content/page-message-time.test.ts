import { afterEach, describe, expect, it } from "vitest";
import { MESSAGE_TIME_REQUEST_EVENT, MESSAGE_TIME_RESPONSE_EVENT } from "../shared/answer-metadata";
import { readPageMessageTime } from "./page-message-time";

afterEach(() => document.body.replaceChildren());

describe("page message time bridge", () => {
  it("reads a shallow React message only when its id matches the DOM", () => {
    const element = document.createElement("article") as HTMLElement & Record<string, unknown>;
    element.dataset.messageId = "answer-1";
    element.dataset.messageAuthorRole = "assistant";
    element["__reactFiber$test"] = {
      memoizedProps: { children: [{ props: { message: {
        id: "answer-1", create_time: 1790231067.119453
      } } }] }
    };
    document.body.append(element);
    expect(readPageMessageTime(element)).toBe(1790231067119);
    element.dataset.messageId = "other-answer";
    expect(readPageMessageTime(element)).toBeNull();
  });

  it("returns only matching ids and validated timestamps to the isolated script", () => {
    const element = document.createElement("article") as HTMLElement & Record<string, unknown>;
    element.dataset.messageId = "answer-2";
    element.dataset.messageAuthorRole = "assistant";
    element["__reactFiber$test"] = { memoizedProps: { message: {
      id: "answer-2", create_time: 1790231067
    } } };
    document.body.append(element);
    let response = "";
    document.addEventListener(MESSAGE_TIME_RESPONSE_EVENT, (event) => {
      response = (event as CustomEvent<string>).detail;
    }, { once: true });
    document.dispatchEvent(new CustomEvent(MESSAGE_TIME_REQUEST_EVENT, {
      detail: JSON.stringify({ requestId: "test-1", ids: ["answer-2", "unknown"] })
    }));
    expect(JSON.parse(response)).toEqual({
      requestId: "test-1", entries: [{ id: "answer-2", createdAtMs: 1790231067000 }]
    });
  });

  it("reads the current assistant search unit through its selection message id", () => {
    const unit = document.createElement("div");
    unit.setAttribute("data-content-search-unit-key", "fallback-turn-1:2:assistant");
    const selection = document.createElement("div") as unknown as HTMLElement & Record<string, unknown>;
    selection.setAttribute("data-chatgpt-selection-message-id", "answer-3");
    selection["__reactFiber$test"] = {
      memoizedProps: { message: { id: "answer-3", create_time: 1790231067 } }
    };
    unit.append(selection);
    document.body.append(unit);
    expect(readPageMessageTime(unit)).toBe(1790231067000);
  });
});
