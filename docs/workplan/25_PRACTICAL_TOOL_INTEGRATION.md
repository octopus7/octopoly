# 25 Practical Tool Integration

## Required

YES — 20 Topology Actions, 21 Transform/Refinement/Symmetry, 22 Project Lifecycle, 23 Import/Interop, 24 Visibility를 main에 조립하는 유일한 integration owner다. Guided Standard가 소비할 실사용 툴 baseline을 게시한다.

## Execution

```text
Mode: MAIN
Branch: main
Worktree: NONE
Order: AFTER 19 PHASE A AND 20~24 VERIFIED BRANCH PUSHES; BEFORE 17 STANDARD
Merge order: 20 -> 21 -> 22 -> 23 -> 24
Output: practical-tool integration anchor + descendant RESULT metadata commit + non-force origin/main push
Tags / Pages deploy: NONE
```

## Start Gates

- main clean, `HEAD == origin/main`, 19 Phase A `Status: COMPLETE`와 exact `PRODUCT_INPUT_BASE_SHA` ancestry 확인
- 20~24 RESULT status는 `COMPLETE` 또는 수용된 `READY_WITH_CONTRACT_REQUEST`다.
- branch-local code/test gates는 모두 PASS여야 한다. external/device evidence는 별도 필드로 읽고 미실행을
  PASS로 바꾸지 않는다.
- final branch tips와 same-name remote tips가 동일하고 exact Phase A anchor descendants다.
- changed files within ownership, contract requests decided before merge

## Ownership

```text
src/app/bootstrap.ts
src/app/bootstrap.css
src/app/composition/core-workspace.ts
src/app/composition/extension-host.ts
src/app/composition/index.ts
src/app/composition/practical-tools.ts
src/ui/index.ts
src/extensions/uv/extension/state-provider.ts
src/extensions/uv/editor/selection.ts
src/extensions/uv/editor/viewport-controller.ts
src/extensions/texture-paint/extension/texture-paint-state-provider.ts
src/extensions/texture-paint/extension/brush-controller.ts
src/extensions/texture-paint/image/texture-paint-image-controller.ts
src/extensions/lookdev/extension/state.ts
src/extensions/lookdev/extension/controller.ts
src/extensions/lookdev/material/material.ts
src/extensions/matcap/controller/matcap-state-provider.ts
src/extensions/matcap/controller/matcap-controller.ts

docs/workplan/INTERFACE_CONTRACTS.md
src/contracts/** (ONLY accepted additive requests frozen in RESULT before merge)
tests/contracts/** (ONLY matching accepted request coverage)

package.json
package-lock.json
playwright.config.ts
scripts/verify-practical-browser.mjs

tests/integration/practical-workspace/**
tests/e2e/practical-workspace/**
docs/validation/practical-workspace/**
docs/workplan/25_PRACTICAL_TOOL_INTEGRATION.md (RESULT만)
```

25는 merge 전 RESULT에 위 목록 중 실제 수정할 exact paths를 동결한다. 수용된 contract request는
`INTERFACE_CONTRACTS.md`, source/export와 tests를 같은 integration anchor에 함께 갱신하는 additive 변경만
허용한다. breaking request, 미동결 path 또는 문서/source 불일치는 merge를 abort하고 해당 leaf에 돌려보낸다.
위 Optional source files에는 기존 mutation 직후 additive
committed-change notification/subscription을 넣는 변경만 허용하며 UV/Paint/Lookdev/MatCap algorithms는 수정하지
않는다. 모든 producer는 event push 방식이어야 하며 polling은 금지한다. 20~24 내부 algorithms, existing
project/IO/render-pass/picking files를 integration 편의로 재작성하지 않는다.

## Agent Allocation

- **Agent A — Merge/Contract/Ownership Audit:** ancestry, diff, request decisions, Core/Optional isolation
- **Agent B — Shared Composition:** action registration, transform/project/import/visibility adapters와 lifecycle wiring
- **Agent C — Complete-Asset Browser/Data-Safety Evidence:** practical E2E, external files, recovery/resources
- **Main Agent:** sequential merge/conflict decisions, exact conditional ownership, RESULT, anchor, main push

## Canonical Browser Harness

25는 `@playwright/test`와 pinned project-local browser config를 추가해 실제 browser gate를 재현 가능하게 만든다.

```text
npm run verify:practical-browser
```

명령은 local production build를 ephemeral server에서 열고 Chromium WebGL2를 실제 실행한다. console/page errors,
network requests, screenshots/traces, GPU/WebGL capability, input/capture state와 durable artifacts를
`docs/validation/practical-workspace/`에 기록한다. 브라우저 설치/실행이 불가능하면 jsdom test로 대체하지 않고
25를 `BLOCKED`로 남긴다. physical iPad/trackpad는 별도 evidence이며 자동 browser PASS로 대체하지 않는다.

## Complete-Asset E2E

```text
New named project
-> import GLB/OBJ reference with scale/axis confirmation
-> adjust reference opacity and Frame All
-> create Plane starter topology
-> quad stroke / edge extrude
-> loop/ring select
-> slide / relax / project with offset
-> weld / dissolve / bridge / rotate diagonal
-> mirror symmetry
-> hide/isolate and inspect far side
-> Move/Rotate/Scale with pointer and numeric input
-> Undo/Redo
-> autosave/background/crash-style reload and restore
-> explicit Save As
-> reload
-> export OBJ and GLB
-> verify golden bounds/topology in external consumers
```

Failure slice는 dirty destructive cancel, invalid import retry, storage failure, stale async completion, pointer/tool cleanup과 no partial scene을 검증한다.

## Acceptance

- [ ] 20 -> 21 -> 22 -> 23 -> 24 merge order/provenance가 확인된다.
- [ ] 수용된 contract request는 exact paths/shape/affected leaves를 merge 전에 동결하고 문서/source/export/tests를
  함께 갱신해 재동결했으며, breaking/deferred/rejected request는 integration에 섞지 않았다.
- [ ] shared composition/conflicts는 25에서 한 번만 해결된다.
- [ ] topology action, transform/refinement/symmetry, visibility와 picking이 일관된다.
- [ ] import Add/Replace/Remove와 project dirty/recovery가 같은 data-safety policy를 지킨다.
- [ ] model/reference와 활성 Optional extension별 durable-source coverage matrix가 완전하다. producer 누락을 polling/추측으로 숨기지 않는다.
- [ ] 22 cleanup coordinator와 23 reference/image participant가 동일 project-delete transaction에 등록되고
  participant failure rollback이 actual IndexedDB에서 검증된다.
- [ ] actual IndexedDB에서 `Save As -> 원본 삭제 -> 복사본 reopen`이 shared reference/image revisions를
  보존하고, 마지막 project 삭제 뒤에만 unreferenced asset을 수거한다.
- [ ] actual Playwright Chromium complete-asset/failure E2E가 mesh counts, stable IDs, history, dirty/recovery, camera/display, exports, owner cleanup과 console error 0을 검증한다.
- [ ] 16/18, Core-only, all Optional combinations, save/reload/export와 context restore가 통과한다.
- [ ] canonical typecheck/test/build/CI와 resource cleanup이 통과한다.
- [ ] automated independent external consumer가 export를 검증한다. Blender/physical device 미검증은 정확히 별도 status로 남긴다.
- [ ] practical integration code/tests/evidence를 한 anchor commit으로 만들고 그 SHA를 `PRACTICAL_TOOL_BASE_SHA`로 캡처한다.
- [ ] descendant RESULT metadata commit에 anchor/provenance를 기록하고 두 commit을 non-force push한다.
- [ ] 17 Standard가 RESULT metadata tip이 아니라 exact anchor에서 분기하도록 공지한다.
- [ ] tag/Pages deploy를 수행하지 않는다.

`PRACTICAL_TOOL_BASE_SHA`는 practical code/composition/harness/tests/evidence가 들어간 integration anchor다. RESULT가
그 SHA를 기록하는 metadata commit은 anchor의 descendant이며 branch point가 아니다. Git self-reference를 피하기
위해 anchor 생성 → SHA 캡처 → RESULT metadata commit → 두 commit push 순서를 바꾸지 않는다.

Status 규칙: actual Playwright browser, canonical CI와 automated independent consumer가 PASS하면 technical
Status는 `COMPLETE`다. Blender와 physical iPad/trackpad는 별도 external/device evidence 및 release-readiness
필드로 기록하며 `NOT_RUN`을 PASS로 바꾸지 않는다. 자동 gate 실패는 항상 `BLOCKED`다.

## RESULT
Status: NOT_STARTED

### Input
- 19 Phase A status: NOT_CHECKED
- PRODUCT_INPUT_BASE_SHA: NOT_SET
- Frozen ownership paths: NOT_SET

### Merge provenance
| Workstream | RESULT status | Start SHA | Local tip | Remote tip | Ownership audit | Contract decision | Merge commit |
|---|---|---|---|---|---|---|---|
| 20 | NOT_CHECKED | NOT_SET | NOT_SET | NOT_SET | NOT_CHECKED | NONE REVIEWED | NONE |
| 21 | NOT_CHECKED | NOT_SET | NOT_SET | NOT_SET | NOT_CHECKED | NONE REVIEWED | NONE |
| 22 | NOT_CHECKED | NOT_SET | NOT_SET | NOT_SET | NOT_CHECKED | NONE REVIEWED | NONE |
| 23 | NOT_CHECKED | NOT_SET | NOT_SET | NOT_SET | NOT_CHECKED | NONE REVIEWED | NONE |
| 24 | NOT_CHECKED | NOT_SET | NOT_SET | NOT_SET | NOT_CHECKED | NONE REVIEWED | NONE |

### Shared reconciliation / tests / browser / external evidence
- Composition: NOT_STARTED
- Playwright actual browser: NOT_RUN
- Automated external consumer: NOT_RUN
- Blender interactive: NOT_RUN
- Physical device: NOT_RUN
- Practical development readiness: NOT_ASSESSED
- External/device release readiness: NOT_ASSESSED

### Output
- PRACTICAL_TOOL_BASE_SHA (integration anchor, not RESULT metadata commit): NOT_SET
- RESULT metadata commit: NOT_SET
- Main push: NO
- Tag/deploy: NO — prohibited
