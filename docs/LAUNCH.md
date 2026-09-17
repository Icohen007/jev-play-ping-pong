# Launch notes

## Suggested GitHub metadata

Repository name:

```text
jev-play-ping-pong
```

Description:

```text
Jev plays browser table tennis in real time: structured telemetry, typed decisions, ordinary Chrome inputs, and auditable evidence.
```

Topics:

```text
typesafe-ai jev ai-agent game-ai browser-automation computer-use javascript
```

Before publishing:

1. Confirm the intended GitHub owner and repository name.
2. Create the repository as public with `main` as its default branch.
3. Push the local history and confirm the README image renders.
4. Confirm the CI workflow passes on Node.js 22.
5. Enable GitHub private vulnerability reporting if available.
6. Add the topics above and the RALLY URL as the repository website.
7. Run the public clone instructions in a fresh temporary directory.

## Suggested LinkedIn post

> I gave Jev a table-tennis paddle—and it won 11–0 in real time. 🏓
>
> The interesting part isn't the score. It is the architecture: deterministic
> code reads player-visible telemetry and handles exact geometry; TypeSafe's Jev
> chooses the serve, shot placement, and power; Chrome receives only ordinary
> mouse and keyboard input.
>
> In the verified run, game physics never paused. Jev made 124 decisions with
> 325 ms median API latency, zero late actions, and a total API cost of $0.0052.
>
> I open-sourced the complete controller, evidence format, and a guide for
> adapting the same pattern to another game or interactive task. You can clone
> it—or point a coding agent at `AGENTS.md` and `docs/ADAPTING.md`.
>
> https://github.com/Icohen007/jev-play-ping-pong

Keep the video caption explicit that the observation adapter calculates a safe
ball intercept while Jev chooses placement and power. The result is a verified
single demonstration, not a general benchmark or claimed win rate.
