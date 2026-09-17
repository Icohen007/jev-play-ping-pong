import test from "node:test";
import assert from "node:assert/strict";

import { validateChoiceAnswer, validateSystemOneResponse } from "../src/typesafe.mjs";

test("accepts documented Choice responses and the observed one-point rounding tolerance", () => {
  const answer = {
    type: "choice",
    choice: "left",
    confidence: 0.7,
    probabilities: { left: 0.7, right: 0.29 },
  };
  assert.doesNotThrow(() => validateChoiceAnswer(answer, ["left", "right"]));
});

test("rejects a selected option that is not the argmax", () => {
  assert.throws(() => validateChoiceAnswer({
    type: "choice",
    choice: "left",
    confidence: 0.2,
    probabilities: { left: 0.2, right: 0.8 },
  }, ["left", "right"]), /highest-probability/);
});

test("response answer keys must exactly match question keys", () => {
  assert.throws(() => validateSystemOneResponse({ model: "jev-1.13.0", answers: {} }, {
    action: { type: "choice", criteria: { wait: null, move: null } },
  }), /answer keys/);
});
