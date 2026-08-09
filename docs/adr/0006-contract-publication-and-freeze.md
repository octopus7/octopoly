# ADR-0006: Contract Publication and Freeze

- Status: Accepted
- Date: 2026-08-10

## Context

Eight Core workstreams need one public language and must not create shadow types while developing independently.

## Decision

- `src/contracts/**` is the only TypeScript contract source. `src/contracts/index.ts` is the public barrel and
  `@octopoly/contracts` is the canonical import path.
- Files are grouped by the contract document's domains: fundamental/math, input, mesh/attributes, selection, surface,
  camera/picking/triangulation, history, tools/retopo, renderer/extensions, and assets/project.
- `docs/workplan/INTERFACE_CONTRACTS.md` and source names, fields, unions, nullability, readonly semantics, and lifecycle
  rules must agree. Any mismatch blocks the baseline; neither side silently wins.
- Public exports are checked by compile-time `expectTypeOf`/assignment fixtures and runtime invariant tests where behavior
  is specified. Workstreams import the barrel, not another workstream's concrete package.
- The contract freezes when the verified main commit receives annotated immutable tag `baseline/core-v1`.
  `git rev-parse baseline/core-v1^{commit}` is the branch-point SHA for every 01~08 worktree.
- Removing/renaming an export, changing variance/nullability/lifecycle semantics, or requiring a new cross-module field is
  breaking. Additive local implementation exports inside an owned package are not contract changes when they consume and
  return only canonical contract types.
- Core change requests are recorded in the workstream RESULT and reconciled only by 09. Additive Optional SDK requests
  are judged by 14 and must preserve Core-only build/runtime behavior.
- Shared immutable tags are never moved. A defective baseline uses a new versioned tag or later integration change.

## Alternatives

Per-workstream copies and direct concrete imports were rejected because they permit incompatible parallel assumptions.

## Consequences

Agent B publishes the source and tests; the main Bootstrap agent owns the root barrel reconciliation and final freeze.

## Validation

Run contract type/runtime tests, verify documentation/source parity, resolve the tag to a commit SHA, and confirm all
01~08 worktrees start at exactly that SHA.
