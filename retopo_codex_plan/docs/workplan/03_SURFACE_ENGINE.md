# 03 Surface Engine

## Required
YES

## Execution
```text
Mode: WORKTREE
Branch: wt/surface-engine
Worktree: ../wt-surface-engine
```

## Goal
High-poly/reference surface의 spatial query 계층.

## Ownership
```text
src/surface/reference/**
src/surface/spatial/**
tests/surface/**
```

## Agent Allocation

### Agent A — Reference Mesh
- reference geometry adapter
- bounds
- normals
- lifecycle

### Agent B — Spatial Acceleration
- BVH 또는 동등 구조
- build/rebuild
- triangle query
- memory-conscious implementation

### Agent C — Surface Query
- raycast
- nearest optional
- position/normal/distance
- miss handling
- tests

## Acceptance
`SurfaceQuery` public boundary만 제공하며 Retopo concrete implementation을 알지 않는다.

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
