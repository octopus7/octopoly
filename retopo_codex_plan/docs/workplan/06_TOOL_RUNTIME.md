# 06 Tool Runtime

## Required
YES

## Execution
```text
Mode: WORKTREE
Branch: wt/tool-runtime
Worktree: ../wt-tool-runtime
```

## Goal
모든 editing tool이 사용하는 lifecycle/state/input dispatch runtime.

## Ownership
```text
src/tools/runtime/**
tests/tools/runtime/**
```

## Agent Allocation

### Agent A — Tool Lifecycle
- register
- activate/deactivate
- current tool
- ToolContext

### Agent B — Tool State Machine
- idle
- hover
- armed
- dragging
- preview
- commit
- cancel

### Agent C — Input Routing
- normalized pointer dispatch
- pen/touch policy boundary
- optional keyboard dispatch
- history hooks
- cancel semantics

## Acceptance
Select/Move/Quad Draw 등의 구체 tool behavior는 구현하지 않는다.

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
