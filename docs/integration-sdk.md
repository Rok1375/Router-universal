# Integration SDK

## Connect an agent

1. Create a `CapabilityManifest` with a stable ID, semantic version, description, intents, tags,
   trust level, permissions, and endpoint.
2. Implement the `CapabilityAdapter` contract or use the built-in in-memory, HTTP, or stdio adapter.
3. Register the manifest and adapter in the runtime.
4. Run manifest validation, preview routing, one successful task, one rejected permission case, one
   timeout case, and one malformed-result case.

## Adapter contract

An adapter receives the task, understanding, plan step, optimized context, workspace, and an abort
signal. It returns a status, summary, optional output, evidence, metrics, and a retryable flag.

## Transport rules

- `in-memory` is best for built-in or embedded integrations.
- `http` posts JSON to a fixed endpoint; localhost is allowed by default.
- `stdio` spawns a fixed executable and exchanges one JSON document; no shell expansion is used.
- `mcp` is represented in the manifest now and will receive a dedicated protocol adapter milestone.

See `examples/hello-agent` and `config/capabilities` for a minimal working integration.
