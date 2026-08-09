# 06 Tool Runtime

## Required
YES

## Execution
```text
Mode: WORKTREE
Branch: wt/tool-runtime
Worktree: ../wt-tool-runtime
Branch point: `baseline/core-v1^{commit}`
```

## Inputs

- `/AGENTS.md`
- `docs/workplan/00_MASTER.md`
- `docs/workplan/00_BOOTSTRAP.md`의 완료 상태와 `baseline/core-v1`의 resolved commit
- `docs/workplan/INTERFACE_CONTRACTS.md`의 `PointerSample`, `PointerPhase`, `PointerInputSink`, `Tool`,
  `ToolContext`, `ToolInputResult`, `ToolRegistry`

## Goal

모든 editing tool이 공유하는 lifecycle, normalized pointer dispatch, capture, preview 및 cancel 조정 runtime을
구현한다. Raw DOM event와 구체 Select/Move/Quad Draw behavior는 이 workstream 범위가 아니다.

## Ownership
```text
src/tools/runtime/**
tests/tools/runtime/**
```

01의 raw input normalizer, 구체 tool, renderer/history concrete implementation 및 공용 contract는 수정하지
않는다.

## Contract Semantics

- Runtime의 입력은 `PointerInputSink.dispatch(sample)`로 받은 canonical `PointerSample`뿐이다. raw
  `PointerEvent`를 저장하거나 tool에 전달하지 않는다.
- `down`, `move`, `up`, `cancel`, `hover` phase와 timestamp 순서를 그대로 유지한다. 이미 정렬되어 전달된
  coalesced sample을 병합, 재정렬 또는 누락하지 않는다.
- active tool의 `pointer(sample, context)` 결과에 따라 해당 `pointerId`의 capture/release 상태를 갱신한다.
  이는 runtime 내부의 **logical capture**와 소유 pointer를 뜻한다.
- `PointerInputSink.dispatch`는 logical capture 상태를 반영한 `ToolInputResult`를 반환한다. DOM
  `setPointerCapture`/`releasePointerCapture` 실행은 01이 소유하고 09가 양쪽 lifecycle의 일치를 검증한다.
- capture 중에는 소유 pointer의 move/up/cancel을 active gesture에 전달한다. 다른 pointer의 modeling dispatch는
  시작하지 않으며 touch navigation 정책은 01 adapter와의 경계에 남긴다.
- `up` 또는 `releasePointer`는 capture를 정상 해제한다. `cancel`, lost capture, active tool 교체/unregister,
  deactivate 또는 dispose는 같은 cancel 경로를 사용한다.
- cancel 경로는 normalized `cancel` sample을 전달할 수 있는 경우 먼저 전달하고, 구현되어 있다면
  `Tool.cancel(context)`를 정확히 한 번 호출한 뒤 preview를 지우고 capture를 해제한다.
- active gesture에서 `ToolContext.history`를 통해 열린 transaction은 runtime이 추적한다. 성공적인 종료는
  entry를 최대 하나만 commit하고 cancel/예외 종료는 열려 있는 transaction을 rollback한다.
- tool callback 예외 후에도 capture, preview, transaction이 열린 채 남지 않아야 하며 예외는 programmer
  error로 호출자에게 전파한다.

## Agent Allocation

### Agent A — Tool Lifecycle

소유 파일:

```text
src/tools/runtime/tool-registry.*
src/tools/runtime/tool-lifecycle.*
tests/tools/runtime/tool-registry.test.*
tests/tools/runtime/tool-lifecycle.test.*
```

책임:

- register/unregister/activate/activateScoped/active와 activate/deactivate 호출 순서
- 중복 id, unknown id, active tool 제거의 명시적 동작
- tool 전환 전에 진행 중 session을 cancel하도록 내부 경계 제공

### Agent B — Tool State Machine

소유 파일:

```text
src/tools/runtime/tool-session.*
src/tools/runtime/transaction-coordinator.*
tests/tools/runtime/tool-session.test.*
tests/tools/runtime/transaction-coordinator.test.*
```

책임:

- idle/hover/armed/dragging/commit/cancel 내부 상태 전이
- `ToolPreview`의 revision 반영과 cancel 시 `setPreview(null)`
- gesture transaction grouping, successful up commit, cancel/예외 rollback

### Agent C — Input Routing

소유 파일:

```text
src/tools/runtime/pointer-router.*
src/tools/runtime/pointer-capture-state.*
tests/tools/runtime/pointer-router.test.*
tests/tools/runtime/pointer-capture-state.test.*
```

책임:

- normalized phase/coalesced sample 전달
- `capturePointer`/`releasePointer`와 pointerId 소유권
- up/cancel/lost-capture 및 foreign pointer 경계 조건
- pen/touch/mouse 구분은 보존하되 raw device policy를 재구현하지 않음

### Main Agent Reserved Files

```text
src/tools/runtime/index.*
tests/tools/runtime/runtime.integration.test.*
docs/workplan/06_TOOL_RUNTIME.md (RESULT만)
```

주 에이전트만 runtime facade/export와 Agent A/B/C 산출물을 연결한다. 위 소유 경로는 서로 겹치지 않는다.

## Acceptance / Tests

- [ ] `down -> coalesced move* -> move -> up`가 동일 순서와 모든 canonical field로 active tool에 전달된다.
- [ ] `ToolInputResult.capturePointer`와 `releasePointer`가 같은 pointerId의 capture lifecycle을 만든다.
- [ ] `PointerInputSink.dispatch` 반환값이 logical capture/release 의도를 01 input adapter에 전달한다.
- [ ] capture 중 foreign pointer가 modeling gesture를 탈취하지 않는다.
- [ ] pointer `cancel`, lost capture, tool switch/unregister, deactivate 및 callback 예외가 공통 cancel cleanup을
      거친다.
- [ ] 중첩 scoped activation과 비순차 lease dispose가 gesture를 안전하게 cancel하고 직전 tool을 정확히
      복원한다.
- [ ] cancel은 preview를 지우고 열린 transaction을 rollback하며 history entry를 만들지 않는다.
- [ ] 한 successful gesture의 다중 mutation은 history entry 최대 하나로 commit된다.
- [ ] hover는 capture나 history transaction을 만들지 않는다.
- [ ] fake `ToolContext`/`HistoryService` 기반 테스트가 concrete history, mesh, renderer를 import하지 않는다.
- [ ] runtime source/test에 raw `PointerEvent` 의존이 없고 `PointerSample.phase` 다섯 값을 모두 검증한다.
- [ ] Select/Move/Quad Draw 등의 구체 tool behavior를 구현하지 않는다.
- [ ] `typecheck`, `tests/tools/runtime/**`, baseline의 canonical test command가 통과한다.

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
