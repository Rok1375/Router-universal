# Context and execution optimization

The optimizer exists to reduce repeated work without hiding necessary information.

- Normalize and deduplicate resources by URI and content hash.
- Estimate tokens conservatively from text length.
- Rank resources by explicit priority and lexical relevance to the task.
- Include complete high-priority resources before low-priority material.
- Record every excluded resource and the reason.
- Reuse completed checkpoint results when the task and step identity match.
- Never trim security constraints, acceptance criteria, permission decisions, or verification evidence.

Token minimization is not the goal by itself. The goal is the smallest context that preserves correct,
verifiable execution.
