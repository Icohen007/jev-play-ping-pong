# Repository guide for coding agents

## Purpose

This is a small, dependency-free reference implementation of a real-time game
agent powered by TypeSafe's Jev model. The reusable idea is more important than
this particular table-tennis game:

1. observe deterministic application telemetry;
2. convert it to compact, meaningful JSON;
3. ask Jev narrow typed questions over legal actions;
4. execute only the returned choices through the application's normal inputs;
5. log enough evidence to reproduce and audit the run.

Read `docs/ARCHITECTURE.md` before changing the controller. Read
`docs/ADAPTING.md` when applying the pattern to another task or game.

## Commands

```sh
npm test
npm run check
npm run play
npm run play -- --pause
npm run summarize -- artifacts/run-<timestamp>.jsonl
```

The live commands require Chrome at `http://127.0.0.1:9222` and a
`TYPESAFE_API_KEY` in the process environment or `.env`.

## Invariants

- Never commit, print, or record API keys or authorization headers.
- Keep observation deterministic. Jev receives structured state, not a hidden
  browser object or direct write access to game state.
- Jev owns every strategic choice. The adapter may calculate geometry and
  timing, but it must execute only the selected legal action—never silently
  replace it with a scripted policy.
- Inputs go through Chrome's ordinary mouse and keyboard protocol. Do not
  mutate the game's internal state.
- A malformed model response is not an action. Retry it within a bounded limit
  and include any reported usage in cost accounting.
- Preserve the real-time default. `--pause` is a reproducibility fallback for
  slow or highly variable network paths.
- Keep generated recordings, screenshots, and JSONL runs under `artifacts/`;
  that directory is intentionally ignored.
- Run both `npm test` and `npm run check` after changes.

## Project map

- `src/cli.mjs`: orchestration, lifecycle, evidence recording.
- `src/game.mjs`: pure observation encoding and action-to-input mapping.
- `src/browser-game.mjs`: DOM telemetry and visible overlay.
- `src/cdp.mjs`: minimal Chrome DevTools Protocol client.
- `src/typesafe.mjs`: fail-closed System One API client.
- `src/pricing.mjs`: published Jev pricing calculation.
- `scripts/`: recording and evidence-summary utilities.
- `test/`: dependency-free Node test suite.
