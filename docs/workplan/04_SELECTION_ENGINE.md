# 04 Selection Engine

## Required
YES

## Execution
```text
Mode: WORKTREE
Branch: wt/selection-engine
Worktree: ../wt-selection-engine
Branch point: `baseline/core-v1^{commit}`
```

이 workstream은 `baseline/core-v1^{commit}`으로 해석한 정확한 baseline commit에서 분기한다.

## Goal

Picking과 분리된 topology-aware selection state와 pure operators를 구현한다. Mesh topology dependency는
canonical `MeshQuery` 하나로 제한하고 renderer, raw input, mutation 및 Mesh Kernel concrete
implementation을 알지 않는다.

## Dependencies

- 완료된 00 baseline과 canonical `src/contracts/**`
- frozen contract의 `VertexId`, `EdgeId`, `FaceId`, `Unsubscribe`, `MeshQuery`, `SelectionMode`,
  `SelectionSnapshot`, `SelectionChange` 및 `SelectionService`
- 테스트용 hand-written fake는 canonical `MeshQuery`를 구현하며 02 concrete code를 import하지 않음

금지 dependency:

- `MeshKernel`, internal topology/adjacency arrays 및 `MeshMutationService`
- `MeshSnapshot`을 별도 service dependency로 받는 API
- `PickingService`, `PickHit`, Renderer, `PointerEvent`/`PointerSample`, Tool Runtime 및 History

필요한 전체 ID 열거도 주입된 `MeshQuery.snapshot()`을 통해서만 수행한다. Operator signature에는
`MeshQuery` 외의 mesh provider를 추가하지 않는다.

## Public API

`src/selection/**`은 다음 contract implementation과 pure operator를 게시한다.

```ts
declare class SelectionStore implements SelectionService {
  snapshot(): SelectionSnapshot;
  update(mode: SelectionMode, change: SelectionChange): void;
  clear(): void;
  prune(mesh: MeshQuery): void;
  subscribe(listener: (snapshot: SelectionSnapshot) => void): Unsubscribe;
}

declare function selectAll(mesh: MeshQuery): SelectionChange;
declare function selectEdgeLoop(mesh: MeshQuery, seed: EdgeId): SelectionChange;
declare function selectEdgeRing(mesh: MeshQuery, seed: EdgeId): SelectionChange;
declare function growSelection(mesh: MeshQuery, selection: SelectionSnapshot): SelectionChange;
declare function shrinkSelection(mesh: MeshQuery, selection: SelectionSnapshot): SelectionChange;
declare function connectedSelection(mesh: MeshQuery, selection: SelectionSnapshot): SelectionChange;
declare function convertSelection(
  mesh: MeshQuery,
  selection: SelectionSnapshot,
  target: "vertex" | "edge" | "face",
): SelectionChange;
```

Operator는 state를 직접 변경하지 않고 `SelectionChange`만 반환한다. 적용은 호출자가
`SelectionService.update`로 수행한다. 새 cross-module record, topology cache 또는 shadow mesh type을
public export하지 않는다.

### State Semantics

- `replace`는 결과를 change에 포함된 세트와 정확히 같게 만들며 omitted domain은 empty로 취급한다.
- `add`/`subtract`/`toggle`은 제공된 domain만 변경하고 omitted domain은 유지한다.
- effective state가 바뀔 때만 selection version을 증가시키고 subscriber를 정확히 한 번 호출한다.
- `snapshot()`의 set은 immutable value이며 외부 mutation이 내부 state를 바꾸지 않는다.
- `clear()`는 모든 domain을 비우며 이미 empty이면 no-op이다.
- `prune(mesh)`는 `MeshQuery.vertex/edge/face`가 `null`인 ID만 제거하고 한 번의 atomic state change로
  publish한다.
- `update`는 mesh를 인자로 받지 않으므로 opaque/stale ID를 임시 보관할 수 있다. topology mutation 뒤
  09가 `prune(mesh)`를 호출한다.
- subscribe는 등록 시 즉시 emit하지 않고 이후 effective change만 알린다. unsubscribe는 idempotent하다.

### Operator Semantics

- edge loop는 seed edge 양 끝의 manifold vertex에서 valence-4 continuation을 따라가며 boundary, pole,
  non-manifold ambiguity 또는 재방문에서 멈춘다.
- edge ring은 incident quad의 opposite edge를 양방향으로 따라가며 non-quad, boundary, non-manifold
  ambiguity 또는 재방문에서 멈춘다.
- closed loop/ring은 seed를 한 번만 포함하며 모든 결과 ID ordering은 ascending ID로 결정적이다.
- grow는 vertex는 shared edge, edge는 shared vertex, face는 shared edge 기준으로 한 단계 인접한
  같은-domain element를 추가한다.
- shrink는 같은-domain selection 경계의 element를 한 단계 제거한다.
- connected는 각 non-empty domain seed에서 같은-domain adjacency의 connected component를 반환한다.
- conversion은 same-domain이면 live ID를 보존한다. face → edge/vertex와 edge → vertex는 source가
  사용하는 element의 union을 반환한다. vertex → edge는 양 endpoint, vertex → face는 모든 face vertex,
  edge → face는 모든 face edge가 source selection에 포함된 경우만 반환한다.
- missing/stale seed는 empty change이며 programmer error가 아니다.

## Ownership

```text
src/selection/**
tests/selection/**
```

## Agent Allocation

### Agent A — Selection State / Prune

소유 파일:

```text
src/selection/state/**
src/selection/prune/**
tests/selection/state/**
tests/selection/prune/**
```

책임:

- `SelectionStore implements SelectionService`
- replace/add/subtract/toggle, clear, snapshot, version 및 subscription
- `MeshQuery` lookup만 사용하는 atomic prune
- immutability, no-op notification 및 unsubscribe tests

### Agent B — Loop / Ring

소유 파일:

```text
src/selection/operators/loop/**
src/selection/operators/ring/**
tests/selection/operators/loop/**
tests/selection/operators/ring/**
```

책임:

- deterministic edge loop/ring traversal
- quad, boundary, pole, closed cycle 및 non-manifold stop policy
- `MeshQuery` fake 기반 pure operator tests

### Agent C — Region / Conversion Operators

소유 파일:

```text
src/selection/operators/region/**
src/selection/operators/conversion/**
tests/selection/operators/region/**
tests/selection/operators/conversion/**
```

책임:

- select all, grow, shrink 및 connected
- vertex/edge/face conversion
- mixed-domain, empty, stale ID 및 disconnected component tests

### Main Agent Reserved

소유 파일:

```text
src/selection/index.*
src/selection/operators/index.*
tests/selection/public-api.*
tests/selection/dependency-boundary.*
docs/workplan/04_SELECTION_ENGINE.md (RESULT only during implementation)
```

책임:

- local public export와 canonical contract assignability
- operator naming/semantics reconciliation
- `MeshQuery`-only dependency audit와 RESULT

위 경로는 겹치지 않는다. Agent B/C는 state를 import하지 않고 `SelectionSnapshot` input과
`SelectionChange` output의 pure function으로 유지한다.

## Internal Work Sequence and Gates

1. **Gate 0 — Baseline:** branch/worktree, `baseline/core-v1`의 resolved SHA, canonical contract import와
   test command를 확인한다.
2. **Gate 1 — Semantics/Fixtures:** 주 에이전트가 위 state/operator semantics와 shared test topology
   descriptions를 동결한다. 각 agent는 자신의 경로에 독립 `MeshQuery` fake/fixture를 둘 수 있지만
   shadow public type은 만들지 않는다.
3. **Gate 2 — Parallel Implementation:** A/B/C가 분리된 경로에서 병렬 구현한다. B/C는 `SelectionStore`에
   의존하지 않고 A는 operator를 import하지 않는다.
4. **Gate 3 — Public Surface:** 주 에이전트가 local barrel, contract assignability, deterministic operator
   result 및 dependency-boundary tests를 조립한다.
5. **Gate 4 — Handoff:** 전체 selection tests/typecheck 후 02 mutation 뒤 prune, 01 picking 결과 적용,
   07 render snapshot 제공 등 09에서만 수행할 wiring을 RESULT에 기록한다.

## Concrete Tests / Validation

### State

- replace가 omitted domain을 비우고 add/subtract/toggle이 omitted domain을 보존한다.
- duplicate IDs와 no-op update/clear/prune은 version 또는 subscriber count를 증가시키지 않는다.
- effective update는 한 번만 version을 증가시키고 한 immutable snapshot을 모든 active subscriber에
  전달한다.
- unsubscribe를 여러 번 호출해도 안전하고 이후 callback이 없다.
- snapshot set을 외부에서 변경하려는 시도가 다음 snapshot/internal state에 영향을 주지 않는다.
- prune이 vertex/edge/face의 stale ID를 모두 제거하고 유효 ID 및 다른 domain을 보존한다.

### Loop / Ring

- open/closed quad strip의 edge loop와 ring이 seed 포함, 양방향 traversal 및 deterministic set을 만족한다.
- triangle/n-gon, boundary, valence pole, disconnected component 및 non-manifold edge에서 정의된 위치에
  멈추고 무한 순회하지 않는다.
- missing edge seed는 empty `SelectionChange`를 반환한다.
- fixture의 `MeshQuery` method만 호출하고 concrete adjacency/storage 또는 standalone `MeshSnapshot`
  provider를 사용하지 않는다.

### Region / Conversion

- vertex/edge/face 각각의 grow가 정확히 한 adjacency layer를 추가하고 shrink가 boundary layer만 제거한다.
- connected가 domain별 component를 섞지 않고 empty/multiple seed를 결정적으로 처리한다.
- face → edge/vertex와 fully-contained vertex/edge → face conversion이 mixed-domain fixture에서
  정의된 inclusion policy를 따른다.
- selectAll과 모든 operator 결과에는 live ID만 있고 input `SelectionSnapshot`은 변경되지 않는다.

### Dependency Boundary

- public module graph가 canonical `MeshQuery`와 ID/selection value types 외의 mesh API를 import하지 않는다.
- source에 Mesh Kernel internal path, mutation, renderer, picking, raw input, tool runtime concrete import가
  없다.
- 02가 없어도 contract fake만으로 전체 `tests/selection/**`가 실행된다.

## Acceptance Gates

- [ ] `SelectionStore`가 canonical `SelectionService`에 assignable하다.
- [ ] 모든 topology-aware API의 유일한 mesh provider parameter가 `MeshQuery`다.
- [ ] state semantics, version/no-op/subscription/immutability/prune가 concrete tests로 검증되었다.
- [ ] loop/ring/grow/shrink/connected/conversion이 pure `SelectionChange`를 반환한다.
- [ ] boundary, pole, non-quad, non-manifold, closed cycle 및 stale ID가 결정적으로 종료된다.
- [ ] Renderer/Picking/Input/Mutation/History 및 Mesh concrete implementation을 import하지 않는다.
- [ ] targeted tests, 전체 selection tests, dependency audit 및 canonical typecheck가 통과했다.
- [ ] 09의 picking → update와 mutation → prune 연결 요구사항이 RESULT에 기록되었다.

## Integration Outputs for 09

- concrete `SelectionStore` 생성 entry와 `SelectionService` provider
- pure operator export 목록과 state/operator semantics
- 01 `PickingService`의 `PickHit`을 `SelectionChange`로 변환해 update하는 wiring 책임
- 02 successful mutation 뒤 동일 `MeshQuery`로 `prune`을 호출하는 wiring 책임
- 07에 immutable `SelectionSnapshot`을 전달하고 selection이 GPU handle을 보관하지 않는 경계
- contract-only `MeshQuery` fake/fixture와 실행한 검증 명령
- non-manifold/irregular topology stop policy 및 알려진 성능 한계
- contract change request가 있으면 형식화된 요청; 없으면 `NONE`

## RESULT
Status: COMPLETE

### Implemented
- canonical `SelectionService`를 구현한 `SelectionStore`와 replace/add/subtract/toggle/clear semantics
- immutable selection snapshot/set, effective-change-only version 증가, 단일 publication, 재진입-safe subscriber snapshot,
  idempotent unsubscribe
- `MeshQuery.vertex/edge/face` lookup만 사용하는 atomic stale-ID prune
- valence-4 manifold vertex의 unique opposite continuation을 따르는 deterministic edge loop
- incident quad의 opposite edge를 양방향으로 따르는 deterministic edge ring
- select-all, one-layer grow/shrink, domain별 connected component와 vertex/edge/face conversion pure operators
- 모든 operator 결과의 live-ID filtering과 ascending ID insertion order

### Files created or modified
- State/prune: `src/selection/state/**`, `src/selection/prune/**`
- Operators: `src/selection/operators/loop/**`, `ring/**`, `region/**`, `conversion/**`
- Local public surface: `src/selection/index.ts`, `src/selection/operators/index.ts`
- Tests/fakes: `tests/selection/**`
- Status record: `docs/workplan/04_SELECTION_ENGINE.md`의 `RESULT`만 갱신

### Public API
- `SelectionStore`
- `selectAll(mesh)`
- `selectEdgeLoop(mesh, seed)` / `selectEdgeRing(mesh, seed)`
- `growSelection(mesh, selection)` / `shrinkSelection(mesh, selection)`
- `connectedSelection(mesh, selection)`
- `convertSelection(mesh, selection, target)`
- Local entry: `src/selection/index.ts`; topology provider는 모든 API에서 canonical `MeshQuery`만 사용

### Tests / validation
- Baseline/worktree: `baseline/core-v1^{commit}` = `8bd9407294e1f5823a751504ca2c0aee14a39159`,
  `wt/selection-engine` 시작 commit과 일치, 작업 시작 시 0 commits ahead
- `npm ci`: PASS, 86 packages 설치
- Agent targeted tests: state/prune 2 files / 12 tests PASS; loop/ring 2 files / 12 tests PASS;
  region/conversion 2 files / 10 tests PASS
- `npm exec vitest run tests/selection`: PASS, 8 files / 36 tests
- `npm exec vitest run tests/selection/dependency-boundary.test.ts`: PASS, 1 file / 1 test
- `npm run typecheck`: PASS
- `npm run ci`: PASS, repository 전체 12 files / 58 tests, production build와 baseline artifact verifier 포함
- Boundary/pole/non-quad/non-manifold/closed revisit/stale fixture와 atomic prune failure 경로 PASS
- Dependency audit: Mesh concrete, mutation, renderer, picking, raw input, tool runtime, history import 없음

### Integration notes
- 09는 application composition에서 concrete `SelectionStore`를 `SelectionService` provider로 생성한다.
- 01 `PickingService`의 `PickHit`을 적절한 `SelectionChange`로 변환한 뒤 `SelectionService.update`를 호출하는
  wiring은 09가 담당한다. 이 workstream은 picking 또는 input을 구현하지 않았다.
- 02 successful mutation 뒤 같은 canonical `MeshQuery`로 `SelectionService.prune(mesh)`를 한 번 호출하는
  wiring은 09가 담당한다.
- 07에는 immutable `SelectionSnapshot`만 전달하며 selection module은 GPU handle을 보관하지 않는다.
- Loop는 boundary/pole/non-manifold vertex에서 continuation을 선택하지 않는다. Ring은 non-quad와 ambiguous
  edge를 통과하지 않으며, 이미 도달한 non-manifold opposite edge는 포함한 뒤 다음 face 선택 없이 멈춘다.

### Requested contract changes
- NONE

### Known limitations
- 실제 대규모 topology와 iPad Safari에서 operator latency/memory를 측정하지 않았다.
- 의도적으로 topology cache를 소유하지 않으므로 select-all과 conversion은 `MeshQuery.snapshot()` 열거를,
  traversal은 주입된 `MeshQuery` lookup/adjacency 성능을 따른다.
