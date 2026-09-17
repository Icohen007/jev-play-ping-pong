# Jev plays RALLY

This controller lets TypeSafe's Jev model play the browser table-tennis game at
[RALLY](https://indispensable-lingonberry-hot.julius.site/).

It follows the same boundary as the Mario and StarCraft examples: deterministic
code reads compact structured telemetry and computes timing; Jev chooses among
legal gameplay actions; the adapter executes only Jev's chosen action through
ordinary Chrome mouse and keyboard input. It never sends screenshots or the API
key to the game.

For every incoming ball, the game is paused while Jev chooses:

- centered, left-angled, or right-angled racket contact;
- controlled or power pace.

The pause keeps network latency from deciding the match. The controller resumes
the unmodified game and moves the visible red racket through Chrome's input
protocol. Each Jev request, probability distribution, selected action, score,
and final result is saved under `artifacts/` as JSONL evidence.

The default pause is deliberate: a ball crosses the table in roughly 0.85–0.94
seconds, while an API response can consume a substantial part of that window.
Use `--no-pause` to run a genuinely real-time match and measure whether the
remaining movement time is sufficient.

## Run

Requirements: Node.js 22+ and Google Chrome started with remote debugging:

```sh
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome_debug_profile \
  --no-first-run --no-default-browser-check &
```

The env file must contain `TYPESAFE_API_KEY`; `TYPESAFE_MODEL` is optional. The
provided setup can be run directly:

```sh
npm run play -- --env-file /Users/itamarc/Desktop/.env --level club
```

Other useful options:

```sh
npm run play -- --level pro --max-seconds 420
npm run play -- --level club --no-pause --max-seconds 420
npm run play -- --help
```

No npm install is needed: the runner uses only Node's built-in APIs. It attaches
to the existing Chrome window, navigates that tab to the game's `?test=1`
telemetry mode, and leaves Chrome open when it finishes.

Because the current `/Users/itamarc/Desktop/.env` permissions allow other local
users to read it, tightening them is recommended:

```sh
chmod 600 /Users/itamarc/Desktop/.env
```

## Verify

```sh
npm test
npm run check
```

The code calls the documented `POST https://api.typesafe.ai/v1/systemone`
endpoint with `jev-latest` by default. Credentials stay in memory and are never
written to the evidence log. The runner records per-decision and total cost using
the published Jev price of **$0.042 per million input tokens**; output tokens are
free. Malformed successful responses are never repaired or executed: they are
retried within a bounded attempt limit, and their reported usage is included in
the cost.
