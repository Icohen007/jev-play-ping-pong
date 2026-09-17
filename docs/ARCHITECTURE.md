# Architecture

## Control boundary

```text
RALLY test telemetry
        |
        v
deterministic observation encoder
        |
        v
compact JSON state + legal Choice questions
        |
        v
TypeSafe System One / Jev
        |
        v
validated selected choices + probabilities
        |
        v
deterministic mouse/keyboard adapter
        |
        v
unmodified game physics
```

The browser exposes a small JSON status object when the public game is opened
with `?test=1`. `readGameFrame` reads that object and the canvas bounds. Two
successive frames produce an estimated ball velocity; the game also supplies a
predicted screen-space intercept.

The encoder keeps arithmetic in code and judgment in Jev. It tells Jev the
score, rally, incoming trajectory, intercept zone, recent results, and known
mechanics. Jev independently chooses:

- contact: centered, angle left, or angle right;
- pace: controlled or power.

Those two questions are sent together because TypeSafe evaluates independent
questions in parallel. The adapter turns the chosen contact into a small offset
around the safe predicted intercept and holds or releases the ordinary mouse
button for the chosen pace.

## Real-time behavior

Real-time mode is the default. The controller observes every 35 ms and requests
a decision as soon as the ball begins travelling from the CPU toward Jev. A
fresh frame is checked before execution; an answer that arrives after the ball
has passed the playable intercept is recorded but not applied to a later ball.

`--pause` freezes game physics only while the API request is in flight. It is a
reproducibility fallback when latency is too high for the roughly 0.85–0.94
second return flight. It does not change the observation or selected action.

## Trust and evidence

`src/typesafe.mjs` validates the response envelope, answer keys, option set,
probabilities, and documented Choice argmax invariant. A malformed successful
response is retried rather than repaired. The accepted and rejected reported
token usage contributes to the recorded cost.

Each JSONL run starts with its model, difficulty, timing mode, and price table.
Decision records contain the exact state, questions, returned distribution,
selected action, latency, and whether the action executed. The terminal record
contains the score, elapsed time, aggregate usage, and price.

The API key stays in memory and is never placed in the browser or artifact.
