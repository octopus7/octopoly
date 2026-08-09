# 03 Surface Engine

## Required
YES

## Execution
```text
Mode: WORKTREE
Branch: wt/surface-engine
Worktree: ../wt-surface-engine
Branch point: `baseline/core-v1^{commit}`
```

이 workstream은 `baseline/core-v1^{commit}`으로 해석한 정확한 baseline commit에서 분기한다.

## Goal

High-poly/reference triangle mesh를 소유하고 world-space raycast/nearest query를 제공하는 memory-conscious
spatial query 계층을 구현한다. BVH와 geometry storage는 숨기고 frozen `ReferenceSurfaceFactory`와
`SurfaceQuery`를 게시한다.

## Dependencies

- 완료된 00 baseline과 canonical `src/contracts/**`
- ADR-0003의 world/transform/winding/normal 규칙
- ADR-0004의 finite input, ray, barycentric, distance 및 degeneracy tolerance
- ADR-0005의 reference triangle, build-time, query-time 및 memory budget
- frozen contract의 `Vec3`, `Mat4`, `Ray`, `TriangleMeshSnapshot`, `SurfaceHit`, `SurfaceQuery`,
  `ReferenceSurface`, `ReferenceSurfaceFactory` 및 ID types

Mesh Kernel, Renderer, Retopo, DOM, GPU resource 또는 01의 import concrete implementation에 의존하지
않는다. 테스트 입력은 contract value fixture로 직접 만든다.

## Public API

이 workstream은 다음 public provider를 반드시 게시한다.

- `ReferenceSurfaceFactoryImpl implements ReferenceSurfaceFactory`
- `createReferenceSurfaceFactory(): ReferenceSurfaceFactory`
- factory가 반환하는 `ReferenceSurface`의 immutable `id`, world-space baked `geometry`와
  `query: SurfaceQuery`
- `SurfaceQuery.raycast`와 `SurfaceQuery.nearest`의 world-space `SurfaceHit | null` 결과

09와 08은 factory 또는 반환된 `SurfaceQuery`만 소비한다. BVH node, triangle candidate, local-space ray,
bounds 및 build scratch buffer는 public export에 포함하지 않는다.

Public semantics:

- input geometry는 project/local space이며 create 시 validation 후 `worldTransform`을 적용한 world-space
  immutable copy가 `ReferenceSurface.geometry`로 고정된다. query와 renderer는 이 동일한 geometry를 쓴다.
- hit position/normal/distance는 world space다. non-uniform scale의 normal은 inverse-transpose 규칙을
  따른다.
- triangle ID는 해당 `ReferenceSurface` lifetime 동안 input triangle order와 대응해 stable하다.
- query는 양면 triangle을 대상으로 하며 가장 가까운 유효 hit를 결정적으로 반환한다.
- miss/max-distance 밖 결과는 `null`이고 예외가 아니다.
- invalid indices, non-finite geometry, singular transform 및 invariant 위반은 create 단계의 programmer
  error이며 부분 surface/resource를 남기지 않는다.
- `dispose()`는 idempotent하고 storage/scratch memory를 해제한다. dispose 뒤 query는 명시적 programmer
  error로 실패하고 stale result를 반환하지 않는다.

## Ownership

```text
src/surface/reference/**
src/surface/spatial/**
src/surface/query/**
tests/surface/reference/**
tests/surface/spatial/**
tests/surface/query/**
tests/surface/factory.*
tests/surface/public-api.*
```

## Agent Allocation

### Agent A — Geometry Preparation / Lifecycle

소유 파일:

```text
src/surface/reference/geometry/**
src/surface/reference/lifecycle/**
tests/surface/reference/geometry/**
tests/surface/reference/lifecycle/**
```

책임:

- `TriangleMeshSnapshot` validation, immutable ownership 및 stable triangle mapping
- local/world bounds, finite/degenerate triangle classification 및 normal preparation
- transform/normal transform helpers와 disposable geometry storage
- spatial builder가 소비할 workstream-internal prepared-geometry read API

### Agent B — Spatial Acceleration

소유 파일:

```text
src/surface/spatial/**
tests/surface/spatial/**
```

책임:

- BVH 또는 동등 acceleration structure의 build/rebuild-free immutable lifetime
- deterministic node/triangle ordering, bounds traversal 및 candidate query
- iterative traversal 또는 명시적 depth cap으로 mobile stack/memory 부담 제한
- internal ray/nearest candidate API와 budget fixtures

### Agent C — Surface Query

소유 파일:

```text
src/surface/query/**
tests/surface/query/**
```

책임:

- candidate triangle의 robust ray intersection 및 closest-point 계산
- barycentric, world-space position/normal/distance와 max-distance 처리
- miss, degenerate candidate 및 tie-break semantics
- spatial candidate fake를 사용한 query tests

### Main Agent Reserved

소유 파일:

```text
src/surface/reference/factory.*
src/surface/reference/surface.*
src/surface/index.*
tests/surface/factory.*
tests/surface/public-api.*
docs/workplan/03_SURFACE_ENGINE.md (RESULT only during implementation)
```

책임:

- geometry preparation, spatial index 및 query의 `ReferenceSurface` composition
- `ReferenceSurfaceFactoryImpl`, local public entry와 contract assignability tests
- dispose/failure cleanup reconciliation 및 RESULT

위 경로는 겹치지 않는다. Shared local entry와 concrete `ReferenceSurface` 조립은 주 에이전트만 수정한다.

## Internal Work Sequence and Gates

1. **Gate 0 — Baseline:** branch/worktree, `baseline/core-v1`의 resolved SHA, canonical contract 및
   numeric/coordinate ADR을 확인한다.
2. **Gate 1 — Geometry:** Agent A가 validation, immutable prepared geometry, world transform, bounds,
   triangle-ID mapping 및 lifecycle tests를 통과시킨다. prepared-geometry read API를 동결한다.
3. **Gate 2 — Spatial/Query:** Gate 1 뒤 Agent B가 acceleration structure를 구현한다. Agent C는 동일한
   triangle/candidate semantics를 따르는 fake로 robust query math를 병렬 구현할 수 있다.
4. **Gate 3 — Candidate Boundary:** Agent B의 deterministic candidate API와 tests가 통과하면 주
   에이전트가 이를 동결하고 Agent C가 실제 traversal 결과와 query math를 연결한다.
5. **Gate 4 — Factory:** 주 에이전트가 `ReferenceSurfaceFactoryImpl`과 `ReferenceSurface`를 조립해
   create failure/dispose cleanup/public contract tests를 통과시킨다.
6. **Gate 5 — Budget/Handoff:** target-size fixture의 build/query/memory를 ADR-0005 방법으로 측정하고 08/09
   주입 entry와 미검증 실기기 위험을 RESULT에 기록한다.

## Concrete Tests / Validation

### Geometry / Lifecycle

- empty geometry, single triangle 및 multi-triangle snapshot의 bounds/triangle ID가 결정적이다.
- index 길이 비배수, out-of-range index, mismatched normal count, NaN/Infinity 및 singular transform은
  create 전에 실패하며 resource를 남기지 않는다.
- source arrays를 create 뒤 변경해도 `ReferenceSurface.geometry`와 query 결과가 바뀌지 않는다.
- translation/rotation/non-uniform scale fixture에서 world position과 inverse-transpose normal이
  ADR 허용오차를 만족한다.
- `dispose()`를 반복 호출해도 안전하고 dispose 뒤 query가 stale data를 반환하지 않는다.

### Raycast

- triangle front/back 양쪽 ray에서 가장 가까운 positive-distance hit를 반환한다.
- 여러 triangle, overlapping bounds 및 동일 거리 tie에서 triangle ID 기준의 결정적 결과를 반환한다.
- parallel ray, edge/vertex hit, degenerate triangle, behind-origin 및 miss를 구분한다.
- `maxDistance` 경계 안 hit는 반환하고 경계 밖 hit는 `null`이다.
- hit barycentric 합이 1이고 각 component, normalized normal, world position 및 distance가 허용오차를
  만족한다.

### Nearest

- face interior, edge 및 vertex가 nearest point인 fixture를 각각 검증한다.
- 여러 candidate 중 가장 가까운 point와 deterministic tie-break를 반환한다.
- `maxDistance` 안/밖, empty surface 및 degenerate-only surface의 miss가 `null`이다.
- transformed surface의 nearest position/normal/distance가 world space다.

### Performance / Isolation

- ADR-0005 target/hard-limit fixture에서 build/query peak memory, build time 및 representative query
  latency를 기록한다.
- traversal이 pathological mesh에서도 unbounded recursion이나 per-query full-mesh allocation을 하지 않는다.
- public module graph에 Mesh/Renderer/Retopo/DOM/GPU concrete import와 BVH public export가 없다.

## Acceptance Gates

- [ ] `ReferenceSurfaceFactoryImpl`이 canonical `ReferenceSurfaceFactory`에 assignable하고 local public
      entry에서 factory를 생성할 수 있다.
- [ ] 반환된 `ReferenceSurface.query`가 canonical `SurfaceQuery`이며 BVH/internal storage를 노출하지 않는다.
- [ ] world-space baked geometry와 public result가 immutable하고 triangle ID가 surface lifetime 동안
      stable하다.
- [ ] 비항등/non-uniform `worldTransform`에서 render용 geometry와 query hit가 같은 world 좌표에 놓인다.
- [ ] raycast/nearest의 world-space position, normal, barycentric, distance, max-distance 및 miss semantics가
      concrete tests로 검증되었다.
- [ ] invalid input/create failure와 dispose가 partial/stale resource를 남기지 않는다.
- [ ] target-size budget 측정 결과 또는 미측정 이유가 RESULT에 기록되었다.
- [ ] Retopo/Renderer/Mesh concrete implementation에 의존하지 않는다.
- [ ] targeted tests, 전체 surface tests 및 canonical typecheck가 통과했다.

## Integration Outputs for 09

- `createReferenceSurfaceFactory` entry와 반환 provider의 ownership/dispose 방법
- imported `TriangleMeshSnapshot` + world transform → `ReferenceSurface` 생성 절차
- 08 `ToolContext.surface`와 snapping에 전달할 `SurfaceQuery`
- world-space, double-sided, triangle-ID, max-distance, error 및 dispose semantics
- reference replacement 시 이전 surface dispose 및 새 factory create를 수행할 09 wiring 목록
- build/query/memory budget 결과와 남은 iPad Safari memory/thermal 검증
- contract change request가 있으면 영향 workstream을 포함한 형식화된 요청; 없으면 `NONE`

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
