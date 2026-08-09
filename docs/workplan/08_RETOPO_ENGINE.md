# 08 Retopo Engine

## Required
YES

## Execution
```text
Mode: WORKTREE
Branch: wt/retopo-engine
Worktree: ../wt-retopo-engine
Branch point: `baseline/core-v1^{commit}`
```

## Inputs

- `/AGENTS.md`
- `docs/workplan/00_MASTER.md`
- `docs/workplan/00_BOOTSTRAP.md`의 완료된 좌표/수치 정책과 `baseline/core-v1`의 resolved commit
- `docs/workplan/INTERFACE_CONTRACTS.md`의 `PointerSample`, `Ray`, `SurfaceHit`, `MeshQuery`, `MeshCommand`,
  `ToolPreview`, `RetopoStrokeInput`, `RetopoStep`, `RetopoStrokeSession`, `RetopoEngine`

## Goal

Normalized Pencil stroke를 결정적으로 surface sample과 retopo chain/quad 후보로 변환하고, canonical
`RetopoEngine` session을 통해 `MeshCommand`와 `ToolPreview` commit/preview 단계를 생성하는 순수
retopology 알고리즘을 구현한다.

## Ownership
```text
src/retopo/**
tests/retopo/**
```

Surface/Mesh concrete implementation, `MeshMutationService.execute`, History commit, Tool lifecycle 및 Renderer
호출은 소유하지 않는다.

## Contract Boundary

- 입력은 canonical `PointerSample`이며 `pointerType === "pen"`인 down/move/up/cancel/hover phase를 구분한다.
  raw event, screen DOM, GPU state 또는 wall-clock을 직접 읽지 않는다.
- 09 adapter가 screen sample에서 canonical `Ray`와 `SurfaceHit | null`을 계산해 `RetopoStrokeInput`으로
  전달한다. 08은 camera/picking/surface service를 호출하지 않고 world-space hit/normal만 처리한다.
- topology 조회와 snap/adjacency 판정은 주입된 `MeshQuery`만 사용한다. 내부 storage, mutable 배열 또는 mesh
  concrete type을 import하지 않는다.
- 결과는 canonical `RetopoStep`의 `MeshCommand` 요청과 typed `ToolPreview`로 표현한다. 서로의 생성 ID에
  의존하지 않는 command만 원자적 `batch`로 묶는다. Retopo Engine은 mutation을 직접 실행하거나 이미
  적용된 `MeshPatch`를 만들지 않는다.
- `MeshCommand`에는 임시 ID 참조가 없으므로 새 vertex와 그 ID를 참조하는 face를 하나의 선행 생성
  `batch`로 표현하지 않는다. 09 composition adapter가 vertex command를 실행하고 결과를 session의
  `continue`에 공급해 다음 face/bridge `RetopoStep`을 얻는다. 각 patch는 같은
  `HistoryTransaction.recordApplied`에 기록한다.
- `RetopoStrokeSession.cancel/dispose`는 idempotent하며 commit step budget 초과, pointer cancel 또는 tool
  전환에서 더 이상 command를 만들지 않는다.

## Determinism Policy

- resampling, smoothing, candidate ordering, winding 및 degenerate 판정은 00 ADR의 tolerance와 stable ordering을
  사용한다.
- 같은 initial `MeshSnapshot`, 같은 supplied `Ray`/`SurfaceHit`와 timestamp 순 PointerSample fixture는
  byte-level로 비교 가능한 동일 command/preview fixture를 생성해야 한다.
- coalesced sample은 입력 timestamp 순서를 보존하며 frame rate, locale, random, current time에 의존하지 않는다.
- cancel 또는 surface miss가 있는 불완전 stroke는 commit command를 만들지 않고 preview만 제거하거나 명시적
  no-result를 반환한다.

## Agent Allocation

### Agent A — Stroke Processing

소유 파일:

```text
src/retopo/stroke/**
tests/retopo/stroke/**
tests/retopo/fixtures/strokes/**
```

책임:

- PointerSample phase/coalesced ordering과 stroke lifecycle
- deterministic resampling, smoothing/noise suppression
- cancel, duplicate timestamp, zero-length 및 sparse sample 처리

### Agent B — Surface / Chain Generation

소유 파일:

```text
src/retopo/surface-chain/**
tests/retopo/surface-chain/**
tests/retopo/fixtures/surfaces/**
```

책임:

- supplied `RetopoStrokeInput.surfaceHit` 기반 hit chain과 miss/normal discontinuity 처리
- `MeshQuery` 기반 snap candidate, continuity와 edge/vertex chain 표현
- fake input/hit와 `MeshQuery`로 surface/mesh concrete module 없이 검증

### Agent C — Quad Inference

소유 파일:

```text
src/retopo/quad/**
src/retopo/requests/**
tests/retopo/quad/**
tests/retopo/requests/**
tests/retopo/fixtures/expected/**
```

책임:

- chain pair의 quad candidate, bridge와 winding
- degenerate/non-manifold 후보 rejection
- canonical `RetopoStep`의 staged `MeshCommand`와 typed `ToolPreview` 생성
- 임시 ID를 발명하지 않고 `continue(MeshMutationResult, mesh)`로 받은 stable ID를 사용해 후속
  face/bridge request 생성

### Main Agent Reserved Files

```text
src/retopo/index.*
tests/retopo/retopo-engine.integration.test.*
docs/workplan/08_RETOPO_ENGINE.md (RESULT만)
```

주 에이전트만 세 단계의 pipeline을 `RetopoEngine`/`RetopoStrokeSession`으로 조립·export하고 deterministic
end-to-end fixture를 검증한다. 위 Agent
A/B/C 경로는 서로 겹치지 않는다.

## Core Flow
```text
Pencil stroke
-> normalized samples
-> 09가 ray/reference surface hit 계산
-> RetopoStrokeInput
-> retopo chain
-> MeshQuery-based snap/adjacency
-> quad preview
-> RetopoStep commit request(s)
-> 09 adapter가 execute -> MeshMutationResult -> session.continue
-> 모든 patch를 transaction 하나에 recordApplied/commit
```

## Acceptance / Tests

- [ ] pen down/move/coalesced/up `RetopoStrokeInput` fixture가 stable resampling과 동일한 hit 처리 순서를 만든다.
- [ ] cancel, hover-only, empty stroke, zero-length, duplicate timestamp 및 surface miss는 commit command를 만들지
      않는다.
- [ ] supplied world-space ray/hit/normal과 fake `MeshQuery` adjacency만으로 chain을 생성한다.
- [ ] 동일 fixture를 반복/다른 frame batch 경계로 실행해 동일 `MeshCommand`와 `ToolPreview`를 얻는다.
- [ ] winding, degenerate quad, normal discontinuity, snap tie 및 non-manifold 위험 후보를 deterministic하게
      처리한다.
- [ ] 신규 vertex ID가 필요한 face는 첫 mutation result를 session `continue`에 공급한 후에만 생성하며
      임시 ID나 contract 밖 command를 만들지 않는다.
- [ ] session은 `none/preview/commit/complete/rejected`를 계약대로 전이하고 cancel/dispose 뒤 side effect 전에
      실패한다.
- [ ] ADR-0005의 최대 staged-step budget을 넘으면 session과 열린 transaction이 cancel/rollback되고 topology나
      history entry를 남기지 않는다.
- [ ] commit-ready 결과는 canonical command만 반환하고 mesh mutation/history/renderer side effect가 없다.
- [ ] source와 tests가 concrete `src/mesh/**`, `src/surface/**`, `src/history/**`, `src/renderer/**`를 import하지
      않는다.
- [ ] `tests/retopo/fixtures/**`에 sample, fake query 결과, expected command/preview가 분리되어 재현 가능하다.
- [ ] `typecheck`, `tests/retopo/**`, baseline의 canonical test command가 통과한다.

## RESULT
Status: COMPLETE

### Implemented
- canonical `RetopoStrokeInput`을 보존하는 deterministic pen stroke lifecycle, noise suppression, smoothing 기반
  resampling과 duplicate/coalesced timestamp ordering
- supplied world-space `SurfaceHit`과 `MeshQuery`만 사용하는 surface chain, scene-scale snap, stable tie ordering,
  mesh adjacency continuity
- 두 연속 stroke chain의 quad strip inference, canonical winding, bridge candidate, degenerate/non-manifold rejection
- unresolved surface/edge anchor를 `createVertex`/`splitEdge`로 순차 요청하고 `MeshMutationResult.created.vertices`의
  stable ID를 받은 뒤에만 `createFace`를 생성하는 staged request sequence
- 첫 rail 보존, 두 번째 rail preview/inference, `none/preview/commit/complete/rejected` 전이와 4,096 staged-step
  hard limit을 구현한 `RetopoEngine`/`RetopoStrokeSession`
- deterministic replay, frame-batch 분할, surface miss, zero-length/degenerate, staged cancel/rollback, budget overflow
  fixture

### Files created or modified
- Source: `src/retopo/index.ts`, `src/retopo/stroke/**`, `src/retopo/surface-chain/**`,
  `src/retopo/quad/**`, `src/retopo/requests/**`
- Tests/fixtures: `tests/retopo/retopo-engine.integration.test.ts`, `tests/retopo/stroke/**`,
  `tests/retopo/surface-chain/**`, `tests/retopo/quad/**`, `tests/retopo/requests/**`,
  `tests/retopo/fixtures/**`
- Result: `docs/workplan/08_RETOPO_ENGINE.md`의 이 `RESULT` 섹션

### Public API
- Engine: `DeterministicRetopoEngine`, `createRetopoEngine`, `RETOPO_STAGED_STEP_HARD_LIMIT`
- Stroke: `RetopoStrokeProcessor`, `processRetopoStroke`, `DEFAULT_STROKE_PROCESSING_OPTIONS`
- Chain: `buildSurfaceChain`, `RetopoSurfaceChain`, chain point/anchor/segment/result types
- Quad: `inferQuadStrip`, `QuadCandidate`, `QuadInferenceResult`
- Requests: `buildQuadPreview`, `createQuadRequestSequence`, `QuadRequestSequence`
- Canonical contract implementation: `RetopoEngine.begin()` -> `RetopoStrokeSession.update/continue/cancel/dispose`

### Tests / validation
- `npm ci`: PASS — 86 packages installed from the frozen lockfile
- baseline preflight `npm run typecheck`: PASS
- baseline preflight `npm run test -- tests/contracts`: PASS — 2 files / 12 tests
- `npm run typecheck`: PASS
- `npm run test -- tests/retopo`: PASS — 5 files / 38 tests
- `npm run ci`: PASS — 9 files / 60 tests, typecheck, production build와 baseline artifact verifier 포함
- prohibited concrete import scan: PASS — `src/retopo/**`, `tests/retopo/**`에서 concrete
  Mesh/Surface/History/Renderer/Picking import 0건
- deterministic integration replay는 동일 sample/hit fixture를 단일 batch와 분할 batch로 재생해 serialized
  `RetopoStep`, `MeshCommand`, preview와 최종 fake mesh가 byte-identical임을 확인했다.
- staged cancel/budget fixture는 fake `MeshPatch`를 역순 revert해 version 0, vertex/face 0개로 복구되고 history
  commit이 필요 없는 adapter 경로를 확인했다.

### Integration notes
- 09 adapter는 첫 stroke 완료를 pending rail로 취급하고 두 번째 stroke의 `commit` step부터 하나의
  `HistoryTransaction`에 모든 applied patch를 기록해야 한다.
- 각 `commit`은 `MeshMutationService.execute` 후 반환된 `MeshMutationResult`를 같은 session의 `continue`에
  전달한다. `complete`에서 transaction을 commit하고 `rejected`, pointer cancel, tool 전환 또는 budget
  overflow에서는 rollback과 preview clear를 수행한다.
- pending 첫 rail은 engine instance 내부에 있으므로 tool deactivate/document replacement 시 09가 해당 tool의
  engine instance를 폐기하고 새 instance로 시작한다.
- Source/tests는 `RetopoStrokeInput`, `MeshQuery`, canonical result/command와 contract fake만 사용한다.

### Requested contract changes
- NONE

### Known limitations
- 실제 iPad Safari/Apple Pencil에서 pointer latency, 4 ms coalesced-batch target, 4,096-step rollback 시간과 thermal
  budget은 이번 환경에서 측정하지 못했다.
- 두 rail의 resampled point 수가 다르면 deterministic `chain-length-mismatch`로 reject한다. cross-chain
  resampling은 후속 algorithm 개선 범위다.
- 같은 원본 edge에 여러 unresolved split anchor가 있으면 frozen contract만으로 첫 split 이후 edge ID/`t`를
  안전하게 재매핑할 수 없어 명시적으로 reject한다.
