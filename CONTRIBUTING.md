# Contributing

Thanks for helping improve this example.

## Development

The project intentionally has no runtime or development dependencies. Use
Node.js 22 or newer, then run:

```sh
npm test
npm run check
```

Live changes should also be exercised against the game in a Chrome instance
started with remote debugging. See the README for platform-specific commands.

## Pull requests

Please keep changes focused and include:

- tests for deterministic parsing, validation, or action-mapping behavior;
- a live run for changes to timing, browser input, or control logic;
- updated documentation when an option, artifact field, or invariant changes.

Do not commit `.env` files, API keys, authorization headers, browser profiles,
or generated `artifacts/`. A successful run is not a benchmark; describe the
exact difficulty, mode, model version, decision count, latency, and outcome.
