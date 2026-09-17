#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { calculateJevCost } from "../src/pricing.mjs";

export function summarize(records) {
  const session = records.find((record) => record.type === "session");
  const decisions = records.filter((record) => record.type === "decision");
  const returns = decisions.filter((record) => record.phase === "return");
  const result = [...records].reverse().find((record) => record.type === "result");
  const usage = decisions.reduce((total, record) => {
    const measured = record.response?.billing_usage ?? record.response?.usage ?? {};
    total.input_tokens += measured.input_tokens ?? 0;
    total.output_tokens += measured.output_tokens ?? 0;
    return total;
  }, { input_tokens: 0, output_tokens: 0 });
  const latencies = decisions
    .map((record) => record.response?.latency_ms)
    .filter(Number.isFinite)
    .sort((left, right) => left - right);

  return {
    complete: Boolean(result),
    mode: session?.pause_during_decision ? "decision-paused" : "real-time",
    requested_model: session?.model ?? null,
    returned_models: [...new Set(decisions.map((record) => record.response?.model).filter(Boolean))],
    score: result?.score ?? null,
    winner: result?.winner ?? null,
    decisions: decisions.length,
    serves: decisions.length - returns.length,
    returns: returns.length,
    late_actions: returns.filter((record) => record.input?.executed === false).length,
    rejected_response_attempts: decisions.reduce((sum, record) => sum + (record.response?.rejected_response_attempts ?? 0), 0),
    median_latency_ms: latencies.length ? latencies[Math.floor(latencies.length / 2)] : null,
    maximum_latency_ms: latencies.length ? latencies.at(-1) : null,
    usage,
    cost_usd: calculateJevCost(usage, session?.pricing_usd_per_million_tokens),
    elapsed_seconds: result?.elapsed_seconds ?? null,
  };
}

function main() {
  const input = process.argv[2];
  if (!input) throw new Error("Usage: npm run summarize -- artifacts/run-<timestamp>.jsonl");
  const file = path.resolve(input);
  const records = fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error(`Invalid JSON on line ${index + 1}.`);
      }
    });
  console.log(JSON.stringify({ file, ...summarize(records) }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}
