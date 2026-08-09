# 05 History Engine

## Required
YES

## Execution
```text
Mode: WORKTREE
Branch: wt/history-engine
Worktree: ../wt-history-engine
```

## Goal
Transaction 기반 undo/redo.

## Ownership
```text
src/history/**
tests/history/**
```

## Agent Allocation

### Agent A — Patch / Command
- reversible change abstraction
- apply/reverse
- metadata

### Agent B — Undo / Redo Stack
- push/undo/redo
- branch truncation
- optional limits

### Agent C — Transaction / Grouping
- begin/commit/rollback
- stroke grouping
- transform drag grouping
- cancel behavior

## Critical Requirement
```text
Pencil stroke 1회
-> 다수 내부 mutation
-> history entry 1개
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
