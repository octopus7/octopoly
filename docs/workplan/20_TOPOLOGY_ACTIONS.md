# 20 Topology Actions and Selection UX

## Required

YES — Mesh Kernel과 Selection Engine에 이미 구현된 topology repair/selection 기능을 사용자가 실행할 수 없으면 retopology tool로서 불완전하다. Guided 설명보다 먼저 실제 repair action layer가 필요하다.

## Execution

```text
Mode: WORKTREE
Branch: wt/topology-actions
Worktree: ../wt-topology-actions
Order: AFTER 19 PHASE A MAIN PUSH; MAY RUN IN PARALLEL WITH 21~24
Branch point: exact PRODUCT_INPUT_BASE_SHA from 19 Phase A
Output: verified unit commits + RESULT commit + same-name origin branch push
Main merge/tag/deploy: PROHIBITED
```

## Goal

- vertex/edge/face selection domain과 replace/add/subtract/toggle UI
- Select All, box/marquee 또는 lasso, loop, ring, grow, shrink, connected, domain conversion
- visible-only와 x-ray/through selection policy를 명시하고 24 display policy와 조합은 25에서 검증
- edge extrude, collapse/merge endpoint, weld target preview, dissolve edge
- two ordered boundary chain bridge, rotate quad diagonal
- `createFace`로 표현 가능한 simple triangle/quad boundary fill만 지원; n-gon/hole/non-planar fill은 명시적으로 거부
- command availability와 rejected element/reason feedback
- preview/cancel/failure atomicity와 action당 history entry 하나
- Pencil/touch/mouse/keyboard reachable action surface

## Non-Goals

- Mesh Kernel/Selection Engine 알고리즘 복제
- 16의 face-normal reference-free Extrude fallback을 복제/대체하지 않는다. 20은 canonical **edge extrude
  action**의 preview와 필수 non-zero offset 입력/검증/commit을 끝까지 소유한다. 21은 extrude 뒤 일반 선택
  transform만 소유하며 20의 `extrudeEdges(offset)` 실행을 대신하지 않는다.
- bevel/inset/knife/subdivision/n-gon 전체 suite
- transform/symmetry/visibility/project/import 구현
- shared bootstrap/composition, frozen contract breaking change

## Ownership

```text
src/modeling/actions/topology/**
src/modeling/actions/selection/**
src/tools/topology/**
src/ui/modeling-actions/**
src/app/topology-actions-entry.*
tests/modeling/actions/topology/**
tests/modeling/actions/selection/**
tests/tools/topology/**
tests/ui/modeling-actions/**
tests/integration/topology-actions.integration.*
tests/e2e/topology-actions.browser.*
docs/validation/topology-actions/**
docs/workplan/20_TOPOLOGY_ACTIONS.md (RESULT만)
```

`src/mesh/**`, `src/selection/**`, shared app bootstrap/composition/barrels는 Ownership 밖이며 25에서 조립한다.

## Agent Allocation

### Agent A — Selection Action Layer

- domain state와 canonical SelectionService adapters
- loop/ring/grow/shrink/connected/conversion action results
- deterministic enabled/disabled state와 stale selection prune

### Agent B — Topology Mutation Actions

- canonical MeshCommand validation/execute/history adapters
- edge extrude의 local offset interaction과 canonical `extrudeEdges(offset)` commit
- collapse/weld/dissolve/bridge/diagonal/fill preview와 atomic failure
- rejected stable IDs와 actionable reason mapping

### Agent C — UI and Branch-Local Evidence

- accessible action palette, shortcut-independent controls, confirmation where destructive
- canonical workspace fake를 사용한 DOM/tool flawed-quad repair fixture
- Pencil/touch/mouse/keyboard action reachability

### Main Agent Reserved

`src/app/topology-actions-entry.*`, integration tests, RESULT, branch commit/push. Shared registration은 25로 이관한다.

## Acceptance

- [ ] loop/ring/grow/shrink/connected/conversion과 marquee/lasso가 canonical snapshot/selection fake에서 동작한다.
- [ ] 기존 kernel topology command마다 reachable leaf action 또는 명시된 제외 근거가 있다.
- [ ] fill은 ordered simple triangle/quad에만 createFace를 사용하고 hole/n-gon/non-planar/self-intersection을 거부한다.
- [ ] invalid collapse/weld/dissolve/bridge/fill은 mutation 전에 disable/reject된다.
- [ ] success action 하나가 history entry 하나이며 undo/redo가 exact stable IDs를 복원한다.
- [ ] cancel/failure/stale version은 mesh/selection/history/preview를 보존한다.
- [ ] rejected elements와 이유가 stable deterministic order로 표시된다.
- [ ] branch-local DOM/tool harness에서 flawed quad patch를 select/repair/undo/redo하고 모든 input control에 접근한다.
- [ ] **25 integration gate:** real workspace registration, visible-only/x-ray picking과 practical-workspace E2E.
- [ ] primitive, mouse camera, Core-only/Optional regression과 canonical CI가 통과한다.
- [ ] branch만 non-force push하며 main/tag/deploy를 수행하지 않는다.

## RESULT

Status: NOT_STARTED

### Provenance
- Resolved start `PRODUCT_INPUT_BASE_SHA`: NOT_SET
- Branch/worktree: `wt/topology-actions` / `../wt-topology-actions`
- Final local branch tip: NOT_SET
- Pushed `origin/wt/topology-actions` tip: NOT_SET
- Start-SHA ancestry check: NOT_RUN

### Implemented / files / API
- NOT_STARTED

### Tests / browser / input evidence
- NOT_RUN

### Integration notes / contract requests
- NONE

### Final disposition
- Branch commit/push: NO
- Main merge/tag/deploy: NO
