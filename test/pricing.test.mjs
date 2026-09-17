import test from "node:test";
import assert from "node:assert/strict";

import { addUsage, calculateJevCost } from "../src/pricing.mjs";

test("Jev cost uses the published input price and free output tokens", () => {
  assert.equal(calculateJevCost({ input_tokens: 59_594, output_tokens: 4_088 }), 0.002502948);
});

test("usage accumulates across decisions", () => {
  const total = { input_tokens: 0, output_tokens: 0 };
  addUsage(total, { input_tokens: 10, output_tokens: 2 });
  addUsage(total, { input_tokens: 15, output_tokens: 3 });
  assert.deepEqual(total, { input_tokens: 25, output_tokens: 5 });
});
