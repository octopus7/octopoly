# 10 UV Editor

## Required
NO — OPTIONAL

10을 구현하지 않아도 01~09에는 문제가 없어야 한다.

## Execution
```text
Mode: WORKTREE
Branch: wt/uv-editor
Worktree: ../wt-uv-editor
```

## Ownership
```text
src/extensions/uv/**
tests/extensions/uv/**
```

## Goal
Retopo mesh의 UV 생성 및 2D UV 편집.

## Dependencies
- Mesh public query/snapshot
- generic corner attributes
- Selection public boundary
- normalized input/tool boundary

Core는 UV Editor를 import하지 않는다.

## Agent Allocation

### Agent A — UV Data / Projection
- `uv0` corner attribute adapter
- planar projection
- box projection
- basic unwrap utility if feasible

### Agent B — UV Topology / Islands
- seam metadata
- island detection
- split/weld
- move/rotate/scale
- normalization helpers

### Agent C — 2D UV Editor UI
- UV viewport
- picking
- selection
- transforms
- iPad navigation

## Acceptance
- extension 제거 시 01~09 영향 없음
- Mesh Kernel에 UV-specific algorithm 없음
- generic attribute mechanism만 소비

## RESULT
Status: NOT_STARTED

### Implemented
-

### Files created or modified
-

### Public API
-

### Tests / validation
-

### Integration notes
-

### Requested contract changes
- NONE

### Known limitations
-
