# Security policy

## Supported versions

Security fixes are applied to the latest release and the default branch.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Contact the repository owner privately
with reproduction steps, impact, affected versions, and any proposed mitigation. Avoid including
real credentials, private prompts, customer data, or exploit payloads that affect third parties.

## Security posture

Router Universal binds to loopback by default, denies secret access and destructive actions by
default, treats discovered capabilities as untrusted metadata until policy approval, never uses a
shell for stdio adapters, and records privacy-safe execution metadata rather than full prompts.
