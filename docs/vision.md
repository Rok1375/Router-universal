# Vision

Router Universal is the connective tissue for a personal AI operating system.

A user should be able to say, “Create a new VS Code project, send the implementation to my coding
agent, have two independent agents review it, fix verified issues, run the project, and open it,”
without hard-coding one vendor into the assistant.

The router is the traffic controller, not the worker. It understands the request, inventories what is
already installed, finds the smallest trustworthy capability set, produces a reviewable plan,
obtains the required permission, and coordinates execution. If a capability is missing, external
discovery is a targeted, explicit fallback—not a default web crawl.

Success means:

- Clients can integrate through one stable API.
- Agents can be swapped by configuration.
- Plans are understandable before execution.
- Permissions are granular and revocable.
- Interrupted work resumes safely.
- Context cost falls without reducing correctness.
- Repeated patterns become human-approved reusable skills.
- The router remains useful even as models and coding tools change.
