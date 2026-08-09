# 02 Mesh Kernel

## Required
YES

## Execution
```text
Mode: WORKTREE
Branch: wt/mesh-kernel
Worktree: ../wt-mesh-kernel
```

## Goal
렌더링/UI/input과 독립된 low-poly topology kernel.

## Ownership
```text
src/mesh/**
tests/mesh/**
```

## Agent Allocation

### Agent A — Mesh Storage / Connectivity
- vertex/edge/face storage
- stable IDs
- adjacency
- topology queries
- snapshot
- integrity validator
- generic attribute storage

### Agent B — Topology Mutation
- split
- collapse
- dissolve
- merge/weld
- delete
- mutation result / patch

### Agent C — Face / Quad / Extrusion
- face create/fill
- bridge
- triangulate helper
- diagonal rotate
- edge extrude
- face extrude
- quad helpers

## Acceptance
- topology mutation 후 integrity 검증 가능
- read boundary와 mutation boundary 분리
- screen/GPU/UI 개념을 알지 않음
- Optional UV 구체 semantics를 구현하지 않음

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
