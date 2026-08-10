# 21 Transform, Surface Refinement, and Symmetry

## Required

YES — 16의 reference-free Move/Extrude를 확장한다. 20과는 같은 baseline에서 병렬 실행하므로 selection/action
concrete 구현에 의존하지 않고 canonical contract/fake를 소비하며 실제 20+21 조합은 25에서 검증한다.

## Execution

```text
Mode: WORKTREE
Branch: wt/transform-refinement
Worktree: ../wt-transform-refinement
Order: AFTER 19 PHASE A; MAY RUN IN PARALLEL WITH 20/22/23/24
Branch point: exact PRODUCT_INPUT_BASE_SHA from 19 Phase A
Output: verified unit commits + RESULT commit + same-name origin branch push
Main merge/tag/deploy: PROHIBITED
```

## Goal

- Move/Rotate/Scale, X/Y/Z와 XY/XZ/YZ constraint, world/view orientation
- pointer와 finite numeric entry의 동일 command path
- screen/construction-plane과 surface-constrained mode
- vertex/edge slide
- boundary/pinned vertex를 보존하는 deterministic relax
- explicit project-to-reference/shrinkwrap와 adjustable surface offset
- injected `ReferenceSceneService`/target resolver를 통한 active-target projection; 24 concrete state를 직접 import하지 않음
- 최소 vertex/edge/seam snapping과 finite tolerance/priority
- X/Y/Z mirror symmetry for create/move/weld/delete, seam policy와 missing counterpart handling
- symmetry 설정과 stable counterpart map의 versioned serializable local state; 25가 project extension persistence에 연결
- staged mirrored create는 allocator ID를 예측하지 않고 결과 ID를 순차 수집하며 전체를 history transaction 하나로 묶음
- preview/cancel, confirm 시 one history transaction

## Non-Goals

- object hierarchy/outliner/instance
- arbitrary custom orientation, proportional/lattice, bevel/inset/knife
- Mesh/History/Surface concrete 구현 복제 또는 breaking contract

## Ownership

```text
src/modeling/transform/**
src/modeling/refinement/**
src/modeling/symmetry/**
src/tools/transform/**
src/tools/refinement/**
src/ui/transform-controls/**
src/app/transform-refinement-entry.*
tests/modeling/transform/**
tests/modeling/refinement/**
tests/modeling/symmetry/**
tests/tools/transform/**
tests/tools/refinement/**
tests/ui/transform-controls/**
tests/integration/transform-refinement.integration.*
tests/e2e/transform-refinement.browser.*
docs/validation/transform-refinement/**
docs/workplan/21_TRANSFORM_REFINEMENT_SYMMETRY.md (RESULT만)
```

16 소유 경로, `src/camera/**`, shared renderer/composition/barrels는 Ownership 밖이며 25에서 조립한다.

## Agent Allocation

### Agent A — Transform and Constraint Math
- pivot, finite axis/plane ray intersection, world/view orientation
- Move/Rotate/Scale and numeric input values
- near-parallel, zero-radius, negative/zero scale policy

### Agent B — Refinement and Symmetry
- slide/relax/project-to-reference/surface offset
- mirror mapping, seam tolerance, symmetric create/move/weld/delete
- deterministic preview, topology conflict와 missing counterpart atomic rejection

### Agent C — Tool/UI and Browser Evidence
- normalized pointer tool sessions, accessible gizmo/controls
- Pencil/touch/mouse/keyboard paths
- character-half symmetry and surface-refinement browser fixture

### Main Agent Reserved
`src/app/transform-refinement-entry.*`, integration tests, RESULT, branch commit/push. Shared composition은 25로 이관한다.

## Acceptance

- [ ] Move/Rotate/Scale와 axis/plane constraints가 canonical selection fake와 reference 유무 모두에서 finite하다.
- [ ] pointer와 numeric input이 같은 command/history 결과를 낸다.
- [ ] slide가 valid edge path를 벗어나지 않고 vertex/edge/seam snap priority와 tolerance가 deterministic하다.
- [ ] relax가 pinned/boundary를 보존하고 deterministic finite output을 낸다.
- [ ] project-to-reference가 injected active-target resolver와 offset을 존중한다.
- [ ] mirrored create/move/weld/delete가 seam과 stable undo/redo를 보존하며 staged failure가 전체 rollback된다.
- [ ] symmetry settings/counterpart map이 save/reload fake에서 stable IDs와 schema version을 보존한다.
- [ ] preview는 mesh/history를 바꾸지 않고 confirm 한 번이 history entry 하나다.
- [ ] cancel/lost capture/stale version/parallel ray/missing counterpart/topology conflict는 atomic no-op과 actionable error다.
- [ ] branch-local deterministic DOM/tool fixture에서 half-character를 refine/mirror/undo/redo한다.
- [ ] **25 integration gate:** 20 selection actions, 24 active target, project persistence와 real workspace 조합.
- [ ] 16/18, Core-only/Optional와 canonical CI가 통과한다.
- [ ] branch만 non-force push하며 main/tag/deploy를 수행하지 않는다.

## RESULT
Status: NOT_STARTED

### Provenance
- Resolved start `PRODUCT_INPUT_BASE_SHA`: NOT_SET
- Branch/worktree: `wt/transform-refinement` / `../wt-transform-refinement`
- Final local branch tip: NOT_SET
- Pushed `origin/wt/transform-refinement` tip: NOT_SET
- Start-SHA ancestry check: NOT_RUN

### Implemented / tests / browser / device evidence
- NOT_STARTED / NOT_RUN

### Integration notes / contract requests
- NONE

### Final disposition
- Branch commit/push: NO
- Main merge/tag/deploy: NO
