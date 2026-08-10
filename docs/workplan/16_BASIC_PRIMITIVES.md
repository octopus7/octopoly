# 16 Basic Primitives and Reference-Free Start

## Required

YES — 사용자가 reference asset 없이 빈 workspace에서 첫 mesh를 만들 수 없는 현재 제품 blocker를 닫는
post-14 Core 기능이다.

이 workstream의 완료 조건은 단순히 primitive 버튼을 노출하는 것이 아니다. 빈 scene에서 Plane 또는 Cube를
생성하고, 선택·카메라 framing·최소 reference-free Move/Extrude·undo/redo·save/reload·export까지 실제 UI
흐름으로 완료할 수 있어야 한다.

## Policy Compatibility Gate

이 문서는 `00~15` 이후의 독립적인 후속 기능 workstream이다. 루트 `AGENTS.md`의 frozen contract, Optional
격리, iPad-first, worktree, 검증 및 RESULT 규칙을 그대로 따른다.

- 14의 개발 통합 commit은 사용할 수 있지만, 실제 iPad Safari/Apple Pencil hard gate 미검증으로 생성되지
  않은 `baseline/full-v1`은 시작 조건으로 요구하지 않는다.
- 14의 `Status: BLOCKED`는 release tag를 막는 기기 증거 상태다. 아래 입력 commit이 존재하고 최신 main이 그
  후손이면 16의 개발 시작을 막지 않는다.
- 16은 10~13 Optional 내부 구현을 수정하지 않으며 Core가 Optional source를 import하게 만들지 않는다.
- `docs/workplan/INTERFACE_CONTRACTS.md`와 `src/contracts/**`는 frozen 상태를 유지한다. 기존 canonical API로
  구현할 수 없는 구체적인 누락이 발견되면 shadow type이나 의미 왜곡으로 우회하지 않고 작업을 중단한다.
- 이 문서의 Integration Ownership은 16 기능 branch 안의 제한된 composition/UI 연결을 허용할 뿐, 다른
  worktree merge, main 직접 수정, Pages 배포 또는 release tag 생성 권한을 부여하지 않는다.
- 새로운 래스터 asset은 필요하지 않다. 기본 도형, 아이콘, empty-state 장식은 HTML/CSS/canvas 또는 SVG 같은
  code-native 방식으로 구현하며 ImageGen을 억지로 사용하지 않는다.

## Execution

```text
Mode: WORKTREE
Branch: wt/basic-primitives
Worktree: ../wt-basic-primitives
Order: AFTER PLANNING COMMIT PUSH; MAY RUN IN PARALLEL WITH 18 AND 17 EARLY CORE
Minimum input ancestor: e54edeed9094d71679b4b081729a34354e820e4a
Branch point: exact immutable `POST_PLAN_BASE_SHA` recorded after the planning commit push
Output: FINAL BASIC PRIMITIVES FEATURE COMMIT + RESULT ON wt/basic-primitives
Push: origin/wt/basic-primitives AFTER ACCEPTANCE; NEVER FORCE-PUSH
Immutable release tag: NONE
```

### Baseline resolution gate

구현을 시작할 때 다음 순서로 입력 SHA를 확정한다.

1. planning commit이 `origin/main`에 push되었고 그 exact commit이 `POST_PLAN_BASE_SHA`로 공지되었는지 확인한다.
2. `git merge-base --is-ancestor e54edeed9094d71679b4b081729a34354e820e4a "$POST_PLAN_BASE_SHA"`가 성공해야 한다.
3. `git rev-parse origin/main^{commit}`이 공지된 SHA의 후손인지 확인하되 mutable tip을 branch point로 대체하지 않는다.
4. `wt/basic-primitives` branch/worktree를 정확히 `POST_PLAN_BASE_SHA`에서 생성하고 시작 SHA를 RESULT에 기록한다.
5. `baseline/full-v1`의 존재 여부는 확인 자료로만 기록하며 부재를 blocker로 취급하지 않는다.

공지된 SHA가 없거나 최소 입력 commit의 후손이 아니거나, 지정 worktree를 clean하게 만들 수 없거나, 같은 경로에
분리할 수 없는 사용자 변경이 있으면 구현을 시작하지 않는다.

## Goal

다음 사용자 흐름을 Core에 추가한다.

```text
New Scene empty state
-> Add Plane (1단계 MVP) 또는 Add Cube (2단계)
-> 생성 topology 자동 선택
-> Frame Selection
-> reference가 없어도 최소 Move / Extrude
-> grouped Undo / Redo
-> project save / reload
-> OBJ / GLB export
```

기본 도형은 별도 GPU primitive가 아니라 기존 editable retopo mesh에 추가되는 일반 topology다. 동일한 mesh,
history, selection, renderer, project 및 export 경로를 끝까지 재사용한다.

## Non-Goals

- Sphere, Cylinder, Cone, Torus 또는 segments/pole/cap 설정. Sphere/Cylinder는 별도 후속 workstream으로 미룬다.
- object/document model, object별 transform, 이름/visibility, parenting, collection, outliner, duplicate/instance
- Rotate/Scale 도구, 축/평면 gizmo 전체 suite, snapping grid, 수치 입력 및 transform orientation UI
- 자유 위치/크기를 pointer drag로 정하는 interactive primitive placement tool
- destructive `New`, project 목록, Open, Save As, dirty prompt, autosave recovery 같은 전체 project lifecycle
- Create Vertex 또는 Retopo Stroke를 reference 없이 동작하도록 일반화하는 작업
- reference가 있을 때의 surface snapping, Retopo inference 또는 기존 tool 알고리즘 재설계
- mesh/history/selection/renderer/project frozen public contract 변경
- Optional 10~13 내부 기능 변경, Optional loader 재설계 또는 Core에서 Optional import 추가
- 마우스 orbit/pan/wheel camera navigation과 Guided Retopo. 두 기능은 각각 별도 후속 workstream이다.
- Cloudflare Pages 배포, production 운영, `baseline/full-v1`, `deploy/*` 또는 다른 immutable tag 생성

`New Scene`은 이 문서에서 초기 또는 빈 document의 사용자-visible empty state를 뜻한다. 기존 작업을 버리는
destructive reset command와 미저장 확인은 project lifecycle workstream으로 남긴다.

## Existing Contracts and API Reuse

| 기능 | 재사용할 기존 경계 | 16의 원칙 |
|---|---|---|
| topology 생성 | `MeshMutationService.execute`, `createVertex`, `createFace`, `MeshMutationResult.created` | ID를 예측하지 않고 실제 결과에서 수집 |
| 원자성 | 이미 forward 적용된 `MeshPatch`, `HistoryTransaction.recordApplied/commit/rollback` | 한 primitive 전체를 history entry 하나로 기록 |
| 선택 | `SelectionService.update("replace", ...)`, `prune` | 성공한 생성 결과만 선택하고 실패 시 이전 선택 유지 |
| framing | local `OrbitCameraController`, canonical `CameraSnapshot`/`ViewportSnapshot` | local controller 기능만 확장하고 camera contract는 변경하지 않음 |
| drag target | `PickingService.rayFromScreen`, 기존 reference `SurfaceQuery` | reference hit 우선, miss일 때만 local construction-plane fallback |
| rendering | `CoreWorkspace.sceneSnapshot()`, retopo mesh version 기반 renderer update | primitive 전용 render pass/GPU resource를 만들지 않음 |
| persistence | `MeshDocument.serialize`, `MeshFactory.restore`, `ProjectDocument` | primitive 전용 schema나 repository를 만들지 않음 |
| export | 기존 `exportObj`, `exportGlb` | 동일 editable mesh export 경로 사용 |

새 cross-module service, event, record 또는 shadow contract를 만들지 않는다. 필요한 helper나 recipe type은 16이
소유한 package-local implementation detail로 유지하고 입출력에는 canonical `Vec3`, element ID, snapshot 및
service type을 사용한다.

## New Scene Empty State

초기 empty mesh를 오류나 로딩 상태가 아닌 명시적인 `New Scene` 상태로 표시한다.

- retopo mesh에 live vertex/face가 없을 때 empty-state CTA를 표시한다.
- reference도 없으면 `Import Reference`, `Add Plane`, `Add Cube`를 같은 시작 선택지로 제공한다.
- reference는 있지만 retopo mesh가 비어 있으면 reference viewport를 가리지 않는 compact CTA로 전환한다.
- viewport와 camera는 empty state에서도 mount된 상태를 유지하며, CTA는 canvas/WebGL lifecycle을 대체하지
  않는다.
- primitive 생성 성공 또는 project load로 editable mesh가 생기면 CTA를 닫는다.
- Undo로 다시 empty mesh가 되면 CTA가 돌아오고, Redo 시 다시 닫힌다.
- 버튼은 keyboard focus, accessible name, disabled/busy 상태와 최소 44 CSS pixel hit target을 갖는다.
- 장식이 필요하면 CSS 또는 저장소-native SVG를 사용한다. bitmap asset과 ImageGen은 사용하지 않는다.

## Stage 1 — Add Plane MVP

### Geometry recipe

기본 크기는 1 project unit이며 원점 중심 XY plane, `+Z` outward winding으로 고정한다.

```text
v0 = (-0.5, -0.5, 0)
v1 = ( 0.5, -0.5, 0)
v2 = ( 0.5,  0.5, 0)
v3 = (-0.5,  0.5, 0)
face = [v0, v1, v2, v3]
```

성공 결과:

- vertex 4, edge 4, corner 4, quad face 1
- 생성 face 하나를 `replace` selection으로 선택
- 한 번의 `Frame Selection`으로 viewport 중앙에 안전한 padding을 두고 표시
- reference asset이 없어도 즉시 렌더링
- Undo 한 번으로 생성 전 mesh, Redo 한 번으로 동일 stable ID와 topology 복원

### Command semantics

primitive 생성은 pointer lifecycle을 소유하는 `Tool`이 아니라 즉시 실행 command로 구현한다.

```text
begin("Add plane")
-> createVertex × 4를 순차 실행
-> 각 MeshMutationResult.created.vertices에서 실제 ID를 수집
-> 수집한 ID로 createFace × 1 실행
-> 이미 적용된 모든 patch를 같은 transaction에 recordApplied
-> topology/count/bounds 검증
-> commit 한 번
-> 생성 face replace-selection
-> Frame Selection
-> render 요청
```

- `batch`에 아직 존재하지 않는 vertex ID를 미리 넣거나 allocator 순서를 추측하지 않는다.
- 각 `createVertex` 결과에는 정확히 하나의 새 vertex가, `createFace` 결과에는 정확히 하나의 새 face가 있어야
  한다. 결과 shape가 다르면 성공으로 계속하지 않는다.
- mutation 또는 검증이 중간에 실패하면 transaction을 역순 rollback한다. 부분 vertex/edge/corner/face,
  history entry 또는 바뀐 selection을 남기지 않는다.
- selection과 camera는 mesh patch/history에 위장해 넣지 않는다. 생성 transaction이 성공한 뒤 결정적인
  post-action으로 적용하며, 생성 실패 시 이전 selection과 camera를 유지한다.

## Stage 2 — Add Cube

Stage 1 Plane의 unit/integration/UI acceptance가 먼저 통과한 뒤 같은 command/transaction 경로에 Cube recipe를
추가한다. Cube를 위해 별도 mutation service나 renderer path를 만들지 않는다.

기본 크기는 1 project unit, 원점 중심이며 다음 topology를 사용한다.

```text
vertices: 8
edges: 12
corners: 24
quad faces: 6
```

모든 face는 outward winding이어야 한다. recipe test는 각 face normal이 cube center에서 face center로 향하는
벡터와 양의 dot product를 갖는지 검증한다.

- vertex 8개를 순차 생성하고 실제 `created.vertices` ID를 수집한다.
- 6개 face를 recipe 순서대로 생성하고 실제 `created.faces` ID를 수집한다.
- 전체 14개 mutation patch를 history transaction 하나에 기록한다.
- 생성된 6개 face를 모두 `replace` selection으로 선택하고 전체 cube bounds를 frame한다.
- 중간 face 하나라도 실패하면 8개 vertex와 앞서 생성된 face까지 모두 rollback한다.
- Cube도 단일 mesh 안의 disconnected component일 뿐 별도 object가 아니다.

## Frame Selection

primitive 직후 자동 호출하고 toolbar/action에서도 재사용할 수 있는 local composition 기능으로 구현한다.

1. selected vertex는 그 position을 직접 사용한다.
2. selected edge는 두 endpoint를 포함한다.
3. selected face는 ordered corner가 참조하는 모든 vertex를 포함한다.
4. 중복 vertex를 제거한 뒤 finite AABB, center와 bounding radius를 계산한다.
5. 현재 view direction과 up orientation을 유지하면서 viewport aspect/FOV에 맞는 거리로 camera target과
   position을 이동한다.
6. 최소 반경과 15% 이상의 screen padding을 적용해 단일 vertex나 매우 얇은 Plane에서도 non-finite 또는
   near-plane clipping을 만들지 않는다.
7. 선택이 비었거나 live element가 없으면 명시적인 no-op이며 camera를 바꾸지 않는다.

`CameraSnapshot` 또는 frozen camera contract를 변경하지 않는다. local `OrbitCameraController`와
`CoreWorkspace` entry만 최소 확장하고 camera change publish와 render request를 기존 경로로 보낸다.

## Reference-Free Move / Extrude Decision

### Scope decision

최소 construction-plane fallback과 `Frame Selection`을 16에 **포함한다**. 이유는 Plane/Cube를 생성해도 현재
Move와 Extrude가 reference surface hit에만 의존하면 reference 없는 사용자가 생성된 mesh를 실질적으로
편집할 수 없기 때문이다. 버튼만 추가하고 편집 경로를 다음 작업으로 미루면 이 workstream의 사용자 흐름이
닫히지 않는다.

다만 full transform/gizmo suite는 포함하지 않는다.

### Fallback policy

- reference `SurfaceQuery`가 유효한 hit를 반환하면 기존 surface-snapped target을 그대로 우선한다.
- reference miss 또는 reference 부재일 때만 pointer-down 시점에 local construction plane을 생성하고 gesture
  종료까지 고정한다. gesture 중간에 target mode를 바꿔 위치가 튀지 않게 한다.
- Move는 picked anchor를 지나는 camera-facing plane과 pointer ray의 교점을 사용해 selected vertices를
  view-plane에서 이동한다.
- Extrude는 selected face들의 finite area-weighted normal을 구하고, 그 normal을 포함하는 best-conditioned
  drag plane을 gesture 시작 시 고정한다. pointer target 변화는 face normal 성분으로 투영해 normal-direction
  offset으로 사용한다.
- camera ray와 plane이 평행에 가깝거나 normal이 degenerate하거나 finite intersection을 얻지 못하면 mutation을
  실행하지 않고 사용자에게 recoverable 상태를 표시한다.
- pointer cancel, lost capture, tool deactivate 또는 zero displacement는 transaction/history entry를 남기지
  않는다.
- raw `PointerEvent`를 tools/composition에 노출하지 않고 기존 normalized `PointerSample`과
  `PickingService.rayFromScreen`을 사용한다.

이 최소 fallback은 Move의 view-plane 이동과 Extrude의 face-normal 이동만 제공한다. axis lock, XY/XZ/YZ
plane picker, transform gizmo, numeric input, Rotate/Scale은 후속 범위다. `CreateVertexTool`과
`RetopoStrokeTool`의 reference surface 요구도 그대로 남는다.

## Integration Ownership

16 구현 branch에서만 아래 경로를 수정할 수 있다.

```text
src/app/composition/primitive-creation.*
src/app/composition/primitive-recipes.*
src/app/composition/primitive-entry.*
src/app/basic-primitives-ui.*
src/tools/basic/construction-plane.*
src/tools/basic/move-tool.ts
src/tools/face/extrude-face-tool.ts

tests/app/composition/primitive-creation.test.*
tests/app/composition/primitive-recipes.test.*
tests/tools/basic/basic-tools.test.ts
tests/tools/basic/construction-plane.test.*
tests/tools/face/extrude-face-tool.test.ts
tests/bootstrap/basic-primitives-empty-state.test.*
tests/e2e/basic-primitives-browser.*
docs/validation/basic-primitives/**

docs/workplan/16_BASIC_PRIMITIVES.md (RESULT만)
```

기존 파일 구조가 다르면 구현 전에 동등한 정확한 경로를 선언하고 소유 목록을 RESULT에 기록한다. 다음은
명시적으로 Ownership 밖이다.

```text
src/contracts/**
docs/workplan/INTERFACE_CONTRACTS.md
src/mesh/**
src/history/**
src/selection/**
src/renderer/core/**
src/renderer/retopo/**
src/project/**
src/io/**
src/extensions/**
src/optional/**
src/optional-sdk/**
package.json 및 lockfile
tsconfig* / Vite / Vitest / CI 설정
```

Ownership 밖 수정이 필요하면 구현을 멈추고 구체적인 파일, 이유, 대안과 영향을 보고한다.

## Agent Allocation

주 에이전트는 구현 시작 전에 아래 파일 소유를 그대로 선언한다. Plane Stage 1 gate 전에는 Cube Stage 2를
완료 처리하지 않으며, 동일 파일을 둘 이상의 agent가 수정하지 않는다.

### Agent A — Primitive Recipes and Atomic Command

소유 파일:

```text
src/app/composition/primitive-creation.*
src/app/composition/primitive-recipes.*
tests/app/composition/primitive-creation.test.*
tests/app/composition/primitive-recipes.test.*
```

책임:

- Plane recipe와 순차 ID 수집, one-transaction command, validation 및 rollback
- Stage 1 gate 뒤 Cube recipe, outward winding과 전체 rollback
- canonical mesh/history/selection type만 소비하고 allocator ID를 예측하지 않음
- primitive 전용 project schema, renderer path 또는 shared contract를 만들지 않음

### Agent B — Framing and Construction-Plane Editing

소유 파일:

```text
src/tools/basic/construction-plane.*
src/tools/basic/move-tool.ts
src/tools/face/extrude-face-tool.ts
tests/tools/basic/basic-tools.test.ts
tests/tools/basic/construction-plane.test.*
tests/tools/face/extrude-face-tool.test.ts
```

책임:

- finite bounds framing과 viewport aspect/FOV padding
- reference-first, construction-plane-second Move target
- finite area-weighted face normal과 normal-direction Extrude fallback
- parallel/degenerate/no-op/cancel/lost-capture 경계 검증
- 기존 reference-snapped tool 동작 회귀 방지

### Agent C — Empty-State UI and Browser Validation

소유 파일:

```text
src/app/basic-primitives-ui.*
tests/bootstrap/basic-primitives-empty-state.test.*
tests/e2e/basic-primitives-browser.*
docs/validation/basic-primitives/**
```

책임:

- New Scene empty state와 Import/Add Plane/Add Cube/Frame Selection UI
- busy/error/keyboard/accessibility/44 CSS pixel hit target 상태
- 실제 browser에서 WebGL2 canvas와 버튼 클릭부터 render/framing/export까지 smoke evidence
- bitmap 없이 HTML/CSS/SVG code-native UI 유지

### Main Agent Reserved

소유 파일:

```text
src/app/composition/primitive-entry.*
docs/workplan/16_BASIC_PRIMITIVES.md (RESULT만)
```

책임:

- baseline/worktree/ownership gate 판정
- Agent A의 command와 Agent B의 framing/fallback을 package-local primitive entry에 연결
- Agent C가 사용할 additive UI adapter와 event/update 경로 동결
- Stage 1 Plane acceptance 후 Stage 2 Cube 시작 승인
- branch-local fixture 회귀, 최종 실제 UI vertical slice, RESULT와 branch commit/push
- `core-workspace.ts`, shared bootstrap/camera barrel 및 cross-feature E2E 조립은 19 Phase A로 이관

## Work Sequence and Gates

1. **Gate 0 — Baseline:** 최소 입력 SHA, 최신 main descendant, clean worktree, canonical commands와 frozen
   contracts를 확인한다.
2. **Gate 1 — Ownership/API freeze:** Main Agent가 위 경로와 package-local 함수 signature를 선언한다.
   `src/contracts/**`, shared config 및 Optional 경로 변경이 없음을 확인한다.
3. **Gate 2 — Parallel foundations:**
   - Agent A는 Plane recipe/atomic command를 구현한다.
   - Agent B는 framing math와 reference-free construction-plane helpers를 병렬 구현한다.
   - Agent C는 frozen callback/API를 기준으로 empty-state DOM/CSS와 browser fixture를 준비한다.
4. **Gate 3 — Plane vertical slice:** Main Agent가 `Add Plane -> selection -> frame -> render -> Move/Extrude ->
   undo/redo -> save/reload -> export`를 연결한다. Stage 1의 unit/integration/UI tests가 모두 통과해야 한다.
5. **Gate 4 — Cube Stage 2:** Gate 3 뒤 Agent A가 Cube recipe를 같은 command path에 추가하고 Agent C가 UI와
   browser fixture를 확장한다. 별도 object 또는 renderer path를 추가하지 않는다.
6. **Gate 5 — Failure closure:** vertex/face 중간 실패, invalid winding, degenerate plane, pointer cancel,
   empty selection, save/load/export failure가 부분 mesh/history/selection 또는 stale preview를 남기지 않는지
   검증한다.
7. **Gate 6 — Regression:** canonical typecheck/test/build, Core-only physical Optional removal, Full Optional
   matrix와 기존 reference import/retopo vertical slice를 실행한다.
8. **Gate 7 — Actual UI:** real browser에서 New Scene CTA부터 Plane/Cube 렌더, framing, 편집, undo/redo,
   save/load/export를 버튼 존재 확인이 아닌 실제 상태 변화로 검증한다.
9. **Gate 8 — RESULT:** evidence와 미검증 실기기 항목을 기록하고 final feature commit을 만든 뒤 같은 이름의
   origin branch로 non-force push한다. main merge와 tag는 수행하지 않는다.

## Tests and Validation

### Unit — Recipe / Command / Atomicity

- Plane recipe가 4 vertices/1 quad와 `+Z` winding을 만든다.
- Cube recipe가 8 vertices/6 quads를 만들고 결과 snapshot이 12 edges/24 corners를 가지며 모든 face가
  outward winding이다.
- 생성 ID는 매 `MeshMutationResult.created`에서만 수집되고 non-contiguous ID fixture에서도 정확하다.
- 모든 patch가 같은 transaction에 등록되며 Plane/Cube 각각 history entry가 정확히 하나다.
- N번째 vertex 또는 face 생성 실패 시 앞선 모든 patch가 역순 rollback되고 mesh version/topology/stable ID
  상태가 생성 전 snapshot으로 돌아간다.
- 실패 시 selection/camera/history label이 바뀌지 않는다.
- Undo/Redo가 같은 stable ID, topology, attributes와 version lifecycle을 복원한다.

### Unit — Frame / Construction Plane

- vertex/edge/face/mixed selection에서 중복 없는 finite bounds를 계산한다.
- portrait/landscape와 극단 aspect에서 선택 전체가 padding 안에 들어오며 camera target/position이 finite다.
- empty selection은 no-op이고 단일 vertex/flat Plane은 near-plane 오류를 만들지 않는다.
- reference hit가 있으면 기존 surface target이 fallback보다 우선한다.
- reference miss에서는 Move의 camera-facing plane이 gesture 시작 anchor에 고정된다.
- Extrude는 finite averaged normal 방향 offset만 만들고 winding/degenerate face에서 안전하게 거부한다.
- parallel ray, zero delta, cancel, lost capture와 deactivate는 mutation/history/preview를 남기지 않는다.

### Integration

- empty `CoreWorkspace`에서 Add Plane/Cube command가 실제 Mesh Kernel, History, Selection과 연결된다.
- primitive 성공 후 `sceneSnapshot().retopo.version`과 selection이 갱신되고 Renderer가 같은 mesh를 그린다.
- Undo 후 empty state가 돌아오고 Redo 후 같은 topology가 다시 렌더링된다.
- reference가 없는 Plane/Cube에서 Move와 Extrude가 성공한다.
- reference가 있는 기존 Move/Extrude는 surface-snapped 결과를 유지한다.
- 생성 mesh를 save한 뒤 새 workspace에 reload하면 topology/IDs가 유지된다.
- OBJ/GLB export와 재import round trip이 허용오차 안에서 동일 geometry를 만든다.
- document replacement, context loss/restore 및 extension model-change 알림이 회귀하지 않는다.

### E2E / Actual Browser UI

최소 다음 두 흐름을 실제 WebGL2 browser에서 실행한다.

```text
New Scene -> Add Plane -> selected + framed -> Move -> Extrude
-> Undo -> Redo -> Save -> Reload -> Export OBJ/GLB

New Scene -> Add Cube -> six faces selected + framed
-> Undo -> empty state -> Redo -> rendered cube
```

각 흐름은 DOM 버튼 존재만 확인하지 않는다. mesh counts, selected IDs, camera 변화, rendered non-empty frame,
history labels, saved document, reload 결과, export payload, console warning/error 0을 evidence로 기록한다.

실제 iPad Safari/Apple Pencil 검증을 수행하지 못했다면 통과로 추정하지 않고 RESULT의 Known limitations에
기록한다. 16은 release baseline을 만들지 않으므로 이 미검증만으로 구현 branch의 `COMPLETE`를 금지하지는
않지만, 향후 release gate를 대체하지도 않는다.

### Canonical Regression Commands

실제 package scripts를 시작 시 다시 확인한 뒤 최소 다음을 실행한다.

```text
npm run typecheck
npx vitest run tests/app/composition tests/camera tests/tools/basic tests/tools/face tests/bootstrap
npx vitest run tests/integration/core-workspace.integration.test.ts tests/e2e/core-workspace-vertical.test.ts
npm run verify:core
npm run verify:optional
npm run verify:ipad
npm run ci
```

`verify:core`는 Optional source가 없는 Core 경로를, `verify:optional`은 Optional source roots를 물리적으로
제거한 Core와 Full Optional 조합을 기존 정책대로 검증해야 한다. 명령 이름이 baseline에서 달라졌다면 임의로
script를 추가하지 않고 동등한 existing command를 RESULT에 기록한다.

## Acceptance Gates

- [ ] 구현 branch가 planning push로 확정된 exact immutable `POST_PLAN_BASE_SHA`에서 시작했고
  `baseline/full-v1` 부재를 blocker로 쓰지 않았다.
- [ ] Agent A/B/C/Main Agent의 실제 수정 파일이 겹치지 않고 Integration Ownership 안에 있다.
- [ ] frozen public contract, shared config, mesh/history/selection/renderer/project concrete implementation을
      불필요하게 변경하지 않았다.
- [ ] New Scene empty state가 Import Reference, Add Plane, Add Cube의 실제 시작 경로를 제공한다.
- [ ] Add Plane이 정확한 quad topology, one transaction, rollback, selection, framing과 rendering을 제공한다.
- [ ] Plane vertical slice가 통과한 뒤 Add Cube Stage 2가 시작되었다.
- [ ] Add Cube가 정확한 counts/outward winding, one transaction, rollback, selection과 framing을 제공한다.
- [ ] ID를 예측하지 않고 sequential mutation result에서 수집했다.
- [ ] reference hit 우선 정책과 reference-free Move/Extrude fallback이 모두 통과했다.
- [ ] full gizmo/object/outliner/Rotate/Scale/Sphere/Cylinder가 범위에 섞이지 않았다.
- [ ] Undo/Redo stable-ID round trip과 save/reload, OBJ/GLB export round trip이 통과했다.
- [ ] 실제 UI E2E가 New Scene에서 생성·편집·저장·재로드·export까지 상태 변화로 검증되었다.
- [ ] Core-only와 Full Optional 회귀, canonical typecheck/test/build/CI가 통과했다.
- [ ] 실제 실행하지 않은 iPad/Pencil 항목과 performance 위험을 Known limitations에 기록했다.
- [ ] RESULT를 갱신하고 clean feature commit을 `wt/basic-primitives`에 만들었으며 루트 사전 승인에 따라
      같은 origin branch로 non-force push했다.
- [ ] main merge, Pages deploy 또는 immutable release tag를 수행하지 않았다.

## Failure and Stop Rules

- 최소 입력 SHA가 없거나 candidate main이 그 후손이 아니면 시작하지 않는다.
- worktree가 dirty하거나 기존 사용자 변경과 Ownership 파일이 겹쳐 안전하게 분리할 수 없으면 중단한다.
- 구현에 frozen contract, shared config, mesh/history/selection kernel 또는 Optional 내부 수정이 필요하면
  우회하지 않고 필요한 signature/path/이유를 보고한다.
- 순차 생성 중 실패 후 live topology/version/history/selection이 원상 복구되지 않으면 다음 stage로 진행하지
  않는다. 소비된 stable ID는 삭제 후 재사용하지 않는 공용 정책에 따라 allocator를 되감지 않아도 된다.
- Plane Stage 1의 실제 vertical slice가 통과하지 않으면 Cube Stage 2를 완료 처리하지 않는다.
- construction-plane fallback이 `SurfaceHit`에 가짜 reference ID를 넣거나 `SurfaceQuery` 의미를 바꿔야만
  동작한다면 그 방식을 사용하지 않고 중단한다.
- non-finite camera, blank frame, invalid/inside-out topology, unrecoverable pointer capture 또는 stale preview는
  blocker다.
- reference가 있을 때의 기존 surface-snapped Move/Extrude나 09 Core vertical slice가 회귀하면 완료하지 않는다.
- Optional source physical-removal gate 또는 Full Optional regression이 실패하면 원인을 해결하거나
  `BLOCKED`로 기록한다.
- 실제 browser/WebGL2 UI 흐름을 실행하지 못하면 버튼 unit test만으로 `COMPLETE`를 선언하지 않는다.
- 기존 immutable tag를 이동하거나 덮어쓰지 않는다. 새 immutable release tag가 필요하면 별도 사용자 승인과
  release workplan을 먼저 만든다.

## Final Commit and RESULT Rule

1. Stage 1 Plane은 해당 stage의 unit/integration/UI acceptance가 모두 통과한 뒤에만 독립 기능 commit으로
   남길 수 있다.
2. Stage 2 Cube도 같은 기준을 충족한 뒤 독립 기능 commit으로 남길 수 있다.
3. 전체 acceptance evidence를 수집한 뒤 아래 RESULT를 먼저 갱신한다. final commit SHA를 RESULT 내부에
   자기 참조로 기록하려고 추가 commit을 만들지 않는다.
4. 최종 commit에는 Integration Ownership 안의 16 변경과 이 RESULT만 포함한다. 기존 main/user sidecar
   변경을 섞지 않는다.
5. 루트 사전 승인에 따라 완료된 branch를 `origin/wt/basic-primitives`로 non-force push한다. main merge/push는
   수행하지 않는다.
6. `baseline/full-v1`, `deploy/*` 또는 다른 immutable tag는 생성·이동하지 않는다. 별도 승인된 후속 release
   plan만 tag를 소유한다.

## RESULT

Status: COMPLETE

### Baseline refs
- Minimum input commit: `e54edeed9094d71679b4b081729a34354e820e4a`
- Resolved start `POST_PLAN_BASE_SHA`: `b78cff6dba292ffdab9bc5cd58830c56bff9ee3f`
- Branch/worktree: `wt/basic-primitives` / `/home/beelink/wt-basic-primitives`
- Start-SHA ancestry check: PASS — resolved start is an ancestor of feature checkpoint `cce4123`
- Scope-extension base: `28cd1aa24c5724eae98336433c89c00ec2b23c63`; verified ancestor of animal feature commit `4d441b6`
- Worktree start state: clean, exact resolved start SHA
- `baseline/full-v1` required: NO

### Implemented
- Package-local Plane, Cube, Duck, Frog, Pig, Cow, and Rabbit recipes using only canonical mutation results for stable IDs.
- One history transaction per primitive, aggregate topology validation, selection after commit, undo/redo, and complete rollback on intermediate vertex/face failure.
- Plane: centered unit XY quad with `+Z` winding.
- Cube: centered unit cube with 8 vertices, 12 edges, 24 corners, 6 quads, and outward winding.
- Finite selection bounds/framing with viewport aspect/FOV handling and at least 15% padding.
- Reference-first Move/Extrude with reference-free frozen construction-plane fallback and recoverable degenerate/parallel/no-op behavior.
- Deterministic editable low-poly animal silhouettes: Duck body/head/beak; Frog squat body/eyes/legs; Pig body/snout/ears/legs; Cow body/head/muzzle/horns/legs; Rabbit body/head/long ears/hind legs.
- Additive New Scene UI for Import Reference, all seven Add actions, Frame Selection, save/reload, and OBJ/GLB export; every action is a native accessible button with a 44 CSS px minimum target.
- Real-browser seven-scenario harness using the production CoreWorkspace, renderer, picking, tools, persistence, and exporters.
- A 16-owned idempotent `ensureDefaultCubeForFirstMount` helper is ready for Workstream 19 Phase A shared-bootstrap wiring.

### Files created or modified
- `src/app/composition/primitive-creation.ts`
- `src/app/composition/primitive-recipes.ts`
- `src/app/composition/primitive-entry.ts`
- `src/app/basic-primitives-ui.ts`
- `src/tools/basic/construction-plane.ts`
- `src/tools/basic/move-tool.ts`
- `src/tools/face/extrude-face-tool.ts`
- `tests/app/composition/primitive-creation.test.ts`
- `tests/app/composition/primitive-recipes.test.ts`
- `tests/tools/basic/basic-tools.test.ts`
- `tests/tools/basic/construction-plane.test.ts`
- `tests/tools/face/extrude-face-tool.test.ts`
- `tests/bootstrap/basic-primitives-empty-state.test.ts`
- `tests/e2e/basic-primitives-browser.test.ts`
- `tests/e2e/basic-primitives-browser.ts`
- `docs/validation/basic-primitives/agent-c.md`
- `docs/validation/basic-primitives/browser-smoke.html`
- `docs/validation/basic-primitives/browser-smoke.ts`
- `docs/validation/basic-primitives/stage1-desktop-chrome.json`
- `docs/validation/basic-primitives/desktop-chrome-plane-cube.json`
- `docs/validation/basic-primitives/desktop-chrome-all-primitives.json`
- `docs/workplan/16_BASIC_PRIMITIVES.md` (`RESULT` only)

All implementation/evidence paths are inside Workstream 16 Integration Ownership. No contract, shared config, mesh/history/selection/renderer/project/IO implementation, Optional source, barrel, package, lockfile, or build configuration was changed.

### Public API / local entrypoints
- `PLANE_RECIPE`, `CUBE_RECIPE`, `DUCK_RECIPE`, `FROG_RECIPE`, `PIG_RECIPE`, `COW_RECIPE`, and `RABBIT_RECIPE`
- `createPrimitive(recipe, services)`
- `createBasicPrimitivesEntry(dependencies)` with all seven Add methods, `ensureDefaultCubeForFirstMount`, `frameSelection`, and `state`
- `mountBasicPrimitivesUi(viewport, callbacks, state)`
- Construction-plane helpers for selected bounds/framing, ray-plane intersection, area-weighted face normals, and best-conditioned drag planes

These are package-local entrypoints; shared bootstrap/CoreWorkspace composition remains owned by Workstream 19.

### Stage 1 — Plane evidence
- Plane Stage 1 passed before Cube work began.
- Focused creation tests verify 4 sequential mutation-result vertex IDs, 1 quad, 4 edges/corners, one `Add plane` history entry, face selection, undo/redo stable IDs, malformed-result rejection, and rollback.
- Actual Chrome/WebGL2 flow passed: New Scene -> Add Plane -> Undo empty -> Redo -> Move -> Extrude -> Save -> Reload -> OBJ/GLB.
- Create evidence: 4 vertices / 4 edges / 4 corners / 1 selected face; finite frame plan; 12,728 non-background pixels.
- Edited/exported evidence: stable-ID reload true; OBJ 511 bytes; GLB 856 bytes; warnings/errors 0.

### Stage 2 — Cube evidence
- Cube began only after the Plane vertical slice actual-browser PASS.
- Exact recipe test verifies 8 centered vertices, six named quad cycles, 12 edges, 24 corners, 6 faces, and positive outward-normal dot products.
- Atomic command test verifies 14 mutation calls in one `Add cube` transaction, all six created faces selected, undo/redo, and full rollback when the fourth face mutation fails.
- Actual Chrome/WebGL2 create evidence: 8 vertices / 12 edges / 24 corners / 6 selected faces; finite frame plan; 15,572 non-background pixels.
- Actual undo returned all topology counts to zero; redo restored 8/12/24/6.
- Actual reference-free Move/Extrude, save/reload and export passed; final edited mesh 12/20/40/10, stable-ID reload true, OBJ 798 bytes, GLB 1,028 bytes, warnings/errors 0.

### Extended editable animal primitives evidence
- Duck: 3 closed components, 24 vertices / 36 edges / 72 corners / 18 faces; body/head/beak silhouette.
- Frog: 7 closed components, 56 / 84 / 168 / 42; squat body, two large eyes, four legs.
- Pig: 8 closed components, 64 / 96 / 192 / 48; body, snout, two ears, four legs.
- Cow: 9 closed components, 72 / 108 / 216 / 54; body, head, muzzle, two horns, four legs.
- Rabbit: 6 closed components, 48 / 72 / 144 / 36; body, head, two long ears, two hind legs.
- Recipe tests verify finite coordinates, global coordinate uniqueness, exact counts, in-range non-repeating face cycles, exactly two face uses per component edge, exact disconnected-component counts, and positive outward winding for every face.
- Each entry method uses the unchanged generic `createPrimitive` path: one transaction, canonical mutation-result IDs, all created faces selected, finite framing, one history label, and complete Undo to empty.
- Actual Chrome/WebGL2 for every animal passed Add -> Undo -> Redo -> Move -> Extrude -> Save -> Reload -> OBJ -> GLB with stable IDs, non-empty frames, finite framing, and zero warnings/errors.
- Consolidated evidence: `docs/validation/basic-primitives/desktop-chrome-all-primitives.json`.

### Construction-plane / Frame Selection evidence
- Unit tests cover selected vertex/edge/face/mixed bounds, duplicate removal, empty/live-element no-op, thin/point bounds, portrait/landscape framing, finite intersections, parallel rejection, area-weighted normals, and degenerate faces.
- Existing reference surface hits remain first priority.
- Reference-free Move uses a camera-facing plane frozen at pointer down.
- Reference-free Extrude uses a frozen best-conditioned plane and projects displacement onto the finite selected-face normal.
- Zero displacement, invalid/parallel rays, cancel, deactivate, and preview cleanup do not create history entries.

### Tests / validation
- Strict TDD Cube recipe RED: `CUBE_RECIPE` was missing; GREEN after exact recipe implementation.
- Strict TDD Cube entry RED: `addCube is not a function`; GREEN after composition entry implementation.
- Strict TDD animal vertical slices: each missing recipe first failed as `undefined`; each missing entry method then failed as `is not a function`; each missing UI action then failed as an absent accessible button. Every slice was made GREEN before starting the next animal.
- Strict TDD default-Cube helper RED: `ensureDefaultCubeForFirstMount is not a function`; GREEN after the idempotent package-local helper.
- Focused primitive/UI tests: PASS — 4 files, 32 tests.
- `npm run ci`: PASS — typecheck; 137 Vitest files / 698 tests; production build; baseline artifact verification.
- Production artifact: 4 files, 229,686 bytes; compressed JS/CSS 62,148 bytes; no warnings/failures.
- Harness-inclusive temporary TypeScript project: PASS; temporary config removed.
- `git diff --check`: PASS.
- Self-contained security scan: PASS — zero hardcoded-secret, shell-injection, eval/exec, unsafe-deserialization, SQL-injection, or DOM `innerHTML` findings.
- Self-contained code review: PASS — no security concerns or blocking logic errors found; topology/transaction/selection/framing/UI lifecycle/browser-evidence paths checked against the spec.

### Core-only / Optional regression
- `npm run verify:core -- --scan-only`: PASS; 151 Core source files, Optional roots excluded, no failures.
- `npm run verify:optional`: PASS; Core-only physical-removal typecheck/tests/build, 09 vertical slice, all 16 Optional combinations, semantic matrix, and full-source build passed.
- `npm run verify:ipad`: automated fixture PASS; physical device NOT_RUN; release readiness BLOCKED.

### Browser / device evidence
- Desktop browser/WebGL2: PASS — Headless Chrome 145 on Linux x86_64, renderer `ready`, real production WebGL2 readback, warnings/errors/JavaScript errors 0.
- Evidence: `docs/validation/basic-primitives/desktop-chrome-plane-cube.json` and `docs/validation/basic-primitives/desktop-chrome-all-primitives.json`.
- Physical iPad Safari: NOT_RUN / BLOCKED.
- Apple Pencil: NOT_RUN / BLOCKED.
- Desktop automation and the deterministic iPad fixture do not replace physical-device evidence.

### Integration notes
- Workstream 19 owns shared `core-workspace.ts`, bootstrap, camera-controller application, shared barrels, and product-level composition. Workstream 16 publishes a package-local `applyFrame(SelectionFrame)` callback and requests rendering without modifying those shared seams.
- The browser harness records the real finite frame plan and renders through the production workspace; applying the new target/position to the shared camera controller remains a Workstream 19 integration action.
- Workstream 19 Phase A accepted integration request — exact default behavior:
  1. On the first mount of a genuinely new empty project, invoke the 16-owned `BasicPrimitivesEntry.ensureDefaultCubeForFirstMount(true)` exactly once.
  2. It creates `CUBE_RECIPE` through the existing `createPrimitive` transaction path, selects all six created faces, computes/applies the frame callback, and requests rendering.
  3. Saved, reloaded, or otherwise existing projects must invoke it with `false` or skip it; they must never receive an implicit Cube.
  4. The helper consumes the first-mount check regardless of eligibility, so Undo-to-empty or later remount actions on the same entry cannot recreate the Cube.
  5. No new cross-module contract is requested; this is a package-local 16 entry helper for 19-owned bootstrap assembly.
- No main merge, Pages deployment, or release tag was performed.

### Requested contract changes
- NONE

### Known limitations
- Physical iPad Safari and Apple Pencil behavior/performance were not run and remain BLOCKED release evidence.
- No device-level performance numbers are claimed.
- Full transform gizmos, axis locks, Rotate/Scale, object/outliner semantics, Sphere/Cylinder, and reference-free CreateVertex/RetopoStroke remain out of scope.
- Product bootstrap/shared camera wiring is deferred to Workstream 19 as planned; no frozen contract change is requested.

### Final disposition
- Verified feature checkpoint commit: `cce4123` (`[verified] feat: add basic plane and cube primitives`)
- Verified scope-extension feature commit: `4d441b6779d794186d0a9d22d1706bbd3df7d355` (`[verified] feat: add editable low-poly animal primitives`)
- Final local branch tip: this RESULT-only commit; exact SHA reported externally after commit creation.
- Pushed `origin/wt/basic-primitives` tip: exact SHA verified and reported externally after non-force push.
- Local/remote tip equality: verified externally after push.
- Push performed: YES — non-force push to the same-name origin branch.
- Main merge performed: NO
- Main push performed: NO
- Immutable release tag created: NO
- Pages deploy performed: NO
