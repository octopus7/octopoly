# 08 Retopo Engine

## Required
YES

## Execution
```text
Mode: WORKTREE
Branch: wt/retopo-engine
Worktree: ../wt-retopo-engine
```

## Goal
Pencil-first retopology 핵심 알고리즘.

## Ownership
```text
src/retopo/**
tests/retopo/**
```

## Agent Allocation

### Agent A — Stroke Processing
- PointerSample -> stroke samples
- resampling
- optional smoothing
- surface hit chain
- noise suppression

### Agent B — Chain Generation
- surface samples -> vertex chain
- continuity
- snap candidate interpretation
- edge chain representation

### Agent C — Quad Inference
- chain pair -> quad candidate
- bridge
- winding
- degenerate rejection
- preview model
- commit-ready operation request

## Core Flow
```text
Pencil stroke
-> normalized samples
-> surface samples
-> retopo chain
-> edge/vertex creation request
-> quad preview
-> commit
```

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
