# 05 History Engine

## Required
YES

## Execution
```text
Mode: WORKTREE
Branch: wt/history-engine
Worktree: ../wt-history-engine
Branch point: `baseline/core-v1^{commit}`
```

## Inputs

- `/AGENTS.md`
- `docs/workplan/00_MASTER.md`
- `docs/workplan/00_BOOTSTRAP.md`의 완료 상태와 `baseline/core-v1`의 resolved commit
- `docs/workplan/INTERFACE_CONTRACTS.md`의 `ReversibleChange`, `MeshPatch`, `HistoryTransaction`,
  `HistoryService`

## Goal

이미 적용된 reversible change를 transaction 단위로 묶고, 결정적인 undo/redo와 rollback을 제공한다.
History는 mesh 구현을 알지 않으며 canonical contract의 `ReversibleChange`만 소비한다.

## Ownership
```text
src/history/**
tests/history/**
```

공용 contract, mesh 구현, tool runtime은 수정하지 않는다. 새로운 reversible change 또는 patch shadow type을
정의하지 않는다.

## Contract Semantics

- `recordApplied(change)`는 **이미 forward 적용된** change를 기록만 한다. 호출 시 `change.apply()`를 다시
  실행하지 않는다.
- 한 transaction에 기록된 change는 등록 순서를 보존한다. `commit()`은 이 목록 전체를 undo stack의 entry
  하나로 만든다.
- undo와 rollback은 change를 등록 역순으로 `revert()`하고, redo는 등록 순서로 `apply()`한다.
- History에 들어오는 change는 frozen contract에 따라 유효 lifecycle의 `apply/revert`가 원자적이고
  non-throwing이어야 한다. invalid-state programmer error는 mutation 전에 발생하며 History는 부분 적용된
  change의 보상 실행을 추측하지 않는다.
- `rollback()`은 stack entry를 만들지 않으며 redo branch도 변경하지 않는다.
- undo 이후 새 transaction이 commit되면 기존 redo branch를 제거하고 제거된 change의 `dispose?()`를 안전하게
  호출한다.
- 비어 있는 transaction의 commit은 history entry를 만들지 않는다.
- transaction은 commit 또는 rollback 중 한 번만 종료할 수 있다. 종료 후 `recordApplied`, `commit`,
  `rollback` 호출과 중첩 `begin()`은 programmer error로 명시적으로 실패한다.
- undo/redo 가능 항목이 없을 때의 호출은 사용자 동작의 정상 no-op이다.
- `clear()`는 양쪽 stack과 활성 transaction을 정리하며, 보유한 change의 `dispose?()`를 중복 없이 호출한다.
- `HistorySnapshot`과 subscriber 알림은 commit, rollback, undo, redo, clear 뒤의 최종 상태를 반영한다.

## Agent Allocation

### Agent A — Composite Entry / Change Lifecycle

소유 파일:

```text
src/history/composite-entry.*
src/history/change-lifecycle.*
tests/history/composite-entry.test.*
tests/history/change-lifecycle.test.*
```

책임:

- canonical `ReversibleChange`를 순서대로 합성하는 내부 entry 구현
- apply 순서, reverse revert 순서, label/id metadata와 idempotent disposal 검증
- `MeshPatch`를 특수 취급하거나 mesh concrete implementation에 의존하지 않음

### Agent B — Undo / Redo Stack

소유 파일:

```text
src/history/history-service.*
src/history/history-stack.*
tests/history/history-service.test.*
tests/history/history-stack.test.*
```

책임:

- `HistoryService`의 stack, snapshot, subscribe 구현
- undo/redo, redo branch truncation, clear와 listener 알림
- unavailable undo/redo no-op과 stack 상태 전이 검증

### Agent C — Transaction / Grouping

소유 파일:

```text
src/history/history-transaction.*
tests/history/history-transaction.test.*
tests/history/history-grouping.test.*
```

책임:

- `HistoryTransaction`의 begin/recordApplied/commit/rollback 상태 전이
- Pencil stroke와 transform drag의 다중 applied change를 entry 하나로 grouping
- cancel/실패 rollback과 double-close/nested transaction invariant 검증

### Main Agent Reserved Files

```text
src/history/index.*
tests/history/history-engine.integration.test.*
docs/workplan/05_HISTORY_ENGINE.md (RESULT만)
```

주 에이전트만 public export를 조립하고 세 구현을 통합 검증한다. 위 Agent A/B/C 경로는 서로 겹치지 않는다.

## Critical Requirement
```text
Pencil stroke 1회
-> 다수 내부 mutation
-> history entry 1개
-> undo 시 모든 mutation 역순 revert
-> redo 시 모든 mutation 원순서 apply
```

Tool cancel 또는 pointer cancel에서는 같은 transaction의 모든 applied change가 rollback되고 history entry가
남지 않아야 한다.

## Acceptance / Tests

- [ ] `recordApplied`가 forward apply를 중복 호출하지 않는다.
- [ ] 3개 change commit이 entry 1개가 되고 undo는 `3, 2, 1`, redo는 `1, 2, 3` 순서다.
- [ ] rollback은 역순 revert 후 undo/redo stack과 label을 그대로 유지한다.
- [ ] valid fake change의 `apply/revert`가 중간 예외 없이 원자적으로 실행되며 invalid lifecycle 오류가
      mutation 전에 발생한다.
- [ ] undo 후 새 commit은 redo branch를 제거하고 제거 대상의 `dispose?()`를 정확히 한 번 호출한다.
- [ ] empty commit, unavailable undo/redo, clear가 정의된 no-op/cleanup semantics를 지킨다.
- [ ] closed transaction 재사용과 nested begin이 명시적 invariant error로 실패한다.
- [ ] subscriber가 `canUndo`, `canRedo`, `undoLabel`, `redoLabel`의 최종 snapshot을 받는다.
- [ ] fake `ReversibleChange`와 fake `MeshPatch`로 동일한 grouping 동작을 검증하며 mesh 구현을 import하지 않는다.
- [ ] `typecheck`, `tests/history/**`, baseline의 canonical test command가 통과한다.

## RESULT
Status: COMPLETE

### Implemented
- canonical `ReversibleChange`를 순방향 apply/역순 revert하는 composite history entry와 service-scoped
  idempotent change disposal lifecycle
- 이미 적용된 change를 재적용하지 않고 transaction 하나를 undo entry 하나로 만드는 transaction state machine
- deterministic undo/redo stack, redo branch truncation, clear, empty/no-op semantics와 immutable snapshot 알림
- active transaction rollback/clear, closed transaction 재사용 거부, nested transaction 및 active undo/redo invariant
- Pencil stroke와 transform drag의 다중 change grouping 및 cancel rollback round trip

### Files created or modified
- `src/history/change-lifecycle.ts`
- `src/history/composite-entry.ts`
- `src/history/history-stack.ts`
- `src/history/history-transaction.ts`
- `src/history/history-service.ts`
- `src/history/index.ts`
- `tests/history/change-lifecycle.test.ts`
- `tests/history/composite-entry.test.ts`
- `tests/history/history-stack.test.ts`
- `tests/history/history-transaction.test.ts`
- `tests/history/history-service.test.ts`
- `tests/history/history-grouping.test.ts`
- `tests/history/history-engine.integration.test.ts`
- `docs/workplan/05_HISTORY_ENGINE.md` (`RESULT` only)

### Public API
- `createHistoryService(): HistoryService`
- `HistoryServiceImpl implements HistoryService`
- Public entrypoint: `src/history/index.ts`

### Tests / validation
- `npm ci`: PASS — 86 packages installed
- `npm run typecheck`: PASS
- `npx vitest run tests/history`: PASS — 7 files / 33 tests
- `npm run ci`: PASS — strict typecheck, 11 files / 55 tests, production build와 baseline artifact verification
- fake `ReversibleChange`와 canonical fake `MeshPatch`로 record-without-reapply, `3 -> 2 -> 1` undo,
  `1 -> 2 -> 3` redo, cancel rollback, redo truncation/disposal 및 subscriber final snapshot을 검증했다.

### Integration notes
- 09 Integration은 `src/history/index.ts`의 `createHistoryService()`를 composition root에서 생성한다.
- Tool/Retopo composition은 gesture 시작 시 `begin(label)`, 각 이미 적용된 mutation patch에
  `recordApplied(patch)`, 완료 시 `commit()`, pointer/tool cancel 시 `rollback()`을 호출해야 한다.
- History는 mesh concrete implementation을 import하지 않으며 canonical `ReversibleChange`만 소비한다.

### Requested contract changes
- NONE

### Known limitations
- 실제 Mesh Kernel/Tool Runtime/Retopo Engine과의 end-to-end 연결 및 pointer cancel 재생은 09 Integration 범위다.
- 순수 CPU history module에는 기기별 동작이 없지만 실제 iPad Safari gesture 경로는 이번 workstream에서
  검증하지 않았다.
