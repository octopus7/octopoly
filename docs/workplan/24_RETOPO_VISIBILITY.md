# 24 Retopology Visibility and Reference Display

## Required

YES — opaque reference와 제한된 overlay만으로는 반대편 topology를 확인·선택·수정하기 어렵다. retopology visibility는 장식이 아니라 편집 정확도 기능이다.

## Execution

```text
Mode: WORKTREE
Branch: wt/retopo-visibility
Worktree: ../wt-retopo-visibility
Order: AFTER 19 PHASE A MAIN PUSH; MAY RUN IN PARALLEL WITH 20~23
Branch point: exact PRODUCT_INPUT_BASE_SHA from 19 Phase A
Output: verified unit commits + RESULT commit + same-name origin branch push
Main merge/tag/deploy: PROHIBITED
```

## Goal

- 19 Phase A `ReferenceSceneState`의 per-reference visibility/opacity와 active snap reference
- global retopo in-front/x-ray, solid+wire, wire-only, vertex visibility와 backface toggle
- hide selected, hide unselected/isolate, reveal all
- rendering/picking/editing visible-state predicate 일치
- persistence policy: global display mode는 local user preference라 project dirty 아님; per-reference display/active target은
  durable reference state이며 `DurableChangeEvent(domain=reference)`를 발생

## Non-Goals

- full object outliner/hierarchy
- material/lookdev redesign
- renderer architecture replacement
- hidden element deletion or mesh mutation

## Ownership

```text
src/renderer/settings/**
src/renderer/visibility/**
src/renderer/reference/reference-render-pass.ts
src/renderer/retopo/retopo-pass.ts
src/picking/pickingService.ts
src/ui/viewport-display/**
src/app/visibility-entry.*
tests/renderer/settings/**
tests/renderer/visibility/**
tests/renderer/reference/reference-render-pass.test.ts
tests/renderer/retopo/retopo-pass.test.ts
tests/picking/picking.test.ts
tests/ui/viewport-display/**
tests/integration/retopo-visibility.integration.*
tests/e2e/retopo-visibility.browser.*
docs/validation/retopo-visibility/**
docs/workplan/24_RETOPO_VISIBILITY.md (RESULT만)
```

24 주 에이전트가 위 existing render-pass/picking files를 단일 owner로 수정해 visibility predicate와 direct WebGL
pass evidence를 완성한다. shared `RenderSceneSnapshot` shape나 `CoreWorkspace` multiple-reference composition 변경은
금지하며 25에서 `ReferenceSceneState` adapter로 조립한다.

## Agent Allocation

### Agent A — Visibility State and Picking Policy

- immutable display state, hide/isolate/reveal와 active reference
- visible/editable/pickable invariant와 deterministic state transitions
- project persistence/context restore value policy

### Agent B — Renderer Adapters

- opacity, x-ray/in-front, wire/vertex/backface state의 renderer-local adapter
- context loss/restore와 resource leak 방지
- mobile overdraw/frame budget measurement hooks

### Agent C — UI and Browser Evidence

- accessible viewport display controls
- actual WebGL2 visual/picking evidence와 screenshot-independent state assertions
- far-side editing, multi-reference active target, orientation/resize smoke

### Main Agent Reserved

`src/app/visibility-entry.*`, integration tests, RESULT, branch commit/push. Shared renderer/composition seam은 25로 이관한다.

## Acceptance

- [ ] reference opacity/visibility, retopo in-front, wire-only와 backface toggle이 instrumented GL/pass fixture output을 바꾼다.
- [ ] hide/isolate/reveal visibility predicate가 rendering과 picking unit/integration paths에서 일관된다.
- [ ] hidden element를 branch-local harness에서 select/edit할 수 없다.
- [ ] `ReferenceSceneState`의 multiple-reference visibility와 active snap transition이 deterministic하다.
- [ ] context loss/restore가 global display preference와 renderer resources를 복원한다.
- [ ] per-reference display/active state만 durable reference event를 만들고 global mode는 project dirty를 만들지 않는다.
- [ ] opaque default가 regression-tested fallback이다.
- [ ] instrumented draw/overdraw/resource counters를 기록한다. actual browser GPU와 physical mobile performance는 25/device evidence이며 미실행을 PASS로 쓰지 않는다.
- [ ] **25 integration gate:** actual browser WebGL2에서 CoreWorkspace multiple-reference rendering/picking/editing, 20 through-selection, 21 active-target와 project persistence.
- [ ] Core-only/Optional와 canonical CI가 통과한다.
- [ ] branch만 non-force push하며 main/tag/deploy를 수행하지 않는다.

## RESULT

Status: NOT_STARTED

### Provenance
- Resolved start `PRODUCT_INPUT_BASE_SHA`: NOT_SET
- Branch/worktree: `wt/retopo-visibility` / `../wt-retopo-visibility`
- Final local branch tip: NOT_SET
- Pushed `origin/wt/retopo-visibility` tip: NOT_SET
- Start-SHA ancestry check: NOT_RUN

### Implemented / files / API
- NOT_STARTED

### Tests / browser / performance evidence
- NOT_RUN

### Integration notes / contract requests
- NONE

### Final disposition
- Branch commit/push: NO
- Main merge/tag/deploy: NO
