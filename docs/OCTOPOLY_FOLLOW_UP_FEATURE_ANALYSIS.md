# OctoPoly 후속 기능 공백 및 기본 도형 구현 분석

- 작성일: 2026-08-10
- 기준 코드: 14 Optional Integration 개발 통합이 반영된 `main` commit
  `e54edeed9094d71679b4b081729a34354e820e4a` (`baseline/full-v1`은 실물 iPad/Pencil 증거 부재로 미생성)
- 목적: 빈 프로젝트에서 시작해 편집·저장·export까지 완료하는 사용자 흐름의 공백과 기본 도형 구현 경로를 기록한다.
- 상태: 분석 완료, 구현 미시작
- 주의: 이 문서는 실행 승인을 받은 신규 workplan이 아니다. 00~15 이후 후속 작업을 설계할 때 사용하는 입력 문서다.

## 결론

`New Scene + 기본 도형`은 가장 우선순위가 높은 후속 기능이다. 현재 workspace는 빈 mesh로 시작하지만 UI에 새 문서나 기본 도형 생성 경로가 없고, `Create vertex`는 reference surface hit가 있어야 동작한다. 참조 파일이 없는 사용자는 작업을 시작할 수 없다.

다만 `Add Plane` 버튼만 추가하면 완전한 자유공간 모델링은 성립하지 않는다. 현재 Move와 Extrude도 드래그 목표점을 reference surface에서 구하므로 기본 도형 다음에는 construction plane 또는 screen-space drag fallback, Move/Rotate/Scale과 camera framing이 필요하다.

권장 첫 완성 흐름은 다음과 같다.

```text
New Scene
→ Plane 또는 Cube 생성
→ 자동 선택 + Frame Selection
→ 작업 평면에서 Move/Rotate/Scale
→ Undo/Redo
→ 이름 지정 저장
→ 재로드
→ OBJ/GLB export
```

## 현재 작업 시작이 막히는 원인

1. Workspace는 빈 mesh로 시작한다. [`createCoreWorkspace`](../src/app/composition/core-workspace.ts#L358)
2. 기존 `Create vertex`는 reference surface hit가 없으면 시작하지 않는다. [`createVertexTool`](../src/tools/vertex/create-vertex-tool.ts#L40)
3. 참조 OBJ를 가져오기 전에는 surface query가 hit를 반환하지 않는다.
4. UI에는 `New`, `Add Plane`, `Add Cube` 또는 자유공간 생성 진입점이 없다. [`bootstrap`](../src/app/bootstrap.ts#L238)
5. 따라서 빈 프로젝트의 정상 상태와 사용자가 아무것도 할 수 없는 상태가 화면에서 구분되지 않는다.

기본 도형은 편의 기능이 아니라 첫 사용자 활성화를 막는 blocker를 제거하는 기능이다.

## 기본 도형 MVP

### 1단계 — Add Plane

- 원점 중심 XY plane
- vertex 4개
- edge 4개
- corner 4개
- quad face 1개
- 생성 face 자동 선택
- 전체 생성을 history entry 하나로 기록
- Undo 한 번으로 완전히 빈 mesh 복원
- Redo 한 번으로 동일 ID와 topology 복원
- 저장·재로드 후 동일 mesh 유지
- reference asset 없이 즉시 렌더링

### 2단계 — Add Cube

- Plane과 동일한 command/transaction 경로 재사용
- vertex 8개
- edge 12개
- corner 24개
- quad face 6개
- 일관된 outward winding 검증
- 생성된 component 또는 모든 face 자동 선택 정책 결정

Sphere와 Cylinder는 segments, pole, cap, winding, 초기 크기 UX가 추가되므로 첫 MVP 뒤로 미룬다.

## 기존 API를 재사용하는 구현 경로

```text
Add Plane command
  → history.begin("Add plane")
  → createVertex × 4
  → 각 결과의 created.vertices ID 수집
  → 수집한 ID로 createFace × 1
  → 모든 reversible patch를 transaction 하나에 기록
  → commit
  → 생성 face를 replace selection
  → scene snapshot의 mesh version 변경
  → 기존 retopo render pass가 GPU geometry 갱신
```

### Mesh mutation

- `MeshMutationService`에 `createVertex`, `createFace`와 reversible patch가 이미 있다. [`mesh contracts`](../src/contracts/mesh.ts#L80), [`mesh kernel`](../src/mesh/kernel.ts#L387)
- batch 명령에서 미리 생성될 vertex ID를 추측하면 안 된다.
- vertex를 순차 생성하고 각 결과의 `created.vertices`를 수집한 뒤 face를 생성하는 것이 public API 경계를 지키는 안전한 방법이다.

### History

- 여러 patch를 transaction 하나로 묶을 수 있다.
- redo는 정방향, undo는 역방향으로 patch를 적용한다. [`composite history entry`](../src/history/composite-entry.ts#L30)
- 중간 vertex 또는 face 생성이 실패하면 전체 transaction을 rollback하고 부분 mesh를 남기지 않아야 한다.

### Selection

- 생성한 face ID를 `replace` operation으로 선택할 수 있다. [`selection contracts`](../src/contracts/selection.ts#L19)
- 선택 변경도 생성 command의 성공 이후에만 적용한다.
- 생성 실패 시 이전 selection을 보존한다.

### Renderer

- workspace의 `sceneSnapshot()`이 최신 mesh와 selection을 renderer에 전달한다. [`core workspace scene snapshot`](../src/app/composition/core-workspace.ts#L518)
- retopo pass는 mesh version 변경 시 geometry buffer를 갱신한다. [`retopo pass`](../src/renderer/retopo/retopo-pass.ts#L429)
- 기본 도형을 위해 renderer 계약이나 별도 primitive GPU path를 만들 필요가 없다.

### Project persistence

- project document는 전체 serialized mesh를 저장한다. [`project asset contracts`](../src/contracts/assets.ts#L89), [`workspace save`](../src/app/composition/core-workspace.ts#L615)
- primitive 전용 schema나 repository 변경은 필요하지 않다.
- 생성→저장→재로드 round-trip test는 반드시 추가한다.

## Command로 구현해야 하는 이유

기본 도형 생성은 pointer gesture를 기다리는 활성 `Tool`보다 toolbar의 즉시 실행 command가 자연스럽다.

- 활성 도구 전환이 필요하지 않다.
- capture/cancel pointer lifecycle을 불필요하게 만들지 않는다.
- 클릭 한 번을 history transaction 하나와 정확히 대응할 수 있다.
- toolbar, onboarding empty state, command palette가 같은 API를 호출할 수 있다.

향후 viewport에서 위치와 크기를 끌어 배치하는 기능을 추가한다면 `Start Primitive Placement` tool을 별도 설계한다. 첫 MVP와 섞지 않는다.

## 예상 수정 범위

| 경로 | 변경 |
|---|---|
| `src/app/composition/primitive-creation.ts` 신규 | Plane/Cube geometry recipe와 mutation/history/selection command |
| `src/app/composition/core-workspace.ts` | `addPrimitive("plane" | "cube")` 또는 동등한 workspace 진입점 |
| `src/app/bootstrap.ts` | empty state와 `Add Plane`, 후속 `Add Cube` UI |
| `tests/app/composition/primitive-creation.test.ts` 신규 | recipe, winding, ID 수집, 전체 rollback |
| `tests/integration/core-workspace.integration.test.ts` | 생성→선택→렌더→undo/redo→save/load |
| `tests/e2e/core-workspace-vertical.test.ts` | 실제 UI 클릭부터 export까지 vertical slice |

다음 영역의 concrete implementation이나 frozen public contract는 기본 MVP에서 수정할 필요가 없다.

- mesh kernel
- history engine
- selection engine
- renderer core
- project schema/repository

## 기본 도형 뒤에 바로 드러나는 제약

기본 도형 생성 후 Select, Split, Delete는 reference surface 없이도 사용할 수 있다. 그러나 Move와 Extrude는 현재 reference surface hit를 drag 목표로 사용한다. [`move tool`](../src/tools/basic/move-tool.ts#L55), [`extrude face tool`](../src/tools/face/extrude-face-tool.ts#L51)

따라서 후속으로 아래 중 하나가 필요하다.

1. XY/XZ/YZ construction plane intersection
2. 선택 pivot을 지나는 camera-facing screen plane
3. axis/plane gizmo drag
4. 깊이를 고정한 screen-space delta fallback

권장은 construction plane과 gizmo를 canonical path로 삼고 screen-space fallback을 보조로 두는 방식이다.

현재 문서는 단일 mesh를 저장한다. Cube를 추가해도 별도 object가 아니라 연결되지 않은 mesh component가 된다. MVP에는 충분하지만 다음 요구가 생기면 object/document model을 별도 설계해야 한다.

- object별 transform
- 이름과 visibility
- outliner
- object 단위 import/export
- duplicate/instance

## 전체 기능 공백 우선순위

### P0 — New Scene + Primitive + 자유공간 Transform

#### 공백

- reference 없이 시작할 수 없음
- 기본 도형 생성 없음
- Move/Extrude가 reference surface에 의존
- Frame Selection/Frame All 사용자 진입점 부족

#### 제안

- empty state에서 `Reference 가져오기`와 `기본 도형으로 시작` 제공
- Plane부터 구현하고 Cube를 같은 경로로 추가
- 자동 선택과 Frame Selection
- XY/XZ/YZ construction plane
- Move/Rotate/Scale gizmo

### P1 — 프로젝트 lifecycle과 자동복구

#### 공백

- Save/Load UI가 project ID `default`에 고정된다. [`bootstrap save/load`](../src/app/bootstrap.ts#L261)
- repository는 load/save/remove 중심이고 프로젝트 목록 UX가 없다. [`project repository`](../src/project/repository.ts#L19)
- `ProjectAutosave` 구현은 있으나 실제 workspace 사용자 흐름에 완전히 연결되지 않았다. [`autosave`](../src/project/autosave.ts#L5)
- Load 실패와 복구 상태가 사용자에게 충분히 표시되지 않는다.

#### 제안

- New/Open/Save/Save As
- project name과 recent projects
- dirty indicator와 미저장 확인
- autosave 연결과 crash/background recovery
- 복구본 미리보기와 명시적 restore/discard

### P2 — Import UX와 scene setup

#### 공백

- UI는 reference OBJ 중심이다. [`reference import UI`](../src/app/bootstrap.ts#L269)
- 내부에는 glTF/GLB importer가 있으나 사용자 진입점과 제한 안내가 부족하다. [`glTF importer`](../src/io/import/gltf.ts#L161)
- 현재 importer는 single mesh/primitive와 node transform 등에서 제한이 있다.

#### 제안

- OBJ/GLB/glTF 선택
- Reference/Edit Mesh와 Add/Replace 구분
- unit, scale, axis 확인
- import 진행·취소·오류 설명
- import 후 Frame All
- 지원하지 않는 multi-node/material/transform을 사전 경고

### P3 — 온보딩과 Guided Retopo

#### 공백

- 초보가 edge loop, pole, manifold 용어를 먼저 알아야 작업 목적을 이해할 수 있다.
- 초기 조작법과 첫 asset 완성 경로가 제품 안에 없다.
- action 실패가 일반적인 한 줄 상태로 축약된다. [`action status`](../src/app/bootstrap.ts#L180)

#### 제안

- `Plane/Cube로 연습`과 `Sculpt 가져오기` 선택
- 목적 중심 안내: `팔꿈치가 잘 접히도록 둘러 그리기`
- strip/patch preview와 guided placement
- density, pole, non-manifold를 이유+수정 동작과 함께 설명
- beginner guided mode와 pro shortcut mode를 같은 코어 위에 제공

### P4 — 상태·오류·GPU 복구 UI

#### 공백

- 비지원 또는 초기화 실패 화면에서 재시도 흐름이 약하다.
- renderer는 context 복구 경계를 갖지만 사용자에게 복구 중/완료/실패 상태가 충분히 노출되지 않는다. [`renderer context lifecycle`](../src/renderer/core/renderer-service.ts#L44)

#### 제안

- recoverable/non-recoverable 오류 구분
- Retry, diagnostics export, safe reload
- context lost/restoring/restored 배너
- 마지막 autosave 시각과 복구 가능 여부 표시

## 권장 후속 작업 분할

각 단위는 독립 commit과 acceptance를 가져야 한다.

1. `Add Plane` command와 end-to-end 검증
2. `Add Cube`와 winding/component 검증
3. Frame Selection/Frame All
4. construction plane 기반 Move
5. Rotate/Scale gizmo와 Extrude fallback
6. New/Open/Save As/Autosave Recovery
7. GLB/glTF import UI와 scene setup
8. Guided Retopo first-asset lesson

마우스 orbit/pan/wheel zoom은 별도 입력 분석 문서와 workstream으로 관리한다. primitive와 함께 사용성을 완성하지만 파일 소유와 회귀 위험이 달라 독립 commit이 적합하다.

## Acceptance 기준 초안

### Add Plane

- [ ] reference asset이 없는 새 workspace에서 Plane을 생성할 수 있다.
- [ ] 생성 결과는 유효한 quad topology다.
- [ ] 생성 face가 선택되고 viewport에 렌더링된다.
- [ ] 생성 전체가 history entry 하나다.
- [ ] Undo 후 mesh가 정확히 이전 상태로 돌아간다.
- [ ] Redo 후 ID와 topology가 동일하다.
- [ ] 중간 실패 시 부분 vertex/edge/face와 history entry가 남지 않는다.
- [ ] save/reload와 OBJ/GLB export round-trip이 통과한다.

### 완성 사용자 흐름

- [ ] 첫 실행 사용자가 reference import 또는 primitive 시작을 선택할 수 있다.
- [ ] 안내 없이 첫 mesh를 만들고 framing할 수 있다.
- [ ] reference가 없어도 최소 Move/Rotate/Scale이 가능하다.
- [ ] 명명 저장, 재로드, export가 가능하다.
- [ ] 오류와 복구 가능 상태가 사용자에게 구분되어 표시된다.
- [ ] 실제 UI 조작 E2E가 버튼 존재 확인을 넘어 전체 흐름을 검증한다.

## 최종 판단

기본 도형은 기존 mesh/history/selection/renderer/project API를 재사용해 비교적 좁은 변경으로 구현할 수 있다. 첫 단위는 `Add Plane`, 두 번째는 `Add Cube`가 적절하다. 그러나 사용자 가치 기준의 완료점은 버튼 추가가 아니라 **빈 프로젝트에서 생성→변형→저장→재로드→export가 되는 것**이다.

따라서 구현 순서는 다음으로 고정하는 것이 안전하다.

```text
Add Plane
→ Add Cube
→ Frame Selection
→ construction plane / gizmo
→ project lifecycle
→ import UX
→ guided onboarding
```
