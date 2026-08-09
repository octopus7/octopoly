# 11 Texture Paint

## Required
NO — OPTIONAL

11을 구현하지 않아도 01~09에는 문제가 없어야 한다. Texture Paint는 10 UV Editor의 코드나 등록 여부에
의존하지 않는다.

## Start Gates

다음 조건을 모두 만족하기 전에는 branch/worktree를 만들거나 구현을 시작하지 않는다.

- `docs/workplan/09_INTEGRATION.md`의 `RESULT`가 `COMPLETE`이고 immutable ref
  `baseline/optional-sdk-v1`이 검증된 Core integration commit을 가리킨다.
- 09 완료 결과로 Optional SDK baseline이 canonical contract export, optional composition root,
  `PanelRegistry`, extension test fake와 Core-only build 경로를 게시했다.
- Optional SDK가 normalized tool input, mesh query, history 및 image asset boundary를 concrete Core import 없이
  주입할 수 있다.
- 아래 worktree는 `baseline/optional-sdk-v1^{commit}`으로 해석한 정확한 commit에서 분기한다.

런타임 enable gate는 별도다. Paint target의 모든 triangle corner에 complete하고 finite한 `uv0: Vec2`가
있어야 stroke를 시작할 수 있다. 이 조건은 imported/project UV만으로 만족할 수 있으며 10의 설치 여부는
gate가 아니다. UV가 없는 project에서도 extension activation과 Core 사용은 성공하고 paint 기능만 disabled다.

## Execution
```text
Mode: WORKTREE
Branch: wt/texture-paint
Worktree: ../wt-texture-paint
Branch point: `baseline/optional-sdk-v1^{commit}`
```

## Ownership
```text
src/extensions/texture-paint/**
tests/extensions/texture-paint/**
docs/workplan/11_TEXTURE_PAINT.md (주 에이전트가 RESULT만 갱신)
```

공용 contract, Core renderer, 10 UV Editor, shared bootstrap와 package/build 설정은 수정하지 않는다.

## Goal

normalized Apple Pencil pressure를 사용하는 lightweight texture paint를 제공한다. Stroke는 public
`MeshTriangleHit`의 barycentric 좌표로 target triangle의 corner UV를 보간하고, `ImageEditSession`의
revision 변경을
`ReversibleChange`로 만들어 public history transaction에 기록한다.

## Dependency and Data Policy

```text
Mesh에 complete uv0 있음 + 11 -> Paint 가능
10 UV Editor 있음 + 11          -> UV 생성/편집 후 Paint 가능
10 없음 + imported uv0 + 11     -> Paint 가능
uv0 없음/불완전                 -> Paint만 disabled, Core 정상
```

- `uv0`는 `{ domain: "corner", name: "uv0" }`인 `AttributeKey<Vec2>`로 읽기만 한다.
- Texture Paint는 UV를 생성/수정하지 않으며 `src/extensions/uv/**`를 import하지 않는다.
- `MeshTriangulationService`가 Renderer와 동일한 triangle의 정확한 `FaceId`와 세 `CornerId`를 제공한다.
  triangle index를 `FaceId` 또는 `CornerId`로 직접 형변환하지 않는다.
- hit의 mesh version/corner가 현재 snapshot에 존재하고 barycentric가 finite하며 합이 허용오차 안에서 1일 때만
  세 corner의 `uv0`를 barycentric interpolation한다.
- hit miss, stale face/corner mapping, incomplete UV 또는 범위 밖 barycentric는 예외가 아닌 no-stamp 결과다.

## Contract Use

### Public APIs Consumed

- `Tool`, `ToolContext`, `ToolRegistry`, normalized `PointerSample` — stroke down/move/up/cancel
- `MeshQuery`, `MeshSnapshot`, `CornerId`, `AttributeKey<Vec2>` — target topology와 corner UV 읽기
- `PickingService`, `MeshTriangulationService`, `MeshTriangleHit`, `Ray`, camera/viewport values — Renderer와
  동일한 retopo triangle hit와 barycentric projection boundary
- `HistoryService`, `HistoryTransaction`, `ReversibleChange` — stroke 단위 undo/redo
- `ImageAssetService`, `ImageAssetRef`, `ImageEditSession`, `ImageMutationResult` — versioned image
  import/resolve/edit/flush와 project-stable handle
- `ShadingProvider`, `RenderExtensionRegistry` — paint target을 Core 수정 없이 표시하는 texture preview
- `OptionalExtension`, `ExtensionHost`, `ModelingExtensionServices`, `PanelRegistry`, `ExtensionPanel`,
  `RenderExtensionControl`, `ExtensionStateProvider` — additive activation/UI/state/render request/disposal

raw `PointerEvent`, concrete Surface Engine, UV Editor, Renderer GPU handle 또는 image store 내부 구현은 import하지
않는다.

### Public APIs Provided

- `TexturePaintExtension` — paint tool과 extension-owned resources를 등록/해제하는 `OptionalExtension`
- `TexturePaintPanel` — brush/image/disabled 상태를 mount하는 `ExtensionPanel`
- `TexturePreviewShadingProvider` — active paint image를 표시하는 독립 WebGL2 `ShadingProvider`
- `TexturePaintTool` — normalized pointer와 `ToolContext`만 소비하는 `Tool`
- `PaintEligibilityService` — complete `uv0`, target mapping 및 image 상태를 검사하고 disabled reason을 반환
- `PaintTargetAdapter` — `MeshTriangleHit`의 stable face/corner와 active `ImageAssetRef`를 검증
- `BarycentricUvProjector` — `MeshTriangleHit`과 세 corner UV를 texture-space 위치로 변환
- `BrushEngine` — pressure/radius/hardness/opacity/spacing에 따른 deterministic stamp stream 생성
- `PaintSession` — canonical `ImageEditSession`과 dirty tile update를 조정
- `TexturePaintStateProvider` — active image와 brush 설정을 project extension data로 저장

이 API는 Texture Paint optional entrypoint에서만 export하고 Core barrel에는 추가하지 않는다.

## Stroke / Image / History Boundary

1. image 선택 시 `prepareEdit`를 미리 완료한다. 준비되지 않았으면 pointer down은 정상 disabled 결과다.
2. `down`에서 eligibility를 검사하고 준비된 `ImageEditSession`과 history transaction을 시작한다.
3. `move`의 sample마다 `PickingService.rayFromScreen -> MeshTriangulationService.raycast`를 호출하고 valid
   `MeshTriangleHit`의 barycentric UV에 대응하는 `ImageTileUpdate`를 동기 `write`한다.
4. `up`에서 `ImageEditSession.commit`이 반환한 이미 적용된 `ImageMutationResult.change` 하나를
   `recordApplied`하고 transaction 하나를 commit한다.
5. `cancel`, dispose 또는 오류에서는 image session `cancel`로 base revision을 복원하고 transaction을
   rollback한다.
6. import/resolve/remove/flush는 `ImageAssetService`를 통한다. 실패 시 기존 active ref를 유지하고 새 history
   entry나 orphan revision을 남기지 않는다.

## Graceful Disabled / Fallback Behavior

- UV 없음/불완전, target mapping 없음 또는 image 없음은 `missing-uv`, `unmapped-target`, `missing-image` 같은
  stable disabled reason으로 표현하고 pointer result는 unhandled/no-capture로 끝낸다.
- hit miss나 seam 경계에서는 유효한 chart/triangle에만 stamp하며 반대 chart로 임의 bleed하지 않는다.
- pressure가 없거나 mouse 입력이면 명시된 default pressure를 사용하되 범위 `0..1`로 clamp한다.
- image decode/import 실패 시 이전 texture와 Core viewport를 유지한다.
- resource budget을 넘는 image는 allocation 전에 거부하거나 Optional SDK budget에 맞춰 명시적으로 축소한다.
- texture preview provider compile/link 실패 시 paint 상태는 보존하고 Core solid/wireframe으로 fallback한다.
- texture preview provider는 descriptor에서 `uv0` corner `AttributeKey<Vec2>`를 generic mesh attribute로
  요청하며 Core Renderer에 UV-specific code를 추가하지 않는다.
- preview mode enable/disable은 `RenderExtensionRegistry.activateScoped([previewProviderId])` lease를
  사용하며 dispose 시 직전 provider 선택을 복원한다.
- extension 제거/activation 실패 시 Core solid/wireframe, project load와 10 UV Editor는 정상 동작한다.

## Agent Allocation

주 에이전트는 시작 시 아래 경로를 담당자에게 선언한다. 같은 파일에 concurrent write를 허용하지 않는다.

### Agent A — Brush Engine

소유 파일:

```text
src/extensions/texture-paint/brush/**
tests/extensions/texture-paint/brush/**
```

책임: radius/hardness/opacity/pressure mapping, interpolation, spacing, erase/basic blend의 순수 계산.

### Agent B — Surface Hit / UV Projection

소유 파일:

```text
src/extensions/texture-paint/projection/**
src/extensions/texture-paint/target/**
tests/extensions/texture-paint/projection/**
tests/extensions/texture-paint/target/**
```

책임: canonical triangle/corner와 meshVersion validation, barycentric UV lookup, texture-space stamp와 seam/overlap 정책.

### Agent C — Image / Session / Extension Lifecycle

소유 파일:

```text
src/extensions/texture-paint/image/**
src/extensions/texture-paint/session/**
src/extensions/texture-paint/extension/**
tests/extensions/texture-paint/image/**
tests/extensions/texture-paint/session/**
tests/extensions/texture-paint/extension/**
```

책임: image edit session과 dirty tiles, revision change, transaction grouping, image import/export, tool registration,
disabled state와 Pencil feedback.

### Main Agent Reserved

```text
src/extensions/texture-paint/index.*
tests/extensions/texture-paint/integration/**
docs/workplan/11_TEXTURE_PAINT.md (RESULT만)
```

## Acceptance Gates

- [ ] 10을 import하지 않은 상태에서 imported/project `uv0`만으로 paint가 동작한다.
- [ ] UV 없음/불완전 상태에서 extension은 활성화되지만 paint만 disabled되고 image/history가 변하지 않는다.
- [ ] known canonical triangle fixture에서 `MeshTriangleHit` barycentric 보간이 기대 UV와 texture pixel을 생성한다.
- [ ] stale face/corner, invalid barycentric와 miss가 no-stamp이며 예외/부분 변경이 없다.
- [ ] `MeshTriangleHit.meshVersion` mismatch와 project document 교체는 active image/history session을 cancel한다.
- [ ] coalesced sample 순서, spacing과 pressure mapping이 deterministic하고 pressure가 `0..1`을 벗어나지 않는다.
- [ ] stroke 하나가 history entry 하나이며 synchronous undo/redo가 image revision과 dirty tiles를 정확히
      복원하고 renderer resolver notification을 발생시킨다.
- [ ] cancel/dispose/import failure가 before 상태를 복원하고 history/orphan asset을 남기지 않는다.
- [ ] seam/overlap 정책이 fixture로 고정되고 다른 UV chart로 예상치 못한 bleed가 없다.
- [ ] raw PointerEvent, concrete Core renderer/surface 구현 또는 GPU handle 의존이 없다.
- [ ] scoped shading lease와 extension state round trip이 이전 provider 및 unknown extension data를 보존한다.
- [ ] extension directory가 없는 Core-only typecheck/test/build가 성공한다.

## Tests / Validation Plan

Optional SDK baseline의 canonical 명령으로 다음 경로와 사례를 실행한다.

```text
tests/extensions/texture-paint/brush/**
  - pressure endpoints, spacing, interpolation, erase/blend, deterministic stamps
tests/extensions/texture-paint/projection/**
  - barycentric vertices/center/edge, invalid sum, non-finite values, seam boundary
tests/extensions/texture-paint/target/**
  - canonical triangle-to-corner mapping, stale face/corners, complete/partial/missing uv0
tests/extensions/texture-paint/image/**
  - prepare/write/commit/cancel, resolver revision notification, flush failure, size budget, cleanup
tests/extensions/texture-paint/session/**
  - one-stroke transaction, synchronous revision undo/redo, cancel/rollback/dispose
tests/extensions/texture-paint/extension/**
  - register/unregister, UV Editor absent, disabled reasons, repeated dispose
tests/extensions/texture-paint/integration/**
  - fake public boundaries only; no concrete Core or UV Editor import
```

추가로 canonical typecheck/test/build와 extension을 제외한 Core-only build를 실행한다. iPad Safari의 Pencil
latency, memory와 thermal 결과는 실제 측정했을 때만 Acceptance 통과로 기록한다.

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
