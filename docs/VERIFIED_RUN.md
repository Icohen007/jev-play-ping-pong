# Verified real-time run

On 2026-09-17, the controller completed one Club-difficulty match in real-time
mode with the game never paused for inference.

| Measure | Result |
| --- | ---: |
| Outcome | Jev won, 11–0 |
| Requested model | `jev-latest` |
| Returned model | `jev-1.13.0` |
| Decisions | 124 (6 serves, 118 returns) |
| Late actions | 0 |
| Elapsed wall time | 269.031 seconds |
| Median API latency | 325 ms |
| Maximum API latency | 889 ms |
| Input tokens | 124,258 |
| Output tokens | 8,631 (free) |
| API cost | $0.005218836 |
| Source commit | `f6978fb` |

Environment: Node.js 25.8.1 and Google Chrome 153.0.8010.48 on macOS.

The cost uses the published Jev price of $0.042 per million input tokens and $0
per output token. The visible game result, JSONL terminal record, and decision
records agreed. This is one verified demonstration, not a benchmark or win-rate
claim. Network latency, the hosted game, its random seed, model aliases, and
pricing may change.
