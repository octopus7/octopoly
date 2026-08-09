# 02 Mesh Kernel

## Required
YES

## Execution
```text
Mode: WORKTREE
Branch: wt/mesh-kernel
Worktree: ../wt-mesh-kernel
Branch point: `baseline/core-v1^{commit}`
```

이 workstream은 `baseline/core-v1^{commit}`으로 해석한 정확한 baseline commit에서 분기한다.

## Goal

렌더링/UI/input과 독립된 polygon topology kernel을 구현한다. immutable read boundary, 원자적 mutation,
stable ID, reversible patch 및 generic attribute storage를 frozen contract 그대로 제공한다.

## Dependencies

- 완료된 00 baseline과 canonical `src/contracts/**`
- ADR-0003의 좌표/행렬 규칙, ADR-0004의 numeric tolerance/ID/version 규칙, ADR-0005의 mesh budget
- frozen contract의 `VertexRecord`, `EdgeRecord`, `CornerRecord`, `FaceRecord`, `MeshSnapshot`,
  `MeshQuery`, `AttributeSnapshot`, `MeshCommand`, `MeshPatch`, `MeshMutationResult`,
  `MeshMutationService`, `MeshDocument`, `MeshFactory`, `SerializedMesh` 및 관련 ID/value types

다른 workstream의 concrete implementation, DOM, screen coordinate, GPU, renderer, selection, history 및
Optional semantics를 import하지 않는다.

## Public API

`src/mesh/**`의 public surface는 다음 contract provider로 제한한다.

- `MeshKernel implements MeshDocument`
- `MeshKernelFactory implements MeshFactory` 또는 동등 factory entry
- `MeshKernel.snapshot()`이 반환하는 immutable `MeshSnapshot`
- `MeshKernel.execute()`가 이미 forward 적용된 `MeshPatch`를 포함해 반환하는 `MeshMutationResult`
- `MeshKernel.validate()`의 side-effect 없는 validation 결과
- `MeshKernel.serialize()`와 factory `restore()`의 validated round trip

`MeshKernel`의 constructor/composition은 workstream-local entry에서 제공할 수 있지만 새 shared record나
shadow contract를 export하지 않는다. Internal topology state, draft, adjacency index 및 validator는
`src/mesh/internal/**` 밖으로 export하지 않는다.

Project/IO는 concrete storage를 알지 않고 `MeshFactory.createEmpty/restore`와 `MeshDocument.serialize`만
사용한다.

## Topology Representation and Invariants

### Required Internal Representation

Gate 1에서 아래 구조와 의미를 먼저 구현하고 동결한다.

- live vertex/edge/corner/face는 각 ID를 key로 하는 sparse map에 저장한다.
- ID allocator는 domain별 monotonic counter와 retired-ID set을 가지며 삭제 또는 create-patch revert 뒤에도
  session 중 ID를 재사용하지 않는다. patch re-apply만 원래 ID를 복원할 수 있다.
- face는 3개 이상의 ordered corner cycle을 가진 polygon이다.
- corner는 한 face, 한 vertex 및 그 corner vertex에서 다음 corner vertex로 향하는 undirected edge를
  참조한다. next/previous 관계는 face의 ordered corner cycle로 결정한다.
- edge는 정규화된 unordered endpoint pair로 유일하며 endpoint-pair lookup을 유지한다.
- adjacency index는 vertex → incident edge/face와 edge → incident face/corner를 유지한다.
- boundary edge(incident face 1)와 non-manifold edge(incident face 3 이상)는 표현할 수 있다. manifold
  neighborhood를 요구하는 command는 `validate`에서 명시적으로 거부하고 부분 변경을 남기지 않는다.
- isolated vertex는 `createVertex`의 정상 중간 상태로 허용한다. live edge는 두 개의 서로 다른 live
  vertex를, live corner는 live face/vertex/edge를 참조해야 한다.
- generic attribute storage는 `AttributeDomain`과 live element ID로 key를 구성하며 UV/seam 이름을
  특별 취급하지 않는다.

### Invariant Gate

`validateTopology` validator는 최소한 다음을 검증한다.

- 모든 reference가 live record를 가리키고 ID/domain이 일치함
- face corner cycle, corner → outgoing edge 및 edge endpoint pair가 서로 일치함
- duplicate edge endpoint pair, self-edge, 연속 중복 vertex 및 3개 미만 face가 없음
- vertex/edge/face adjacency의 양방향 membership과 count가 일치함
- attribute entry가 올바른 domain의 live ID만 참조함
- 모든 position/attribute numeric value가 ADR-0004의 finite/tolerance 정책을 만족함
- snapshot ordering과 adjacency query ordering이 ID 기준으로 결정적임

Agent B/C는 이 gate의 representation, read-only internal mutation-kernel API, validator 및 fixture tests가
통과하기 전에는 mutation code를 시작하지 않는다. Gate 통과 뒤 `src/mesh/internal/**`은 Agent A 소유로
동결되며 B/C는 import만 한다.

Version/patch 상태 규칙은 contract test와 함께 고정한다.

- 성공한 `execute`는 입력 state version을 `beforeVersion`, 결과 state version을 `afterVersion`으로 갖는
  patch를 반환한다.
- `revert`는 정확한 applied state에서만 동작해 topology/attribute/stable ID와 `beforeVersion` 상태를
  복원하고, `apply`는 정확한 reverted state에서만 `afterVersion` 상태를 복원한다.
- 잘못된 state에서 apply/revert하거나 invariant를 깨는 것은 programmer error로 실패하며 기존 state를
  유지한다.
- failed `validate`/`execute`와 failed `batch`는 version, ID allocator, topology 및 attribute를 바꾸지 않는다.

## Ownership

```text
src/mesh/**
tests/mesh/**
```

## Agent Allocation

### Agent A — Representation / Query / Attributes / Invariants

소유 파일:

```text
src/mesh/internal/**
src/mesh/query/**
src/mesh/attributes/**
tests/mesh/internal/**
tests/mesh/query/**
tests/mesh/attributes/**
```

책임:

- required internal representation, stable/retired ID allocator 및 deterministic ordering
- workstream-internal transaction draft API: clone, allocate/retire, record add/remove, adjacency update,
  validate, atomic commit
- `MeshQuery`와 immutable snapshot
- generic attribute read/write primitives
- `validateTopology`, invariant fixtures 및 Gate 1 evidence

### Agent B — Element / Connectivity Mutations

소유 파일:

```text
src/mesh/mutations/elements/**
tests/mesh/mutations/elements/**
```

책임:

- create vertex, set positions, delete
- split, collapse, dissolve 및 weld
- boundary/non-manifold precondition validation
- Agent A의 frozen internal draft API만 사용한 atomic operation

### Agent C — Face / Quad / Extrusion Mutations

소유 파일:

```text
src/mesh/mutations/faces/**
tests/mesh/mutations/faces/**
```

책임:

- create/fill face와 polygon/quad helpers
- bridge, rotate diagonal, edge extrude 및 face extrude
- winding, degeneracy, duplicate-edge 및 neighborhood precondition validation
- Agent A의 frozen internal draft API만 사용한 atomic operation

### Main Agent Reserved

소유 파일:

```text
src/mesh/kernel.*
src/mesh/patch/**
src/mesh/index.*
tests/mesh/kernel.*
tests/mesh/patch/**
tests/mesh/public-api.*
docs/workplan/02_MESH_KERNEL.md (RESULT only during implementation)
```

책임:

- `MeshCommand` dispatch와 `batch` transaction composition
- before/after state를 소유하는 reversible `MeshPatch`
- local public entry와 contract assignability tests
- agent 산출물 reconciliation, 전체 invariant 실행 및 RESULT

위 경로는 겹치지 않는다. Agent B/C는 `src/mesh/internal/**`, patch, kernel 또는 local barrel을 수정하지
않고 필요한 internal API 변경은 주 에이전트에게 요청한다.

## Internal Work Sequence and Gates

1. **Gate 0 — Baseline:** branch/worktree, `baseline/core-v1`의 resolved SHA, canonical contract 및 ADR을
   확인한다.
2. **Gate 1 — Representation/Invariant:** Agent A가 internal representation, draft API, deterministic
   query/snapshot, validator와 fixture를 구현한다. internal tests와 typecheck가 통과한 commit을 주
   에이전트가 확인하고 mutation API를 동결한다.
3. **Gate 2 — Parallel Mutations:** Gate 1 뒤 Agent B/C가 분리된 경로에서 병렬 구현한다. 각 operation은
   cloned draft에서 실행하고 validator 성공 뒤에만 commit한다.
4. **Gate 3 — Service/Patch:** 주 에이전트가 command dispatch, setAttribute, batch, result sets 및 reversible
   patch를 조립한다. B/C의 concrete helper는 public API로 노출하지 않는다.
5. **Gate 4 — Full Kernel:** canonical typecheck와 전체 `tests/mesh/**`를 실행하고 immutability, atomicity,
   patch round-trip 및 budget evidence를 확인한다.
6. **Gate 5 — Handoff:** 09가 생성/주입할 concrete provider, unsupported command condition 및 project
   restoration gap을 RESULT에 기록한다.

## Concrete Tests / Validation

### Representation / Read Boundary

- empty mesh와 isolated vertex snapshot/query가 결정적이며 missing ID는 `null` 또는 빈 배열을 반환한다.
- triangle, quad, n-gon, boundary 및 non-manifold fixtures에서 incident/adjacent/findEdge가 양방향
  invariant와 일치한다.
- snapshot records/arrays/attributes를 호출자가 변경해도 kernel state가 바뀌지 않는다.
- 삭제 ID는 새 mutation에서 재사용되지 않고 snapshot/query ordering은 실행마다 같다.
- invalid corner cycle, dangling reference, duplicate edge, self-edge 및 wrong-domain attribute를
  validator가 검출한다.

### Commands / Atomicity

- `createVertex`, `createFace`, `setVertexPositions` 및 `setAttribute`의 created/updated/affected set이
  실제 변화와 일치한다.
- split/collapse/dissolve/weld/delete가 boundary/manifold fixture에서 기대 topology를 만들고 integrity를
  유지한다.
- bridge/extrude/rotateDiagonal이 valid quad/polygon fixture에서 winding과 connectivity를 유지한다.
- missing ID, non-finite position, invalid `t`, degenerate face, incompatible bridge chain 및 unsupported
  non-manifold neighborhood가 validation error를 내고 state/version/allocator를 바꾸지 않는다.
- `batch` 중간 command 실패 시 앞선 command까지 전부 rollback된다.

### Patch / Version / Attributes

- 모든 command 결과의 patch를 revert/apply하면 snapshot, attributes, stable IDs 및 result version이
  before/after와 동일하다.
- create → revert → 다른 create에서 ID를 재사용하지 않으며 원래 patch apply는 원래 ID를 복원한다.
- delete 및 topology mutation의 revert가 corner/adjacency와 모든 domain attribute를 복원한다.
- 잘못된 state의 duplicate apply/revert는 명시적으로 실패하고 state를 변경하지 않는다.
- mutation 전후 모든 test가 `validateTopology`을 호출하며 budget fixture가 ADR-0005 hard limit에서
  무제한 복사/재귀 또는 비결정적 timeout을 만들지 않는다.

## Acceptance Gates

- [ ] Gate 1 representation/invariant tests가 통과한 뒤에만 Agent B/C mutation이 시작되었다.
- [ ] `MeshKernel`이 canonical `MeshDocument`에, factory가 `MeshFactory`에 assignable하다.
- [ ] read boundary와 mutation boundary가 분리되고 snapshot이 immutable하다.
- [ ] stable ID, deterministic ordering, boundary/non-manifold representation 및 generic attributes가
      명시된 invariant를 만족한다.
- [ ] 모든 `MeshCommand`가 구현되었거나 unsupported condition이 `validate`와 RESULT에 구체적으로
      기록되었다.
- [ ] invalid command와 failed batch가 topology/version/ID allocator/history-visible patch를 남기지 않는다.
- [ ] patch apply/revert가 topology, corner, adjacency, attributes 및 stable ID를 round-trip한다.
- [ ] `serialize -> restore -> serialize`가 version, topology, stable ID와 generic attributes를 보존하며
      malformed input은 원자적으로 거부된다.
- [ ] DOM/screen/GPU/UI/Selection/History concrete import가 없다.
- [ ] UV/seam/material 같은 Optional semantics를 특별 취급하지 않는다.
- [ ] targeted tests, 전체 mesh tests 및 canonical typecheck가 통과했다.

## Integration Outputs for 09

- concrete `MeshFactory` 생성 entry와 `MeshDocument` 주입 방법
- supported command/precondition matrix와 atomic failure/error semantics
- topology representation은 비공개로 유지한 public snapshot/query semantics
- version, retired ID, patch apply/revert 및 attribute restoration 규칙
- budget fixture 결과와 known performance/memory limit
- 04/05/08/01이 사용할 canonical contract provider와 test fixture 위치
- `SerializedMesh` validation/restore semantics와 round-trip fixture 위치
- 실행한 검증 명령과 미검증 항목

## RESULT
Status: COMPLETE

### Implemented
- ID-keyed sparse vertex/edge/corner/face maps, normalized endpoint lookup, bidirectional adjacency indexes,
  deterministic ordering, domain allocators and retired-ID tracking
- cloned `MeshDraft` transaction boundary, topology/allocator/attribute invariant validation, immutable query/snapshot and
  generic attribute storage without name-specific semantics
- 모든 canonical `MeshCommand`: create/set/delete, split/collapse/dissolve/weld, create/bridge/extrude/rotate,
  `setAttribute`, iterative atomic `batch`
- state-stamp/version guarded reversible patch, stable-ID apply/revert, actual state-difference result sets, validated
  serialization/factory restoration and idempotent document disposal
- ADR-0005의 250,000 retopo vertex / 500,000 triangulated face hard limit 및 4,096 batch leaf-command 상한

### Files created or modified
- `src/mesh/internal/**`, `src/mesh/query/**`, `src/mesh/attributes/**`
- `src/mesh/mutations/elements/**`, `src/mesh/mutations/faces/**`
- `src/mesh/kernel.ts`, `src/mesh/patch/**`, `src/mesh/index.ts`
- `tests/mesh/internal/**`, `tests/mesh/query/**`, `tests/mesh/attributes/**`
- `tests/mesh/mutations/**`, `tests/mesh/patch/**`, `tests/mesh/kernel.test.ts`, `tests/mesh/public-api.test.ts`
- `docs/workplan/02_MESH_KERNEL.md` (`RESULT` only)

### Public API
- `MeshKernel implements MeshDocument`
- `MeshKernelFactory implements MeshFactory`
- Local provider import: `src/mesh/index.ts`; canonical input/output types remain `@octopoly/contracts`
- Factory injection: `new MeshKernelFactory()` -> `createEmpty()` or validated `restore(serializedMesh)`

### Tests / validation
- Gate 1 targeted invariant/query/attribute tests: PASS
- Agent B element mutation tests: 15/15 PASS
- Agent C face/quad/extrusion mutation tests: 9/9 PASS
- Service-level canonical command matrix: all 13 command kinds validate/execute/revert/apply/restore round-trip PASS
- Seeded property test: 12 deterministic position/attribute sequences round-trip PASS
- ADR-0005 hard-limit fixture: 250,000 isolated vertices restore + deterministic snapshot PASS within the canonical
  5-second per-test timeout
- `npm run test -- tests/mesh`: PASS — 12 files / 61 tests
- `npm run ci`: PASS — 16 files / 83 tests, canonical typecheck, production build, baseline artifact verification
- Static scope scan: DOM/screen/GPU/UI/Selection/History concrete imports, UV/seam special cases and TODO markers 없음

### Integration notes
- 09는 `MeshKernelFactory`를 concrete `MeshFactory`로 생성해 project restore/create 경계에 주입한다.
- 모든 execute는 정확히 한 version을 증가시키며 반환 patch는 이미 forward 적용된 상태다. 유효한 history
  순서의 revert/apply만 허용하고 stale/duplicate/disposed patch는 상태 변경 전에 programmer error로 거부한다.
- `deleteElements`는 vertex/edge/corner 종속 face를 cascade 삭제한다. valid하지만 incident face가 없는 isolated
  edge의 직접 삭제는 명시적으로 unsupported다.
- split/collapse는 incident face 1~2인 edge, dissolve는 정확히 두 반대 winding face, weld는 manifold vertex
  neighborhood에서 지원한다.
- bridge/extrude edge는 ordered coherent manifold boundary chain, rotate는 반대 winding의 triangle pair,
  face extrusion은 manifold selected-region boundary를 요구한다. precondition 실패는 원자적으로 draft를 폐기한다.
- 04/05/08/01은 canonical `MeshQuery`/`MeshMutationService`/`MeshFactory`만 소비하며 내부 topology를 import하지
  않는다. Representative fixtures는 `tests/mesh/mutations/**`와 `tests/mesh/patch/**`에 있다.

### Requested contract changes
- NONE

### Known limitations
- 실제 iPad Safari와 Apple Pencil 실기기 검증은 수행하지 않았다.
- 250,000 isolated-vertex hard-limit load를 검증했지만 250,000-vertex/500,000-triangle dense topology mutation의
  시간·peak heap은 측정하지 않았다. 현재 atomic draft와 patch는 before/after state clone을 보유하므로 대형 dense
  mesh에서 메모리/latency를 09 device/performance gate에서 측정해야 한다.
- topology-changing command는 위 Integration notes의 manifold/winding precondition 밖 neighborhood를 명시적으로
  거부한다. non-manifold topology의 표현/query/createFace 자체는 지원한다.
