import { describe, expect, it } from "vitest";
import { selectAnswerWindow } from "./answer-window";

const answers = ["A", "B", "C", "D", "E", "F"];

describe("answer window", () => {
  it("keeps the current answer and the default two above and one below", () => {
    expect(selectAnswerWindow(answers, "D", 2, 1)).toEqual({
      visibleIds: ["B", "C", "D", "E"], hiddenBefore: 1, hiddenAfter: 1
    });
    expect(selectAnswerWindow(answers, "C", 2, 1).visibleIds).toEqual(["A", "B", "C", "D"]);
    expect(selectAnswerWindow(answers, "B", 2, 1).visibleIds).toEqual(["A", "B", "C"]);
  });

  it("supports zero, twenty, and first and last answers", () => {
    expect(selectAnswerWindow(answers, "D", 0, 0).visibleIds).toEqual(["D"]);
    expect(selectAnswerWindow(answers, "D", 20, 20).visibleIds).toEqual(answers);
    expect(selectAnswerWindow(answers, "A", 2, 1).visibleIds).toEqual(["A", "B"]);
    expect(selectAnswerWindow(answers, "F", 2, 1).visibleIds).toEqual(["D", "E", "F"]);
  });

  it("pages extra known answers while retaining an empty current slot", () => {
    expect(selectAnswerWindow(answers, "D", 0, 0, 1, 2)).toEqual({
      visibleIds: ["C", "D", "E", "F"], hiddenBefore: 2, hiddenAfter: 0
    });
  });
});
