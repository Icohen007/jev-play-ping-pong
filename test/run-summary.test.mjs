import test from "node:test";
import assert from "node:assert/strict";

import { summarize } from "../scripts/summarize-run.mjs";

test("summarize reports real-time outcome, retries, late actions, and billed cost", () => {
  const records = [
    { type: "session", model: "jev-latest", pause_during_decision: false, pricing_usd_per_million_tokens: { input: 0.042, output: 0 } },
    { type: "decision", phase: "serve", response: { model: "jev-1.13.0", latency_ms: 300, usage: { input_tokens: 100, output_tokens: 5 }, billing_usage: { input_tokens: 100, output_tokens: 5 }, rejected_response_attempts: 0 } },
    { type: "decision", phase: "return", input: { executed: false }, response: { model: "jev-1.13.0", latency_ms: 500, usage: { input_tokens: 100, output_tokens: 5 }, billing_usage: { input_tokens: 200, output_tokens: 10 }, rejected_response_attempts: 1 } },
    { type: "result", winner: "jev", score: { jev: 11, cpu: 2 }, elapsed_seconds: 90 },
  ];
  assert.deepEqual(summarize(records), {
    complete: true,
    mode: "real-time",
    requested_model: "jev-latest",
    returned_models: ["jev-1.13.0"],
    score: { jev: 11, cpu: 2 },
    winner: "jev",
    decisions: 2,
    serves: 1,
    returns: 1,
    late_actions: 1,
    rejected_response_attempts: 1,
    median_latency_ms: 500,
    maximum_latency_ms: 500,
    usage: { input_tokens: 300, output_tokens: 15 },
    cost_usd: 0.0000126,
    elapsed_seconds: 90,
  });
});
