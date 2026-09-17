export const JEV_PRICE_USD_PER_MILLION = Object.freeze({
  input: 0.042,
  output: 0,
});

export function addUsage(total, usage = {}) {
  total.input_tokens += usage.input_tokens ?? 0;
  total.output_tokens += usage.output_tokens ?? 0;
  return total;
}

export function calculateJevCost(usage, prices = JEV_PRICE_USD_PER_MILLION) {
  return usage.input_tokens / 1_000_000 * prices.input
    + usage.output_tokens / 1_000_000 * prices.output;
}
