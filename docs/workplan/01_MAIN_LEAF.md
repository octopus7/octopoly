# 01 Main Leaf

## Required
YES

## Execution
```text
Mode: WORKTREE
Branch: wt/main-leaf
Worktree: ../wt-main-leaf
Branch point: `baseline/core-v1^{commit}`
```

이 workstream은 `baseline/core-v1^{commit}`으로 해석한 정확한 baseline commit에서 분기한다. 구현, RESULT
갱신 및 커밋은 이 worktree에서만 수행하며 main merge와 cross-module wiring은 09가 담당한다.
`AGENTS.md` 규칙에 따라 이 `Execution` 섹션이 실행 위치의 유일한 기준이며, 아직 동기화되지 않은 상위
요약표보다 우선한다.

## Goal

공용 상태를 소유하지 않는 input, camera, picking, IO, persistence, UI 및 concrete basic tool leaf package를
계약 기반으로 구현한다. 각 package는 독립적으로 테스트할 수 있어야 하며 02~08의 concrete implementation을
직접 import하지 않는다.

## Dependencies

필수 선행 조건:

- `docs/workplan/00_BOOTSTRAP.md`가 `COMPLETE`이고 canonical install/typecheck/test/build 명령 및
  `baseline/core-v1` ref가 게시됨
- baseline의 canonical `src/contracts/**`와 ADR-0001~0005
- browser platform API는 소유 경계 안에서만 사용:
  - raw `PointerEvent`와 pointer capture: `src/input/**`
  - DOM/layout/safe-area: `src/ui/**`
  - IndexedDB/File/Blob: `src/project/**`와 `src/io/**`

사용하는 frozen contract:

- Input: `PointerSample`, `PointerInputSink`, `NormalizedInputSurface`,
  `NormalizedInputSurfaceFactory`, `Disposable`
- Camera/picking: `Vec2`, `Vec3`, `Mat4`, `Ray`, `CameraSnapshot`, `ViewportSnapshot`,
  `PickingService`, `PickHit`, `MeshTriangle`, `MeshTriangleHit`, `MeshTriangulationService`
- Surface adapter: `SurfaceQuery`, `SurfaceHit`
- Tools/overlays: `Tool`, `ToolContext`, `ToolInputResult`, `ToolPreview`, `OverlayPrimitive`
- Mesh/IO/project values: `MeshSnapshot`, `TriangleMeshSnapshot`, `SerializedMesh`, `ProjectDocument`,
  `ImageAssetRef`, `ImageAssetService`, `ImageEditSession`, `ReferenceAssetRef`, `ReferenceAssetService`,
  `PanelRegistry`

02~08의 service는 frozen interface로만 fake/inject한다. `MeshKernel`, renderer backend, history stack, tool
runtime 같은 concrete class를 import하지 않는다. Optional 10~13은 dependency가 아니다.

## Public API and Integration Boundaries

이 workstream이 09에 게시하는 surface는 다음과 같다. 새 cross-module record나 shadow contract를 만들지
않고 입력과 결과는 위 frozen type을 사용한다.

| Package | Public output |
|---|---|
| `src/input/**` | raw DOM event를 소비하고 timestamp 순 `PointerSample`만 `PointerInputSink`로 보내며 반환된 capture/release를 DOM capture에 반영하는 disposable adapter와 panel-local `NormalizedInputSurfaceFactory` |
| `src/camera/**` | immutable `CameraSnapshot` 생성 및 orbit/pan/zoom controller의 leaf entry |
| `src/picking/**` | `PickingService`와 canonical face/corner mapping을 보존하는 `MeshTriangulationService` concrete implementation |
| `src/surface/snapping/**` | injected `SurfaceQuery`를 소비해 `SurfaceHit` 또는 `null`을 반환하는 snapping helpers |
| `src/transforms/**` | frozen math value만 입출력하는 pure transform helpers |
| `src/renderer/overlays/**` | `OverlayPrimitive`와 `ToolPreview`를 생성하는 pure builders |
| `src/tools/**` | `Tool`을 구현하는 select/move/delete 및 vertex/edge/face concrete tools; service는 `ToolContext` 또는 frozen interface로 주입 |
| `src/io/**` | OBJ/glTF/GLB와 `TriangleMeshSnapshot`/`SerializedMesh` 사이의 parser/serializer entry |
| `src/project/**` | `ProjectDocument` validation/migration/IndexedDB/autosave와 `ImageAssetService`/`ReferenceAssetService` 구현 |
| `src/ui/**` | snapshot과 callback을 받는 viewport shell/tool palette 및 `PanelRegistry` 구현; service locator나 domain state를 소유하지 않음 |

모듈별 local `index.ts`는 해당 소유 에이전트가 관리할 수 있다. 저장소 root barrel, `src/app/**`,
`src/contracts/**` 및 실제 service graph/composition root는 수정하지 않는다.

## Ownership

```text
src/input/pen/**
src/input/touch/**
src/input/surface/**
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

tests/input/**
tests/camera/**
tests/surface/snapping/**
tests/picking/**
tests/transforms/**
tests/renderer/overlays/**
tests/tools/basic/**
tests/tools/vertex/**
tests/tools/edge/**
tests/tools/face/**
tests/io/import/**
tests/io/export/**
tests/project/**
tests/ui/**
```

## Explicit Non-Scope

- 02~08 concrete service 생성 또는 application-level 연결
- renderer frame loop/GPU resource, history stack, selection state, mesh topology 또는 tool runtime
- `src/app/**`, shared package/build 설정, canonical contract 및 root barrel 수정
- Optional extension import 또는 Optional 전용 UI
- iPad 실기기 검증을 통과한 것으로 추정하는 것

## Agent Allocation

주 에이전트는 시작 시 아래 경로를 그대로 선언한다. 한 에이전트가 다른 에이전트의 source/test/local
barrel을 수정하지 않는다.

### Agent A — Input / Camera / Interaction

소유 파일:

```text
src/input/pen/**
src/input/touch/**
src/input/surface/**
src/camera/**
src/surface/snapping/**
src/picking/**
src/transforms/**
tests/input/**
tests/camera/**
tests/surface/snapping/**
tests/picking/**
tests/transforms/**
```

책임:

- Pencil/touch/mouse normalization, pressure/tilt clamp, coalesced ordering, capture/cancel cleanup
- panel element-local CSS 좌표/viewport와 동일한 정규화를 제공하는 `NormalizedInputSurfaceFactory`
- touch navigation과 Pencil modeling의 분리된 gesture policy
- orbit/pan/zoom과 immutable camera snapshot
- `PickingService`, deterministic `MeshTriangulationService` 및 injected `SurfaceQuery` 기반 snapping adapter
- CSS pixel/world 변환 helpers

### Agent B — IO / Persistence

소유 파일:

```text
src/io/import/**
src/io/export/**
src/project/**
tests/io/import/**
tests/io/export/**
tests/project/**
```

책임:

- OBJ 및 glTF/GLB parser/serializer와 project-unit normalization
- malformed/unsupported input의 원자적 실패
- `ProjectDocument` validation, migrations 및 unknown `extensionData` 보존
- IndexedDB-backed `ImageAssetService`와 project/local geometry 및 transform을 보존하는
  `ReferenceAssetService` 구현
- synchronous image edit revision/apply/revert, resolver notification, durable `flush`와 budget enforcement
- legacy project/image metadata를 `ImageAssetRef.revision = 0`으로 올리는 migration
- IndexedDB persistence, autosave debounce/cancel/dispose boundary

### Agent C — UI / Overlays / Basic Tools

소유 파일:

```text
src/renderer/overlays/**
src/tools/basic/**
src/tools/vertex/**
src/tools/edge/**
src/tools/face/**
src/ui/**
tests/renderer/overlays/**
tests/tools/basic/**
tests/tools/vertex/**
tests/tools/edge/**
tests/tools/face/**
tests/ui/**
```

책임:

- viewport shell, safe-area/orientation layout와 tool palette
- `ToolPreview`/`OverlayPrimitive` builders
- contract fake로 검증 가능한 select/move/delete 및 vertex/edge/face `Tool` implementations
- cancel 시 preview 제거와 미완료 mutation/transaction 비커밋
- UI가 domain state나 GPU handle을 소유하지 않는지 검증

### Main Agent Reserved

- `docs/workplan/01_MAIN_LEAF.md`의 `RESULT`
- 세 agent의 canonical contract import 및 public surface audit
- cross-package wiring 없이 workstream 전체 검증
- branch commit 준비와 09 handoff

## Internal Work Sequence and Gates

1. **Gate 0 — Baseline:** `baseline/core-v1`의 resolved SHA, canonical contract import, test command 및
   WORKTREE 위치를 확인한다.
   하나라도 맞지 않으면 구현을 시작하지 않는다.
2. **Gate 1 — Boundary freeze:** 주 에이전트가 위 dependency/public output/소유 경로를 선언하고 각 agent가
   자신의 contract fake와 fixture만 만든다.
3. **Gate 2 — Parallel leaf implementation:** A/B/C는 서로의 concrete code를 import하지 않고 병렬
   구현한다. 필요한 값은 `src/contracts/**` 또는 자신의 순수 helper에서만 가져온다.
4. **Gate 3 — Package validation:** 각 agent의 targeted tests와 canonical typecheck를 통과시킨다. cancel,
   malformed input 및 dispose 경로를 정상 경로와 함께 검증한다.
5. **Gate 4 — Handoff audit:** 주 에이전트가 02~08 concrete import, Optional import, raw `PointerEvent`
   누출, shared file 변경이 없음을 검사하고 09가 조립할 entry와 요구사항을 RESULT에 기록한다.

## Concrete Tests / Validation

### Input / Camera / Picking

- pen/touch/mouse가 올바른 `pointerType`과 down/move/up/cancel/hover phase로 정규화된다.
- coalesced samples가 원본 sample보다 먼저 monotonic timestamp 순으로 dispatch되고 중복되지 않는다.
- pressure는 0..1, tilt는 degree 범위로 정규화되며 raw `PointerEvent`가 sink에 전달되지 않는다.
- capture 중 cancel/lost capture/dispose가 capture와 preview 경로를 정리하고 이후 callback을 발생시키지 않는다.
- panel-local input surface가 element 기준 CSS 좌표, viewport update와 동일한 capture/cancel 규칙을 지킨다.
- touch orbit/pan/zoom이 Pencil modeling sample로 오인되지 않는다.
- screen point/camera/viewport와 known vertex/edge/face fixture의 pick 결과, CSS-pixel radius 및 miss가
  결정적이다. Reference hit는 `rayFromScreen -> SurfaceQuery`의 별도 fixture로 검증한다.
- 동일 mesh version의 canonical triangle/corner ordering, retopo raycast barycentric와 degenerate miss가
  결정적이고 hit가 정확한 `meshVersion`을 가지며 Renderer가 소비할 public service로 게시된다.
- `SurfaceQuery` fake의 hit/miss/max-distance를 snapping adapter가 그대로 보존한다.

### IO / Project

- 최소 OBJ와 glTF/GLB fixture import가 project unit의 `TriangleMeshSnapshot`으로 변환된다.
- export 후 재import한 position/index/topology와 supported attribute가 허용오차 안에서 round-trip한다.
- malformed index, non-finite geometry, unsupported version 및 취소는 부분 document/DB write를 남기지 않는다.
- 이전 schema migration이 현재 `ProjectDocument`를 만들고 unknown `extensionData`를 보존한다.
- image/reference asset service가 create/import, resolve, remove와 dispose 수명을 지키고 reference
  geometry 및 `worldTransform`을 save/reload 뒤 보존한다.
- image edit의 transient revision, commit/undo/redo/cancel, resolver notification과 `flush` failure가
  기존 durable project를 손상시키지 않는다.
- stale async image resolve 완료가 최신 revision을 덮지 않고 history change dispose 전 before/after revision을
  유지하며 legacy revision migration이 결정적이다.
- autosave debounce, 마지막 write 승리, write failure, cancel 및 dispose 후 callback 금지를 검증한다.

### UI / Tools / Overlays

- safe-area와 orientation resize가 CSS pixel viewport를 갱신하되 device-pixel 계산을 소유하지 않는다.
- select/move/delete와 vertex/edge/face tools가 `ToolContext` fake만으로 activate/pointer/cancel 가능하다.
- pointer cancel은 preview를 제거하고 history commit을 만들지 않으며 delete/commit은 명시된 한 transaction에
  기록된다.
- overlay builders가 immutable `ToolPreview`를 만들고 revision 변화가 결정적이다.
- `PanelRegistry`가 duplicate id, register/get/unregister/dispose와 panel 정확히 한 번 dispose를 검증한다.
- Optional 10~13 source를 제거한 module graph에서도 targeted tests와 typecheck가 통과한다.

검증 명령은 00의 canonical 명령과 가능한 가장 좁은 targeted test 명령을 RESULT에 정확히 기록한다.
실기기 항목은 실제 수행 여부를 분리한다.

## Acceptance Gates

- [ ] `Mode: WORKTREE`, `wt/main-leaf` 및 `baseline/core-v1`의 resolved SHA가 확인되었다.
- [ ] 세 agent의 source/test ownership이 겹치지 않고 Ownership 밖 파일을 수정하지 않았다.
- [ ] 모든 cross-module dependency가 canonical frozen contract 또는 contract fake를 사용한다.
- [ ] raw `PointerEvent`가 `src/input/**` 밖으로 노출되지 않는다.
- [ ] `PickingService`, concrete `Tool`, IO/project leaf entry, 두 asset service, `PanelRegistry`와 overlay
      builders가 게시되었다.
- [ ] 정상, miss, malformed, cancel, dispose 및 rollback 경로의 targeted tests가 통과했다.
- [ ] Core build/test가 Optional 10~13 import 없이 성립한다.
- [ ] application wiring, root barrel 및 02~08 concrete import가 포함되지 않았다.
- [ ] iPad Safari/Pencil 실기기 미검증 항목이 있으면 `Known limitations`에 남겼다.
- [ ] 09가 소비할 entry, fixtures, 연결 순서와 contract 요청이 RESULT에 기록되었다.

## Integration Outputs for 09

- module별 local public entry 목록과 concrete `PickingService`/`Tool` 구현 목록
- DOM element → input adapter → `PointerInputSink` 연결 요구사항과 capture/cancel 정책
- camera/viewport/picking, snapping, preview/UI가 필요로 하는 frozen service injection 목록
- imported reference/project/export 데이터의 canonical contract value와 unit/migration 규칙
- IndexedDB store/version/autosave lifecycle 및 failure propagation 규칙
- 09에서만 수행할 input → tool runtime, camera → renderer, picking → selection, tools → mesh/history,
  project IO → service graph 연결 목록
- 실행한 browser/fixture tests와 남은 iPad Safari/Pencil 검증
- contract gap이 있으면 Change Request Format에 맞춘 요청; 없으면 `NONE`

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
