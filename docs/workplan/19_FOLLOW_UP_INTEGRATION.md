# 19 Follow-up Product Integration

## Required

YES — 16 Basic Primitives, 18 Desktop Mouse Camera, 17 Guided Retopo 산출물을 main에 조립하는 유일한 후속 통합 workstream이다.

16~18 WORKTREE는 직접 main을 merge하거나 main을 push하지 않는다. 19만 각 RESULT, branch tip, ancestry와 검증 evidence를 판정하고 shared seam을 조정한다.

## Execution

```text
Mode: MAIN
Branch: main
Worktree: NONE
Order: PHASE A AFTER 16 + 18; PHASE B AFTER 25 AND 17 STANDARD
Input plan baseline: exact POST_PLAN_BASE_SHA recorded after the planning commit is pushed
Phase A output: integration anchor (`PRODUCT_INPUT_BASE_SHA`) + descendant RESULT metadata commit
Phase B input: exact PRACTICAL_TOOL_BASE_SHA recorded and pushed by 25
Phase B output: main commit containing accepted 17 and combined product E2E
Push: non-force origin/main after each verified phase
Tags / deploy: NONE
```

19는 `baseline/full-v1`, `deploy/*` 또는 다른 immutable tag를 만들지 않는다. Cloudflare Pages preview/production/rollback은 15만 소유한다. 실제 iPad/Pencil evidence가 없으면 해당 항목을 PASS로 기록하지 않는다.

## Required Inputs

다음을 순서대로 끝까지 읽는다.

1. `/AGENTS.md`
2. `docs/workplan/00_MASTER.md`
3. `docs/workplan/00_BOOTSTRAP.md`
4. `docs/workplan/INTERFACE_CONTRACTS.md`와 실제 `src/contracts/**`
5. `docs/workplan/09_INTEGRATION.md` RESULT
6. `docs/workplan/14_OPTIONAL_INTEGRATION.md` RESULT
7. `docs/workplan/16_BASIC_PRIMITIVES.md` 전체와 RESULT
8. `docs/workplan/18_DESKTOP_MOUSE_CAMERA.md` 전체와 RESULT
9. Phase B에서 `docs/workplan/20_TOPOLOGY_ACTIONS.md`부터 `25_PRACTICAL_TOOL_INTEGRATION.md`까지와 RESULT
10. Phase B에서 `docs/workplan/17_GUIDED_RETOPO.md` 전체와 RESULT

## Start Gates

### Common

- 현재 branch가 `main`, worktree가 clean이고 `HEAD == origin/main`이다.
- planning commit의 exact SHA를 `POST_PLAN_BASE_SHA`로 기록한다.
- `POST_PLAN_BASE_SHA`가 14 개발 통합 RESULT commit의 후손이다.
- 입력 branch tip은 clean committed state이고 각 계획의 시작 SHA를 ancestor로 가진다.
- RESULT status가 해당 phase에 필요한 `COMPLETE` 또는 명시적으로 수용 가능한 `READY_WITH_CONTRACT_REQUEST`다.
- 변경 파일이 각 workstream Ownership과 일치한다.
- contract request를 merge 전에 `accepted | rejected | deferred`로 판정한다.
- unresolved merge conflict, 출처 불명 branch tip, uncommitted 결과 또는 다른 workstream 침범이 있으면 시작하지 않는다.

### Phase A

- `wt/basic-primitives`와 `wt/desktop-mouse-camera`가 모두 검증·push되어 있다.
- 16과 18이 모두 exact `POST_PLAN_BASE_SHA`에서 시작했다. 하나라도 다르면 Phase A를 시작하지 않고 해당
  branch를 exact anchor에서 다시 생성한다.
- 16의 primitive/framing/reference-free editing과 18의 input-owner/wheel 산출물이 각각 독립 acceptance를 통과했다.

### Phase B

- Phase A가 main에 push되었고 그 exact commit을 `PRODUCT_INPUT_BASE_SHA`로 기록했다.
- 25가 20~24를 통합·검증하고 exact `PRACTICAL_TOOL_BASE_SHA`를 main에 push했다.
- 표준 `wt/guided-retopo`가 정확히 `PRACTICAL_TOOL_BASE_SHA`에서 시작했다.
- early-core commit을 사용했다면 허용된 순수 경로만 검토 후 표준 branch에 cherry-pick되었고 provenance가 RESULT에 있다.
- 17의 실제 first-asset, mouse-only, offline/recovery, accessibility gate가 요구된 범위에서 완료되었다.

## Phase A — Primitive and Desktop Input Integration

권장 merge 순서:

1. `wt/basic-primitives`
2. focused 16 tests와 Core/Optional regression
3. `wt/desktop-mouse-camera`
4. focused 18 tests와 Core/Optional regression
5. shared seam reconciliation
6. 20~24 공통 additive product contracts와 contract tests 게시
7. actual browser combined E2E
8. **Phase A integration anchor commit** 생성 후 `git rev-parse HEAD`를 `PRODUCT_INPUT_BASE_SHA`로 캡처
9. RESULT에 Phase A status/anchor/evidence를 기록하는 별도 metadata commit 생성
10. anchor와 metadata commit을 함께 main에 non-force push

### Shared seam ownership

Phase A에서만 주 에이전트가 다음 공용 seam을 조정할 수 있다.

```text
src/app/composition/core-workspace.ts
src/app/composition/index.ts
src/app/bootstrap.ts
src/app/bootstrap.css
src/camera/index.ts
src/tools/basic/gesture.ts
src/contracts/reference-scene.ts
src/contracts/durable-change.ts
src/contracts/project-cleanup.ts
src/contracts/extensions.ts
src/contracts/index.ts
docs/workplan/INTERFACE_CONTRACTS.md

tests/contracts/reference-scene.test.ts
tests/contracts/durable-change.test.ts
tests/contracts/project-cleanup.test.ts
tests/contracts/extensions-durable-change.test.ts
tests/integration/core-workspace.integration.test.ts
tests/e2e/core-workspace-vertical.test.ts
tests/camera/camera.test.ts
tests/tools/basic/basic-tools.test.ts
tests/e2e/follow-up-product.browser.*

docs/validation/follow-up/**
docs/workplan/19_FOLLOW_UP_INTEGRATION.md (RESULT만)
```

16은 primitive recipe/command, construction-plane helper와 leaf UI adapter를 게시하고, 18은 mouse/wheel adapter와 pure owner/router를 게시한다. 공용 composition, shared camera barrel 및 cross-feature routing 충돌은 19가 한 번만 해결한다.

### Product contract publication for 20~24

Phase A anchor에는 concrete implementation이 아닌 다음 additive frozen boundary를 포함한다.

이 boundary는 `INTERFACE_CONTRACTS.md`, 실제 source/export와 contract tests를 같은 anchor commit에서 함께
갱신한 뒤 재동결한다. 문서와 source가 다른 이름/shape를 갖거나 일부만 commit되면 Phase A를 완료하지 않는다.

- `ReferenceSceneState`: stable reference ID, label/order/role/source format/transform/visible/opacity와 단일
  `activeSnapReferenceId`를 표현한다.
- `ReferenceSceneService`: immutable snapshot/revision, add/replace/remove, transform/display/active-target command와
  committed-change subscription을 제공한다. storage handle과 renderer geometry를 동일시하지 않는다.
- `DurableChangeEvent` / `DurableChangeSource`: project ID, monotonically increasing revision, model/reference/extension
  domain과 committed change만 전달한다. selection/camera/hover/preview는 durable event가 아니다.
- `ExtensionHost`에는 Optional producer가 committed durable source를 등록/해제할 additive boundary를 제공한다.
  등록하지 않은 extension state producer는 25 coverage audit에서 명시적 blocker다.
- `ProjectCleanupParticipant` / registry는 participant ID, 필요한 durable store names와 동일 project-delete
  transaction 안에서 실행할 deterministic cleanup callback을 제공한다. 22가 transaction/coordinator를,
  23이 reference/image participant를 소유하고 25가 registration을 조립한다.
- cleanup context는 삭제 대상 외 **남은 모든 ProjectDocument**에서 계산한 retained reference/image revision
  reachability set을 같은 transaction snapshot으로 전달한다. participant는 이 set에 있는 asset/revision을
  삭제할 수 없고, Save As로 공유된 asset은 마지막 참조가 사라질 때만 수거한다.

20~24는 이 contract를 소비하며 shadow descriptor/event type을 만들지 않는다. 23은 reference lifecycle/transform,
24는 display/active-target policy, 21은 injected active-target resolver, 22는 durable feed aggregation을 소유한다.
Contract test는 command/revision ordering, stale update rejection, stable IDs, finite transform/opacity, unsubscribe,
duplicate participant rejection, cleanup failure rollback과 `Save As -> 원본 삭제 -> 복사본 reopen` asset
보존을 검증한다. concrete storage/render/picking wiring은 각 leaf 소유 범위와 25 integration에서 수행한다.

### Phase A combined E2E

```text
fresh empty workspace
-> Add Plane
-> selected and framed
-> middle-drag orbit
-> Shift+middle-drag pan
-> wheel zoom
-> left-button Move/Extrude without a reference
-> Undo/Redo
-> save/reload
-> OBJ and GLB export

fresh empty workspace
-> Add Cube
-> frame all selected faces
-> orbit/pan/zoom around every side
-> Undo to empty state
-> Redo to identical topology
```

버튼 존재만 확인하지 않는다. mesh counts, stable IDs, selection, camera snapshots, rendered non-empty frame, history labels, persisted document, export payload, pointer owner/capture cleanup과 console error 0을 evidence로 기록한다.

`PRODUCT_INPUT_BASE_SHA`는 **Phase A integration anchor commit**이다. RESULT metadata commit의 SHA가 아니다.
Git commit은 자기 SHA를 자기 내용에 기록할 수 없으므로 다음 절차를 강제한다.

```text
create and verify Phase A integration anchor commit
-> PRODUCT_INPUT_BASE_SHA=$(git rev-parse HEAD)
-> create a descendant RESULT-only metadata commit recording that anchor
-> push both commits
-> resolve the recorded anchor from pushed origin/main RESULT
-> create 20~24 worktrees exactly from PRODUCT_INPUT_BASE_SHA
```

17 Standard는 이 SHA에서 시작하지 않는다. 25가 게시할 `PRACTICAL_TOOL_BASE_SHA`에서만 시작한다.

## Phase B — Guided Retopo Integration

1. 25 RESULT의 `PRACTICAL_TOOL_BASE_SHA`와 `wt/guided-retopo` branch point를 확인한다.
2. 17 RESULT, sample provenance/license, device/browser evidence를 판정한다.
3. 17 branch를 main에 non-fast-forward merge한다.
4. Guided app adapter, bootstrap panel과 shared project/input seam을 최소 reconciliation한다.
5. Guided 제거/비활성 Pro mode, Core-only와 Full Optional regression을 실행한다.
6. combined product E2E를 actual browser에서 실행한다.
7. 19 RESULT Phase B를 갱신하고 reconciliation/tests/evidence와 RESULT를 포함한 final main commit을 만든 뒤
   non-force push한다. Phase B는 후행 branch point를 게시하지 않으므로 별도 anchor/metadata 쌍을 만들지 않는다.

Phase B에서만 다음 추가 seam을 소유할 수 있다.

```text
src/app/composition/guided-*
src/app/bootstrap.ts
src/app/bootstrap.css
tests/app/guided/**
tests/integration/guided/**
tests/e2e/guided/**
scripts/verify-guided*
docs/validation/guided/**
```

Guided의 lesson engine, content, diagnostics와 preview 내부를 integration 편의상 재작성하지 않는다.

### Phase B combined E2E

```text
fresh offline launch
-> choose primitive or approved guided sample
-> camera/input introduction using integrated desktop controls
-> complete one purpose-based lesson through existing Tool/Retopo services
-> inspect and dismiss a non-blocking diagnostic
-> Undo/Redo
-> pause and reload offline
-> resume
-> switch to Pro without mesh/history/selection loss
-> save/reload
-> OBJ/GLB export
```

## Agent Allocation

### Agent A — Merge and Ownership Audit

소유:

```text
merge/ancestry/change-file audit
contract request decision record
Core/Optional import isolation scan
```

읽기·검증 중심이다. merge conflict를 임의로 해결하지 않고 주 에이전트에게 정확한 파일과 양쪽 의도를 보고한다.

### Agent B — Shared Composition Reconciliation

소유:

```text
src/app/composition/** 중 위 phase별 shared seam
src/app/bootstrap.ts
src/app/bootstrap.css
src/camera/index.ts (Phase A 조건부)
src/tools/basic/gesture.ts (Phase A 조건부)
관련 focused app/camera/tool tests
```

workstream 내부 알고리즘을 재작성하지 않고 additive adapter와 lifecycle wiring만 조정한다.

### Agent C — Combined Browser and Regression Evidence

소유:

```text
tests/e2e/follow-up-product.browser.*
docs/validation/follow-up/**
Phase별 실행 전 동결된 테스트 revision에서의 검증 evidence
```

실제 browser evidence와 synthetic fixture를 분리하고 physical iPad/trackpad claim은 실제 증거가 있을 때만 기록한다.

### Main Agent Reserved

- sequential merge와 conflict 판정
- Agent별 exact path freeze
- shared config/contract 변경 필요성 판정
- `PRODUCT_INPUT_BASE_SHA` 확정
- 19 RESULT
- phase별 main commit과 non-force push

## Validation

최소 다음을 final tree에서 실행한다. 실제 package script 이름은 시작 시 재확인한다.

```text
npm run typecheck
npm run test
npm run verify:core
npm run verify:optional
npm run verify:ipad
npm run ci
```

Phase A에는 16/18 focused unit·integration·browser 검증을, Phase B에는 Guided core/content/analysis/accessibility/first-asset 검증을 추가한다.

## Acceptance Gates

### Phase A

- [ ] 16과 18 branch ancestry, RESULT, push tip과 Ownership을 확인했다.
- [ ] 16 -> 18 순서로 merge하고 각 merge 직후 focused regression을 통과했다.
- [ ] shared seam이 19에서 한 번만 reconciliation되었다.
- [ ] additive `ReferenceSceneService`, `DurableChangeSource`와 `ProjectCleanupParticipant` contract/tests가 Phase A anchor에 게시되었다.
- [ ] primitive 생성·framing·reference-free editing과 mouse orbit/pan/wheel/left modeling 조합 E2E가 실제 browser에서 통과했다.
- [ ] pointer owner/capture, touch/Pencil, Core-only와 Full Optional 회귀가 통과했다.
- [ ] Phase A integration anchor를 `PRODUCT_INPUT_BASE_SHA`로 캡처하고 descendant RESULT metadata commit에 기록했다.
- [ ] 두 commit을 non-force push하고 20~24가 anchor에서만 분기하도록 공지했다.

### Phase B

- [ ] 25가 게시한 exact `PRACTICAL_TOOL_BASE_SHA`와 20~24 merge provenance를 확인했다.
- [ ] 17 Standard branch가 정확히 `PRACTICAL_TOOL_BASE_SHA`에서 시작했다.
- [ ] early-core provenance와 standard-only app wiring 경계를 확인했다.
- [ ] Guided/Pro가 25의 같은 canonical service/action instance를 사용한다.
- [ ] actual first-asset, input/accessibility, offline/recovery와 Pro 전환 E2E가 통과했다.
- [ ] Guided 제거/비활성, practical workspace, Core-only, Optional 조합과 canonical CI가 통과했다.
- [ ] 19 RESULT를 갱신하고 reconciliation/tests/evidence를 포함한 final main commit을 non-force push했다.

### Global

- [ ] 16~18 worktree가 main merge/push를 수행하지 않았다.
- [ ] 19가 Pages deploy나 immutable tag를 만들지 않았다.
- [ ] 실행하지 않은 physical device 항목을 PASS로 기록하지 않았다.

## Failure and Stop Rules

- RESULT/Ownership만으로 판정할 수 없는 merge conflict는 merge를 abort하고 구체적으로 보고한다.
- frozen contract 또는 shared config 변경이 필요하면 change request와 affected tests를 먼저 기록하고, Phase 범위에서 additive reconciliation이 명시적으로 허용되지 않으면 중단한다.
- Core-only import isolation, pointer owner cleanup, stable-ID history round trip, save/reload/export 또는 actual browser E2E가 실패하면 해당 Phase를 완료하지 않는다.
- Phase A push 전 20~24 또는 17 Standard를 시작하지 않는다. 17 Standard는 25의 `PRACTICAL_TOOL_BASE_SHA`
  push 전 시작하지 않는다.
- Phase B 완료 여부와 무관하게 `baseline/full-v1` 또는 deploy tag를 만들지 않는다.

## RESULT

Status: NOT_STARTED

> Overall status는 Phase A와 Phase B 중 더 낮은 상태를 요약한다. 후속 start gate는 overall status가 아니라
> 아래 phase status와 exact anchor를 읽는다.

### Planning baseline
- POST_PLAN_BASE_SHA: NOT_SET

### Phase A
- Status: NOT_STARTED
- 16 branch tip / remote tip / RESULT: NOT_CHECKED
- 18 branch tip / remote tip / RESULT: NOT_CHECKED
- Merge commits: NONE
- Shared reconciliation: NOT_STARTED
- Product contracts/tests: NOT_STARTED
- Combined E2E: NOT_RUN
- PRODUCT_INPUT_BASE_SHA (integration anchor, not RESULT metadata commit): NOT_SET
- RESULT metadata commit: NOT_SET
- Main push: NO

### Phase B
- Status: NOT_STARTED
- 25 practical tool RESULT / PRACTICAL_TOOL_BASE_SHA: NOT_CHECKED
- 17 branch tip / remote tip / RESULT: NOT_CHECKED
- Early-core provenance: NOT_CHECKED
- Merge commit: NONE
- Guided combined E2E: NOT_RUN
- Final main commit: NOT_SET
- Main push: NO

### Contract requests
- NONE REVIEWED

### Tests / validation
- NOT_RUN

### Browser / device evidence
- Desktop browser: NOT_RUN
- Physical iPad Safari / Apple Pencil: NOT_RUN
- Physical precision trackpad / external iPad pointer: NOT_RUN

### Known limitations
- NOT_EVALUATED

### Final disposition
- Tag created: NO — prohibited
- Pages deploy performed: NO — prohibited
