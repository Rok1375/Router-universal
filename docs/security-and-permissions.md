# Security and permissions

## Permission vocabulary

- `filesystem:read`
- `filesystem:write`
- `process:run`
- `network:access`
- `secrets:read`
- `destructive`

Every capability and execution step declares required permissions. Policy returns `allow`, `ask`, or
`deny`. User approval can satisfy `ask`; it can never override `deny` without an explicit policy
change.

## Presets

- **strict** — read is allowed; write, process, and network ask; secrets and destructive deny.
- **balanced** — read allowed; write and process ask; network asks; secrets and destructive deny.
- **developer** — read, write, and fixed process execution allowed; network asks; secrets and destructive deny.

There is intentionally no “full access” preset. Advanced users can add narrowly scoped overrides per
capability and permission.

## Threat controls

- Bind to loopback by default.
- Optional bearer token for API access.
- Rate-limit API requests.
- Do not invoke stdio commands through a shell.
- Reject remote HTTP adapters unless explicitly enabled.
- Validate all manifests and adapter results.
- Do not store complete prompts, source files, environment variables, or secrets in logs.
- Checkpoint only normalized state required to resume.
- Require independent verification for destructive, deployment, migration, or security-sensitive tasks.
