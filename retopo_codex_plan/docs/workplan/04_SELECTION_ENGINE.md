# 04 Selection Engine

## Required
YES

## Execution
```text
Mode: WORKTREE
Branch: wt/selection-engine
Worktree: ../wt-selection-engine
```

## Goal
Picking과 분리된 topology-aware selection state/operators.

## Ownership
```text
src/selection/**
tests/selection/**
```

## Agent Allocation

### Agent A — Selection State
- vertex/edge/face sets
- replace/add/subtract/toggle
- snapshot
- clear/select all

### Agent B — Loop / Ring
- edge loop
- edge ring
- boundary/non-manifold handling

### Agent C — Selection Operators
- grow/shrink
- connected
- vertex/edge/face conversion

## Acceptance
Mesh public query/snapshot만 소비하며 renderer picking과 raw input을 구현하지 않는다.

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
