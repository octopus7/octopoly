# 01 Main Leaf

## Required
YES

## Execution
```text
Mode: MAIN
Branch: main
Worktree: NONE
```

## Goal
공용 상태를 소유하지 않으면서 독립성이 높은 leaf 기능을 main에서 디렉터리 단위로 병렬 구현한다.

## Ownership
```text
src/input/pen/**
src/input/touch/**
src/camera/**
src/surface/snapping/**
src/picking/**
src/transforms/**
src/renderer/overlays/**
src/tools/basic/**
src/tools/vertex/**
src/tools/edge/**
src/tools/face/**
src/io/import/**
src/io/export/**
src/project/**
src/ui/**
```

## Agent Allocation

### Agent A — Input / Camera / Interaction
- Apple Pencil normalization
- pressure / tilt
- coalesced samples
- pointer capture/cancel
- touch gesture normalization
- orbit/pan/zoom
- surface snapping adapter
- picking adapter
- transform helpers

### Agent B — IO / Persistence
- OBJ import/export
- glTF/GLB import/export
- mesh normalization
- project schema
- IndexedDB
- autosave boundary
- migrations

### Agent C — UI / Basic Tools
- viewport shell
- safe area/orientation
- tool palette
- hover/selection/tool overlays
- select/move/delete wrappers
- vertex/edge/face leaf tools
- iPad ergonomics

## Acceptance
- raw PointerEvent가 input layer 밖으로 직접 노출되지 않는다.
- optional 10~13 없이 동작한다.
- 각 leaf 영역은 독립 파일 소유로 병렬 구현 가능하다.

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
