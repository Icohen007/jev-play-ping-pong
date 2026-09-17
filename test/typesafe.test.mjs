import test from "node:test";
import assert from "node:assert/strict";

import { TypeSafeClient, validateChoiceAnswer, validateSystemOneResponse } from "../src/typesafe.mjs";

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

test("client retries a malformed successful response and includes its reported usage in cost", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    const invalid = {
      model: "jev-1.13.0",
      answers: {
        action: { type: "choice", choice: "left", confidence: 0.1, probabilities: { left: 0.2, right: 0.8 } },
      },
      usage: { input_tokens: 100, output_tokens: 10 },
    };
    const valid = {
      model: "jev-1.13.0",
      answers: {
        action: { type: "choice", choice: "right", confidence: 0.7, probabilities: { left: 0.2, right: 0.8 } },
      },
      usage: { input_tokens: 110, output_tokens: 11 },
    };
    return new Response(JSON.stringify(calls === 1 ? invalid : valid), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const client = new TypeSafeClient({ apiKey: "test", maxRetries: 1, fetchImpl });
  const result = await client.decide({ value: 1 }, {
    action: { type: "choice", instructions: "Choose.", criteria: { left: null, right: null } },
  });
  assert.equal(calls, 2);
  assert.equal(result.answers.action.choice, "right");
  assert.equal(result.rejected_response_attempts, 1);
  assert.deepEqual(result.billing_usage, { input_tokens: 210, output_tokens: 21 });
});
