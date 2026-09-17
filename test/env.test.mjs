import test from "node:test";
import assert from "node:assert/strict";

import { parseEnv } from "../src/env.mjs";

test("parseEnv reads plain, exported, and quoted values without executing shell syntax", () => {
  const result = parseEnv("A=one\nexport B='two words'\nC=\"$(do-not-run)\"\n# ignored\n");
  assert.deepEqual(result, { A: "one", B: "two words", C: "$(do-not-run)" });
});

test("parseEnv rejects non-assignment syntax", () => {
  assert.throws(() => parseEnv("echo secret"), /line 1/);
});
