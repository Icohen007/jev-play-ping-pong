# Security policy

## Secrets

Keep `TYPESAFE_API_KEY` in the process environment or an ignored local `.env`
file. The runner reads the file as data—it never evaluates it as shell code—and
rejects symlinks and files not owned by the current user. It warns when the file
is readable by other local users.

Evidence logs contain model requests, responses, token usage, and gameplay
state. They intentionally exclude credentials and authorization headers, but
you should still review generated artifacts before sharing them.

## Reporting a vulnerability

Please report security issues privately to the repository owner rather than
opening a public issue. Include the affected commit, reproduction steps, and
whether credentials or local browser state may be exposed.
