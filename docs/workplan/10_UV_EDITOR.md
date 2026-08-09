# 10 UV Editor

## Required
NO — OPTIONAL

10을 구현하지 않아도 01~09에는 문제가 없어야 한다. Core는 이 extension의 모듈, attribute 이름 또는 UI가
존재한다고 가정하지 않는다.

## Start Gates

다음 조건을 모두 만족하기 전에는 branch/worktree를 만들거나 구현을 시작하지 않는다.

- `docs/workplan/09_INTEGRATION.md`의 `RESULT`가 `COMPLETE`이고 immutable ref
  `baseline/optional-sdk-v1`이 검증된 Core integration commit을 가리킨다.
- 09 완료 결과로 Optional SDK baseline이 `main`에 게시되어 있으며, canonical contract export,
  `OptionalExtension` composition root, extension test fake와 Core-only build 경로를 제공한다.
- Optional SDK baseline이 canonical `PanelRegistry`와 `ExtensionPanel` mount를 제공한다.
- Optional SDK baseline이 `ModelingExtensionServices`, panel-local `NormalizedInputSurfaceFactory`, scoped
  `ToolRegistry` activation과 `ExtensionStateRegistry`를 제공한다.
- 문서 계약과 실제 `src/contracts/**`가 일치하며 `MeshQuery`, `MeshMutationService`, `HistoryService`,
  `SelectionService`, `ToolRegistry`를 public import로 소비할 수 있다.
- 아래 worktree는 `baseline/optional-sdk-v1^{commit}`으로 해석한 정확한 commit에서 분기한다.

## Execution
```text
Mode: WORKTREE
Branch: wt/uv-editor
Worktree: ../wt-uv-editor
Branch point: `baseline/optional-sdk-v1^{commit}`
```

main에서 직접 구현하거나 merge하지 않는다.

## Ownership
```text
src/extensions/uv/**
tests/extensions/uv/**
docs/workplan/10_UV_EDITOR.md (주 에이전트가 RESULT만 갱신)
```

공용 contract, Core, shared bootstrap, package/build 설정은 수정하지 않는다.

## Goal

Retopo mesh의 `uv0` corner attribute를 생성하고, UV island를 분석하며, 2D UV 편집을 제공한다. UV 편집은
mesh topology를 별도 복제하거나 직접 수정하지 않고 generic mesh attribute와 public mutation/history
boundary만 사용한다.

## Contract Use

### Public APIs Consumed

- `MeshQuery`, `MeshSnapshot`, `CornerId`, `FaceId` — topology와 live corner 조회
- `AttributeKey<Vec2>`, `AttributeSnapshot` — `uv0` 읽기
- `MeshMutationService`, `MeshCommand`, `MeshPatch` — 모든 UV/seam 쓰기와 reversible patch 생성
- `HistoryService`, `HistoryTransaction` — 사용자 동작 하나당 undo entry 하나 생성
- `SelectionService`, `SelectionSnapshot` — Core의 vertex/edge/face selection을 입력으로만 소비
- `Tool`, `ToolContext`, `ToolRegistry`, normalized `PointerSample` — UV tool lifecycle과 입력
- `ModelingExtensionServices` — 2D panel에서 mesh/mutation/history/selection을 concrete import 없이 주입
- `OptionalExtension`, `ExtensionHost`, `PanelRegistry`, `ExtensionPanel`, `ExtensionPanelContext`,
  `NormalizedInputSurfaceFactory`, `ExtensionStateProvider` — additive tool/UI/input/state 등록과 해제

Core selection에는 `CornerId`가 없으므로 UV corner/island selection은 extension 내부 상태로 소유한다.
Core face selection은 편집 범위를 제한하는 입력으로만 사용한다.

### Attribute Semantics and Mutation Rule

```text
uv0 key        = { domain: "corner", name: "uv0" }       // Vec2
uv0 seam key   = { domain: "corner", name: "uv0.seam" }  // boolean, 선택적 authoring hint
```

- 같은 `VertexId`에 속한 corner들은 서로 다른 `uv0` 값을 가질 수 있다.
- UV가 존재하는 face는 모든 live corner에 finite `Vec2`가 있어야 한다. 일부 corner만 있는 face는 invalid다.
- island의 실제 경계는 인접 corner UV의 불연속으로 판정한다. `uv0.seam`은 Optional UV가 소유하는 편집
  hint이며 Core는 의미를 알지 않는다.
- planar/box projection, move/rotate/scale, split/weld 결과는 먼저 순수한
  `ReadonlyMap<CornerId, Vec2 | undefined>`로 계산한다.
- 쓰기는 `MeshMutationService.execute(label, { kind: "setAttribute", ... })` 또는 UV/seam을 함께 쓰는
  원자적 `batch`로만 수행한다. mesh snapshot/attribute storage를 직접 수정하지 않는다.
- 사용자 동작은 history transaction을 먼저 열고, 이미 적용된 `MeshPatch`를 즉시 `recordApplied`한 뒤
  commit한다. 실패 또는 취소 시 rollback하며 부분 attribute 상태를 남기지 않는다.

### Public APIs Provided

- `UV0_ATTRIBUTE`와 `UV0_SEAM_ATTRIBUTE` — 위 semantics를 갖는 canonical extension-owned keys
- `UvProjectionService` — planar/box projection을 corner-value map으로 계산
- `UvIslandService` — UV discontinuity 기반 island 탐색과 split/weld 후보 계산
- `UvTransformService` — selected corners의 move/rotate/scale/normalize 결과 계산
- `UvMutationController` — mutation과 history transaction을 원자적으로 연결
- `UvEditorExtension` — tool/UI를 등록하고 dispose 시 등록을 해제하는 `OptionalExtension`
- `UvEditorPanel` — 2D UV viewport와 controls를 mount하는 `ExtensionPanel`
- `UvEditorStateProvider` — panel layout과 extension-owned corner/island selection을 project extension data로 저장

이 API는 `src/extensions/uv/**`의 optional entrypoint에서만 export한다. Core barrel에는 추가하지 않는다.

## Graceful Disabled / Fallback Behavior

- UI mount가 없으면 extension activation은 Core를 변경하지 않고 extension-owned unsupported 상태를 기록한
  뒤 정상적으로 끝난다.
- 비어 있거나 invalid/degenerate topology에서는 projection을 비활성화하고 mutation/history를 만들지
  않는다.
- 일부 corner만 `uv0`를 가진 face는 읽기 전용 경고 상태로 표시하며 명시적인 regenerate 전에는 덮어쓰지
  않는다.
- `validate()` 오류, mutation 예외 또는 취소 시 기존 UV와 selection을 유지하고 history entry를 만들지 않는다.
- extension activation/dispose 실패가 Core tool, solid/wireframe renderer 또는 project load를 중단시키지 않는다.
- `src/extensions/uv/**`를 제외한 Core-only build가 항상 성공해야 한다.

## Agent Allocation

주 에이전트는 시작 시 아래 경로를 실제 담당자에게 선언한다. 같은 파일을 둘 이상이 수정하지 않는다.

### Agent A — UV Data / Projection

소유 파일:

```text
src/extensions/uv/data/**
src/extensions/uv/projection/**
tests/extensions/uv/data/**
tests/extensions/uv/projection/**
```

책임: canonical keys, UV validation, planar/box projection, projection의 finite/deterministic 결과.

### Agent B — UV Islands / Operations

소유 파일:

```text
src/extensions/uv/islands/**
src/extensions/uv/operations/**
tests/extensions/uv/islands/**
tests/extensions/uv/operations/**
```

책임: discontinuity 기반 island 탐색, split/weld 후보, move/rotate/scale/normalize, mutation/history adapter.

### Agent C — 2D Editor / Extension Lifecycle

소유 파일:

```text
src/extensions/uv/editor/**
src/extensions/uv/extension/**
tests/extensions/uv/editor/**
tests/extensions/uv/extension/**
```

책임: 2D viewport/controller, picking과 내부 corner selection, iPad navigation, registration/disposal과 disabled UI.
Panel input은 `ExtensionPanelContext.inputSurfaces`로만 연결하고 tool mode는 scoped activation lease로 복원한다.
`ModelingExtensionServices`의 document change 알림에서는 panel-local edit와 열린 transaction을 cancel한다.

### Main Agent Reserved

```text
src/extensions/uv/index.*
tests/extensions/uv/integration/**
docs/workplan/10_UV_EDITOR.md (RESULT만)
```

## Acceptance Gates

- [ ] 모든 UV 값은 `uv0` corner attribute이며 vertex/face attribute나 shadow UV storage가 없다.
- [ ] 모든 UV/seam 쓰기가 `MeshMutationService`의 `setAttribute`/`batch`를 통하고 직접 mutation이 없다.
- [ ] projection과 transform 한 동작이 정확히 한 history entry이며 undo/redo가 corner 값과 undefined 상태를
      정확히 복원한다.
- [ ] UV discontinuity가 있는 shared vertex에서 island가 분리되고 weld 후 다시 결합된다.
- [ ] invalid/degenerate topology, validation 실패와 pointer cancel이 부분 결과나 history entry를 남기지 않는다.
- [ ] Core face selection과 extension-owned corner selection이 서로의 상태를 덮어쓰지 않는다.
- [ ] activation/register와 unregister/dispose가 반복 호출에도 안전하고 tool/UI leak가 없다.
- [ ] 2D panel pointer가 element-local CSS 좌표로 정규화되고 Pencil edit와 touch pan/zoom이 분리된다.
- [ ] scoped tool activation dispose가 이전 Core tool을 복원하고 extension state save/load가 unknown key를
      손상시키지 않는다.
- [ ] project document 교체가 panel edit/input capture를 cancel하고 새 mesh snapshot으로 갱신한다.
- [ ] extension directory가 없는 Core-only typecheck/test/build가 성공한다.
- [ ] 실제 iPad Safari 검증을 하지 않았다면 완료로 추정하지 않고 RESULT에 제한으로 기록한다.

## Tests / Validation Plan

Optional SDK baseline의 canonical 명령을 사용하고 다음 경로를 필터링한다.

```text
tests/extensions/uv/data/**
  - complete/missing/partial/non-finite uv0 validation
tests/extensions/uv/projection/**
  - known planar/box fixtures, deterministic corner maps, degenerate input
tests/extensions/uv/islands/**
  - discontinuity split, shared-vertex seam, weld, disconnected components
tests/extensions/uv/operations/**
  - setAttribute/batch only, validation failure atomicity, undo/redo exact restore
tests/extensions/uv/editor/**
  - normalized pen/touch routing, pick miss, cancel, internal selection
tests/extensions/uv/extension/**
  - register/unregister/dispose, missing UI mount disabled path
tests/extensions/uv/integration/**
  - fake public contracts only; no concrete Core import
```

추가로 canonical typecheck/test/build와 Optional extension을 제외한 Core-only build를 실행한다. WebGL/iPad
실기기 검증은 실행 환경, 기기, 측정 결과를 RESULT에 따로 기록한다.

## RESULT
Status: COMPLETE

### Implemented
- extension-owned `uv0`/`uv0.seam` corner attribute keys와 complete/missing/partial/non-finite validation
- invalid/degenerate topology에서 부분 결과를 만들지 않는 deterministic planar/box projection
- UV discontinuity 기반 island 탐색, split/weld 후보와 midpoint weld value 계산
- selected corner move/rotate/scale/normalize 순수 연산과 runtime-immutable public 결과
- `setAttribute` 또는 UV+seam `batch`만 실행하고 한 사용자 동작을 한 history entry로 묶는
  `UvMutationController`; validation/execute/record 실패는 기존 attribute 상태로 rollback
- extension-owned corner/island selection, SVG 2D UV viewport, element-local normalized input,
  Pencil/Mouse drag edit와 touch pan/zoom 분리
- Planar/Box/Normalize 및 corner/island selection controls, partial UV의 명시적 regenerate 경로
- panel/state/tool registration, scoped Core tool 복원, partial activation cleanup, disabled UI fallback과
  idempotent dispose를 제공하는 `UvEditorExtension`
- layout/selection과 unknown/future state fields 및 image refs를 보존하는 `UvEditorStateProvider`

### Files created or modified
- `src/extensions/uv/data/**`
- `src/extensions/uv/projection/**`
- `src/extensions/uv/islands/**`
- `src/extensions/uv/operations/**`
- `src/extensions/uv/editor/**`
- `src/extensions/uv/extension/**`
- `src/extensions/uv/index.ts`
- `tests/extensions/uv/**`
- 이 문서의 `RESULT` 섹션

### Public API
- Attributes/data: `UV0_ATTRIBUTE`, `UV0_SEAM_ATTRIBUTE`, `validateUvAttribute`
- Projection/islands: `UvProjectionService`, `createUvProjectionService`, `UvIslandService`,
  `UvIsland`, `UvEdgeCandidate`
- Operations: `UvTransformService`, `UvMutationController`, `UvMutationOutcome`
- Editor: `UvEditorSelection`, `UvViewportController`, `UvEditorPanel`, `inspectUvStatus`와 editor 상태/options types
- Extension: `UvEditorStateProvider`, `UvEditorExtension`, `createUvEditorExtension`,
  `UV_EDITOR_EXTENSION_ID`, `UV_EDITOR_PANEL_ID`, `UV_EDITOR_TOOL_ID`, `UV_EDITOR_STATE_ID`
- Optional-only public entrypoint: `src/extensions/uv/index.ts`; Core/public shared barrel은 변경하지 않음

### Tests / validation
- Start gate: branch `wt/uv-editor`, HEAD/merge-base/`baseline/optional-sdk-v1^{commit}` =
  `175ecff7613c15d5afd39327e957885c6eed4e50`; Optional SDK/contracts/testkit/Core-only verifier 존재 확인
- `npm ci`: PASS — 86 packages
- `npm run test -- tests/optional-sdk`: PASS — 6 files / 29 tests (구현 전 baseline SDK 확인)
- `npm run test -- tests/extensions/uv`: PASS — 11 files / 52 tests
- UV attribute round trip: planar projection -> generic `setAttribute` -> one history entry -> serialized attribute
  restore -> undo/redo exact restore PASS, concrete Core import 없음
- `npm run ci`: PASS — strict typecheck, 98 files / 484 tests, production build와 artifact gate
- `npm run verify:core`: PASS — 146 Core source files, Core Optional import 없음, Core typecheck/test/build/artifact gate
- extension 제거 검증: `src/extensions`와 `tests/extensions`를 검증 중 임시 이동한 실제 Core-only
  `npm run ci` PASS — 87 files / 432 tests와 production build/artifact gate; 검증 후 디렉터리 복원 확인
- 정적 경계 확인: Optional UV raw `PointerEvent` dependency 없음; Core implementation roots에 `uv0` 또는
  `uv0.seam` semantics 추가 없음

### Integration notes
- 14 Optional Integration은 optional composition root에서만 `src/extensions/uv`를 import하고
  `createUvEditorExtension()`을 `ExtensionRuntime`에 활성화한다.
- Host panel surface가 mount되면 SVG viewport와 controls가 canonical `NormalizedInputSurfaceFactory` 및
  `ModelingExtensionServices`만 소비한다. UI가 없으면 activation은 unsupported 결과로 종료된다.
- Core-only build/runtime은 이 extension의 존재, attribute key 또는 panel/tool/state ID를 전제로 하지 않는다.

### Requested contract changes
- NONE

### Known limitations
- 실제 iPad Safari/Apple Pencil 실기기 입력, orientation/background 복귀, 장시간 memory/thermal 동작은
  이번 환경에서 검증하지 못했다.
- dense production mesh에서 SVG corner/face redraw와 island 재계산의 latency/memory budget은 실기기에서
  측정하지 못했다.
