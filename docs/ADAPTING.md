# Adapt the pattern to another game or task

This repository is deliberately small enough for a developer—or a coding
agent—to use as a worked example. Do not copy the table-tennis assumptions.
Preserve the boundaries and replace the domain-specific pieces.

## 1. Define what code knows

Find a legitimate, deterministic observation source: a test API, accessibility
tree, emulator telemetry, public application state, or pixels transformed by a
separate vision model. Expose only facts available to the player or operator.

Write a pure encoder that turns observations into compact JSON. Calculate exact
geometry, deadlines, resource totals, and legal constraints in code. Avoid
making Jev infer arithmetic your program already knows.

In this project, start with `makeReturnRequest` in `src/game.mjs`.

## 2. Give Jev bounded decisions

Use a Choice when the action must come from a closed legal set. Option names
should be stable machine identifiers; criteria should explain their behavioral
meaning. Batch independent decisions in one System One request.

Keep the ownership line explicit:

- code determines which actions are legal and how they are executed;
- Jev chooses among those actions;
- code does not replace an inconvenient choice with a hidden heuristic.

## 3. Build a deterministic adapter

Map each choice to the target application's normal input surface: keyboard,
mouse, controller, or public API. Re-check volatile preconditions immediately
before execution. If an action is stale, record that fact and skip it rather
than applying it to a different state.

For this game, see `resolveReturnInput` in `src/game.mjs` and the input methods
in `src/cdp.mjs`.

## 4. Design for latency

Measure the environment's action window and API latency. Prefer early decision
points, persistent macro-actions, and small candidate sets. Real-time operation
is meaningful only when model answers usually arrive before the action
deadline. Provide a pause or slow-motion evaluation mode when the environment
supports it, but label that mode accurately.

## 5. Fail closed and preserve evidence

Validate every remote response. Never fabricate probabilities, normalize a bad
distribution, or silently substitute a scripted action. Bound retries and count
their usage. Log the exact request, response, selected action, execution result,
timing, model version, and terminal outcome without credentials.

## Prompt for a coding agent

You can give an agent this repository and a target environment with a prompt
like:

> Read `AGENTS.md`, `docs/ARCHITECTURE.md`, and `docs/ADAPTING.md`. Adapt this
> Jev control loop to TARGET. First identify an authorized observation surface,
> the legal action set, the action deadline, and a verifiable terminal outcome.
> Keep deterministic state extraction and input execution separate from Jev's
> typed choices. Never expose secrets, mutate hidden application state, or add a
> scripted policy that overrides Jev. Add focused tests and produce one evidence
> log from a live run.

## Questions to answer before claiming success

1. What exact state did Jev receive?
2. Which decisions did Jev own, and which calculations stayed in code?
3. Did every executed action equal the returned choice?
4. Was the run truly real-time, paused, or slowed down?
5. What terminal signal proves the outcome?
6. Which model version answered, how many tokens were billed, and what did it
   cost?
