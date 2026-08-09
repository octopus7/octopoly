# 09 Integration

## Required
YES

## Execution
```text
Mode: MAIN
Branch: main
Worktree: NONE
```

## Goal
01~08의 필수 구현을 main에 조립하여 기본 retopology 제품을 완성한다.

10~13 Optional 기능은 성공 조건에 포함하지 않는다.

## Inputs

Integration 시작 전 다음 순서로 읽는다.

1. `/AGENTS.md`
2. `00_MASTER.md`
3. `INTERFACE_CONTRACTS.md`
4. `01~08` 각 문서의 `RESULT`

## Recommended Merge Order

1. `wt/mesh-kernel`
2. `wt/surface-engine`
3. `wt/renderer`
4. `wt/selection-engine`
5. `wt/history-engine`
6. `wt/tool-runtime`
7. `wt/retopo-engine`
8. main leaf 연결

## Agent Allocation

### Agent A — Merge / Contract Reconciliation
- worktree merge
- contract mismatch 해결
- requested contract change 검토
- duplicate/shadow type 제거
- module boundary 유지

### Agent B — Application Wiring
- input -> tool runtime
- camera -> renderer
- picking -> selection
- tools -> mesh mutation
- tools -> history
- retopo -> surface query
- preview -> renderer
- project IO wiring

### Agent C — Validation / iPad Path
- full typecheck/build
- smoke test
- iPad Safari pointer/touch behavior
- Apple Pencil pressure path
- viewport resize/orientation
- undo/redo grouping
- import/edit/export flow

## Core Acceptance

Optional 기능 없이 아래가 가능해야 한다.

```text
Reference model import
-> camera navigation
-> retopo mesh creation/edit
-> surface snapping
-> selection
-> move/delete/basic topology
-> Pencil stroke-based retopo
-> undo/redo
-> project persistence
-> export
```

## Optional Isolation Check

- `src/extensions/**`가 없어도 core build 가능
- Core가 optional module을 import하지 않음
- optional shading/material/texture가 없어도 renderer 정상

## RESULT
Status: NOT_STARTED

### Integrated
-

### Conflicts resolved
-

### Contract changes accepted
-

### Contract changes rejected
-

### Build / test
-

### iPad validation
-

### Remaining core issues
-
