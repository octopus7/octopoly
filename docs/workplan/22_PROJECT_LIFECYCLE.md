# 22 Project Lifecycle and Recovery

## Required

YES — 고정 project ID Save/Load만으로는 실사용 데이터 안전성과 여러 작업 관리가 성립하지 않는다.

## Execution

```text
Mode: WORKTREE
Branch: wt/project-lifecycle
Worktree: ../wt-project-lifecycle
Order: AFTER 19 PHASE A; MAY RUN IN PARALLEL WITH 20/21/23/24
Branch point: exact PRODUCT_INPUT_BASE_SHA from 19 Phase A
Output: verified unit commits + RESULT commit + same-name origin branch push
Main merge/tag/deploy: PROHIBITED
```

## Goal

- New/Open/Save/Save As/Rename/Delete, stable ID와 validated name 분리
- project catalog/recent/last-opened
- Save/Discard/Cancel destructive confirmation
- existing `ProjectAutosave` 연결, committed durable mutation 이후 serialized scheduling
- 19 Phase A의 `DurableChangeSource`를 집계해 model/reference/extension committed revision만 dirty로 반영
- 19 Phase A의 `ProjectCleanupParticipant` registry를 받아 project/recovery/reference/image cleanup을 하나의
  IndexedDB transaction과 failure rollback으로 조정
- selection/camera/hover/preview와 display preference는 dirty에서 제외
- explicit save와 분리된 recovery slot/version
- pagehide/background에서는 best-effort schedule + pending marker만 보장하고 durable completion을 과장하지 않음
- crash recovery Restore/Discard, corrupt/quota/unavailable IndexedDB actionable state
- local/offline, no telemetry/cloud dependency

## Ownership

```text
src/project/catalog/**
src/project/recovery/**
src/project/dirty-state/**
src/project/storage.ts
src/project/repository.ts
src/project/autosave.ts
src/project/index.ts
src/app/project/**
src/ui/project/**
tests/project/catalog/**
tests/project/recovery/**
tests/project/dirty-state/**
tests/app/project/**
tests/ui/project/**
tests/integration/project-lifecycle.integration.*
tests/e2e/project-lifecycle.browser.*
docs/validation/project-lifecycle/**
docs/workplan/22_PROJECT_LIFECYCLE.md (RESULT만)
```

22 주 에이전트가 위 existing project files의 IndexedDB version/store migration, catalog/recovery transaction과 autosave
연결을 단일 owner로 수행한다. `src/app/composition/core-workspace.ts`, reference/extension concrete producers와 shared
bootstrap wiring은 25가 소유한다.

## Agent Allocation

- **Agent A — Catalog/Repository Adapter:** ID/name, list/recent, create/open/save-as/rename/delete, atomic metadata
- **Agent B — Dirty/Autosave/Recovery:** durable revisions, debounce/flush, separate recovery, stale completion/corrupt/quota
- **Agent C — UI/Browser Evidence:** accessible catalog/dialogs, failure/retry/recovery IndexedDB E2E
- **Main Agent:** app-local entry, integration tests, RESULT, branch commit/push

## Acceptance

- [ ] 두 이름 있는 project를 create/list/open/rename/delete하고 Save As가 원본을 보존한다.
- [ ] dirty state는 injected `DurableChangeSource`의 model/reference/extension committed revision에만 반응한다.
- [ ] New/Open/Delete/close는 Save/Discard/Cancel을 제공하며 cancel이 모든 상태를 보존한다.
- [ ] autosave는 committed mutation 이후 serialized 실행되고 explicit save와 recovery snapshot이 분리된다.
- [ ] pagehide/background는 best-effort schedule/pending marker를 남기고 완료되지 않은 write를 success로 표시하지 않는다.
- [ ] crash-style reload가 최신 complete recovery만 restore한다.
- [ ] corrupt/incomplete recovery가 last valid project를 대체하지 않는다.
- [ ] save/quota/abort/dispose 실패 뒤 이전 durable project가 읽힌다.
- [ ] project 삭제 시 등록된 `ProjectCleanupParticipant`와 recovery metadata가 같은 transaction에서
  atomic하게 정리되고 participant 실패 시 전부 rollback된다. Guided concrete progress는 17/19 Phase B gate다.
- [ ] Save As가 asset revision을 공유한 경우 남은 project reachability를 같은 transaction snapshot에서 계산해
  원본 project 삭제 뒤에도 복사본이 reference/image asset과 함께 reopen된다.
- [ ] deterministic IndexedDB fixture와 repository integration tests 및 canonical CI가 통과한다.
- [ ] **25 integration gate:** actual browser IndexedDB에서 real workspace model/reference/extension producers와 dirty/recovery 조합, network 0.
- [ ] branch만 non-force push하며 main/tag/deploy를 수행하지 않는다.

## RESULT
Status: NOT_STARTED

### Provenance
- Resolved start `PRODUCT_INPUT_BASE_SHA`: NOT_SET
- Branch/worktree: `wt/project-lifecycle` / `../wt-project-lifecycle`
- Final local branch tip: NOT_SET
- Pushed `origin/wt/project-lifecycle` tip: NOT_SET
- Start-SHA ancestry check: NOT_RUN

### Implemented / data safety / tests / browser evidence
- NOT_STARTED / NOT_RUN

### Integration notes / contract requests
- NONE

### Final disposition
- Branch commit/push: NO
- Main merge/tag/deploy: NO
