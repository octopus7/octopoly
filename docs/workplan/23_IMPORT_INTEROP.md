# 23 Import, Reference Management, and Export Interop

## Required

YES — reference asset을 신뢰할 수 있게 가져오고 관리하며 단위·축·지원 제한을 확인하고 외부 DCC에서 export를 재검증해야 한다.

## Execution

```text
Mode: WORKTREE
Branch: wt/import-interop
Worktree: ../wt-import-interop
Order: AFTER 19 PHASE A; MAY RUN IN PARALLEL WITH 20/21/22/24
Branch point: exact PRODUCT_INPUT_BASE_SHA from 19 Phase A
Output: verified unit commits + RESULT commit + same-name origin branch push
Main merge/tag/deploy: PROHIBITED
```

## Goal

- reachable OBJ, GLB, embedded glTF import
- 19 Phase A의 `ReferenceSceneService`를 사용한 Reference/Edit Mesh role, reference Add/Replace/Remove
- stable ID/label/order/source/role/transform metadata의 lifecycle 단일 ownership
- format/count/bounds/material/node/primitive preflight를 supported/ignored/rejected로 분류
- explicit unit scale/up/forward/handedness conversion과 import 후 reference translate/rotate/scale 재편집
- supported node transform 적용 또는 pre-mutation rejection
- cancelable import, stale completion/resource cleanup
- successful Frame All
- export naming/unit/axis/failure feedback
- golden OBJ/GLB interop validation; silent first-mesh/primitive truncation 금지

## Ownership

```text
src/io/scene/**
src/io/interop/**
src/io/import/obj.ts
src/io/import/gltf.ts
src/io/import/index.ts
src/io/export/obj.ts
src/io/export/gltf.ts
src/io/export/mesh.ts
src/io/export/index.ts
src/project/reference-assets.ts
src/app/import/**
src/ui/import/**
tests/io/scene/**
tests/io/interop/**
tests/app/import/**
tests/ui/import/**
tests/fixtures/interop/**
tests/integration/import-interop.integration.*
tests/e2e/import-interop.browser.*
docs/validation/interop/**
docs/workplan/23_IMPORT_INTEROP.md (RESULT만)
```

23 주 에이전트가 위 existing importer/exporter/reference asset files를 단일 owner로 수정한다. shared
`CoreWorkspace`, bootstrap, renderer와 camera composition은 25가 소유한다. 24는 `ReferenceSceneState`의
visible/opacity/active-target fields를 소비하지만 reference identity/lifecycle/transform schema를 복제하지 않는다.
`src/project/reference-assets.ts`는 19 Phase A `ProjectCleanupParticipant`를 구현해 reference/image store names와
project-scoped cleanup callback을 22 coordinator에 제공한다. callback은 retained reachability set의 asset/revision을
절대 삭제하지 않으며 마지막 project reference가 사라진 asset만 수거한다. transaction orchestration은 22,
registration은 25다.

## Agent Allocation

- **Agent A — Scene Preflight/Conversion:** roles, counts/bounds, unit/axis, transforms, deterministic diagnostics
- **Agent B — Import/Export Adapter Safety:** cancel/stale/dispose, Add/Replace/Remove atomicity, resource cleanup, golden export
- **Agent C — UI/Fixtures/External Evidence:** accessible picker/progress/error, licensed/procedural fixtures, actual browser와 external consumer validation
- **Main Agent:** app-local entry, focused existing importer request, integration tests, RESULT, branch commit/push

## Acceptance

- [ ] OBJ/GLB/embedded glTF preflight와 branch-local reference/editable adapter가 canonical fake까지 도달한다.
- [ ] Reference/Edit Mesh와 Add/Replace/Remove/transform edit가 명시적·atomic·cancelable하다.
- [ ] type/content mismatch와 format feature를 supported/ignored/rejected로 구분하고 mutation 전에 진단한다.
- [ ] 입력을 첫 mesh/primitive로 조용히 truncate하지 않는다.
- [ ] unit/axis/reference transform과 golden bounds/winding이 일치한다.
- [ ] cancel/failure/stale completion에서 이전 reference/editable mesh/project가 보존된다.
- [ ] object URL/buffer/partial assets가 replace/cancel/dispose 뒤 누수되지 않는다.
- [ ] Save As로 공유된 reference/image revision은 원본 project 삭제 후 보존되고 마지막 참조 삭제 뒤에만 수거된다.
- [ ] OBJ export는 source polygon face loops를 보존한다. GLB는 format-required triangle topology와 source-face provenance를 검증한다.
- [ ] automated independent parser/consumer에서 expected scale/winding/topology를 검증한다.
- [ ] Blender interactive validation은 별도 external evidence다. 미실행이어도 automated development status와
  분리해 기록하며 Blender PASS를 주장하지 않는다.
- [ ] **25 integration gate:** real renderer Add/Replace/Remove/Edit Mesh, Frame All, 24 visibility와 complete-asset E2E.
- [ ] Core-only/Optional와 canonical CI가 통과한다.
- [ ] branch만 non-force push하며 main/tag/deploy를 수행하지 않는다.

Status 규칙: automated parser/consumer, atomicity, resource와 branch gate가 모두 PASS하면 technical Status는
`COMPLETE`로 기록할 수 있다. Blender evidence는 별도 `External evidence` 필드이며 미실행 시 interop release
readiness만 `BLOCKED`다. 자동 gate가 실패하면 technical Status도 `BLOCKED`다.

## RESULT
Status: NOT_STARTED

### Provenance
- Resolved start `PRODUCT_INPUT_BASE_SHA`: NOT_SET
- Branch/worktree: `wt/import-interop` / `../wt-import-interop`
- Final local branch tip: NOT_SET
- Pushed `origin/wt/import-interop` tip: NOT_SET
- Start-SHA ancestry check: NOT_RUN

### Implemented / fixtures / external/browser evidence
- NOT_STARTED / NOT_RUN

### Evidence classification
- Automated independent consumer: NOT_RUN
- Blender interactive: NOT_RUN
- Interop release readiness: NOT_ASSESSED

### Integration notes / contract requests
- NONE

### Final disposition
- Branch commit/push: NO
- Main merge/tag/deploy: NO
