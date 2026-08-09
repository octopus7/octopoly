# 11 Texture Paint

## Required
NO — OPTIONAL

11을 구현하지 않아도 01~09에는 문제가 없어야 한다.

## Execution
```text
Mode: WORKTREE
Branch: wt/texture-paint
Worktree: ../wt-texture-paint
```

## Ownership
```text
src/extensions/texture-paint/**
tests/extensions/texture-paint/**
```

## Goal
Apple Pencil pressure를 활용하는 lightweight texture painting.

## Dependency Policy

10 UV Editor를 필수 dependency로 요구하지 않는다.

```text
Mesh에 UV 있음      -> Paint 가능
10 UV Editor 있음   -> UV 생성/편집 후 Paint 가능
Mesh에 UV 없음      -> Paint 기능 비활성
```

## Agent Allocation

### Agent A — Brush Engine
- radius
- hardness
- opacity
- pressure mapping
- stroke interpolation
- spacing
- erase/basic blend

### Agent B — Surface -> Texture Projection
- surface hit
- UV lookup
- texture-space stamping
- seam-aware behavior
- overlap/mirror policy

### Agent C — Texture Asset / Paint Session
- texture buffer
- paint session/layer
- undo transaction grouping
- image export
- brush UI
- Pencil feedback

## Acceptance
- raw Pencil input 시스템을 재작성하지 않음
- UV Editor를 강제 dependency로 만들지 않음
- Core Renderer를 Paint 전용으로 변경하지 않음

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
