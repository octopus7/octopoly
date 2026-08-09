# 09 Integration

## Required
YES

## Execution
```text
Mode: MAIN
Branch: main
Worktree: NONE
Output: FINAL CORE INTEGRATION COMMIT + IMMUTABLE TAG `baseline/optional-sdk-v1`
```

## Goal
01~08의 필수 구현을 main에 조립하여 기본 retopology 제품을 완성한다.

10~13 Optional 기능은 성공 조건에 포함하지 않는다.

이 workstream은 composition root, shared contract/config reconciliation, cross-module adapter와 최종 Core 검증을
소유한다. 개별 module 내부 알고리즘을 편의상 재작성하지 않는다.

## Start Gate

다음을 모두 충족하기 전에는 merge 또는 application wiring을 시작하지 않는다.

- `docs/workplan/00_BOOTSTRAP.md`의 `RESULT`가 `COMPLETE`다.
- immutable ref `baseline/core-v1`이 존재하고 resolved SHA가 검증되었으며, 01~08 branch가 모두 그
  commit에서 분기했음이 확인된다.
- 01~08 각 작업 MD의 `RESULT`가 `COMPLETE` 또는 `READY_WITH_CONTRACT_REQUEST`이며 test 결과, 변경 파일,
  public API, Integration notes, Requested contract changes, Known limitations를 검토할 수 있다.
- `wt/main-leaf`, `wt/mesh-kernel`, `wt/surface-engine`, `wt/selection-engine`, `wt/history-engine`,
  `wt/tool-runtime`, `wt/renderer`, `wt/retopo-engine`이 모두 clean committed tip을 가지며 각 branch를
  `git rev-parse`로 해석할 수 있다.
- `NOT_STARTED`/`IN_PROGRESS`/`BLOCKED` workstream이나 미커밋 공용 contract 변경이 없다.

## Inputs

Integration 시작 전 다음 순서로 읽는다.

1. `/AGENTS.md`
2. `docs/workplan/00_MASTER.md`
3. `docs/workplan/00_BOOTSTRAP.md` 전체와 `baseline/core-v1`의 resolved SHA
4. `docs/workplan/INTERFACE_CONTRACTS.md`
5. `docs/workplan/01_MAIN_LEAF.md` ~ `docs/workplan/08_RETOPO_ENGINE.md`의 모든 `RESULT`

각 RESULT에서 최소한 status, 실제 수정 파일, public API, 실행한 검증, Integration notes, contract change
request와 limitation을 통합 체크리스트로 옮긴다. 일부 RESULT만 읽고 merge를 시작하지 않는다.
최종 workstream SHA는 RESULT 파일 안의 자기 참조 값이 아니라 각 branch tip을 `git rev-parse`해 기록한다.

## Recommended Merge Order

1. `wt/mesh-kernel`
2. `wt/surface-engine`
3. `wt/renderer`
4. `wt/selection-engine`
5. `wt/history-engine`
6. `wt/tool-runtime`
7. `wt/retopo-engine`
8. `wt/main-leaf`

각 merge 직후 해당 workstream test와 typecheck를 실행한다. conflict를 해결할 때 양쪽 구현을 임의로 섞지
않고 RESULT와 frozen contract를 기준으로 결정 근거를 남긴다.

## Integration Ownership

이 workstream에 한해 아래 shared/cross-module 파일을 조정할 수 있다.

```text
src/app/composition/**
src/app/bootstrap.*
src/main.*
src/contracts/**
tests/contracts/**
src/mesh/index.*
src/surface/index.*
src/selection/index.*
src/history/index.*
src/tools/runtime/index.*
src/renderer/index.*
src/retopo/index.*
src/optional-sdk/**
tests/integration/**
tests/e2e/**
tests/device/**
tests/optional-sdk/**
scripts/verify-core.*
scripts/verify-ipad.*
docs/validation/**

package.json 및 선택된 lockfile
tsconfig*.json
vite.config.*
vitest.config.* 또는 선택된 test 설정
.github/workflows/**
docs/workplan/INTERFACE_CONTRACTS.md
docs/workplan/09_INTEGRATION.md (RESULT만)
```

공유 설정/contract는 RESULT에 기록된 실제 불일치를 해결하는 최소 변경만 허용한다. 변경한 contract는 문서,
`src/contracts/**`, export와 contract tests를 한 commit에서 동기화한다.

### Conditional Reconciliation Ownership

`READY_WITH_CONTRACT_REQUEST`가 하나 이상이면 merge 전에 요청을 accepted/rejected/deferred로 예비 판정한다.
accepted 요청에 한해 주 에이전트는 요청에 명시된 affected module의 **public adapter/export와 focused tests**를
09 임시 소유로 배정할 수 있다. 내부 알고리즘 리팩터링이나 요청과 무관한 파일 수정은 허용하지 않는다.
실제 파일 목록과 배정 근거를 RESULT에 기록한다. rejected 요청 때문에 Core acceptance가 불가능하면 09를
`BLOCKED`로 종료한다.

## Agent Allocation

### Agent A — Merge / Contract Reconciliation

소유 파일:

```text
src/contracts/**
tests/contracts/**
src/mesh/index.*
src/surface/index.*
src/selection/index.*
src/history/index.*
src/tools/runtime/index.*
src/renderer/index.*
src/retopo/index.*
src/optional-sdk/runtime/**
src/optional-sdk/state/**
src/optional-sdk/testkit/**
tests/optional-sdk/runtime/**
tests/optional-sdk/state/**
package.json 및 선택된 lockfile
tsconfig*.json
vite.config.*
vitest.config.* 또는 선택된 test 설정
.github/workflows/**
docs/workplan/INTERFACE_CONTRACTS.md
```

책임:

- main agent가 순서대로 merge한 산출물의 contract mismatch와 requested change 전수 검토
- accepted/rejected 결정, 문서/소스/test 동기화와 migration 영향 기록
- duplicate/shadow type 제거, canonical import와 module dependency direction 유지
- shared build/test 설정의 최소 reconciliation
- `ExtensionRuntime`, `ExtensionStateRegistry`, contract-only test fakes와 optional SDK public entry 구현

### Agent B — Application Wiring

소유 파일:

```text
src/app/composition/**
src/app/bootstrap.*
src/main.*
tests/integration/**
```

책임:

- composition root에서 input -> tool runtime, camera -> renderer, picking -> selection 연결
- `PointerInputSink.dispatch`의 capture/release 결과 -> DOM pointer capture 및 lost-capture -> normalized cancel 연결
- tool -> `PickingService.rayFromScreen`/`SurfaceQuery` -> `RetopoStrokeInput` -> `RetopoStrokeSession` 연결
- renderer와 paint-facing SDK 양쪽에 같은 `MeshTriangulationService`를 주입
- session의 staged `RetopoStep.commit` -> mesh mutation -> `recordApplied(patch)` -> grouped history 연결
- 첫 mutation result를 session `continue`에 공급해 후속 face/bridge step을 얻되 임시 ID를 만들지 않음
- project IO/import/export wiring과 context-loss/application lifecycle adapter
- project load에서 `SerializedMesh -> MeshFactory.restore -> MeshDocument` 경로를 사용하고 save에서는
  `MeshDocument.serialize`만 사용
- reference import/save/load는 `ReferenceAssetService`로 local geometry와 transform을 보존하고,
  `ReferenceSurfaceFactory`가 만든 world-space `ReferenceSurface.geometry`를 query와 renderer 양쪽에 공급
- renderer initialize에 `ImageAssetResolver`를 주입하고 project save 전에 `ImageAssetService.flush()` 실행
- `ExtensionHost`의 tool/shading/image/panel registry와 read-only renderer control을 provider가 0개인 상태로
  구성하고 extension 역순 dispose 뒤 host의 registry/asset service를 dispose하되
  `src/extensions/**`는 import하지 않음
- `ModelingExtensionServices`, panel `NormalizedInputSurfaceFactory`, state registry를 host에 주입하고
  optional composition root/loader는 Core entrypoint와 분리
- project load/document 교체 알림이 Optional session을 cancel하고 state contribution을 hydrate하며, save는
  contributed image ref dedupe -> `flush(refs)` -> atomic document commit 순서로 수행
- module concrete type을 shared contract로 승격하거나 module 내부를 수정하지 않음

### Agent C — Validation / iPad Path

소유 파일:

```text
tests/e2e/**
tests/device/**
tests/optional-sdk/webgl2/**
scripts/verify-core.*
scripts/verify-ipad.*
docs/validation/**
```

책임:

- full typecheck/test/build와 Optional-free Core smoke/e2e
- deterministic vertical-slice automation과 실패/cancel/context-loss 경로
- public SDK fake만 쓰는 extension lifecycle test와 real WebGL2 provider compile/link harness
- 실제 iPad Safari + Apple Pencil 검증 절차, 증거와 미검증 항목 기록

### Main Agent Reserved Work

- merge order 실행과 merge commit 관리
- merge 전 contract request 예비 판정과 accepted 요청의 conditional file ownership 지정
- Agent A reconciliation 완료 후 공용 contract 재동결
- Agent B/C가 시작하기 전 소유 경로와 integration revision 확정
- `docs/workplan/09_INTEGRATION.md`의 `RESULT` 갱신
- 최종 Core integration commit에 immutable tag `baseline/optional-sdk-v1` 생성
- 최종 acceptance 판정과 미해결 core issue 보고

실행 순서는 `merge -> Agent A reconciliation -> contract freeze -> Agent B wiring과 Agent C fixture/기기 준비의
병렬 진행 -> 최종 검증`이다. Agent A/B/C의 쓰기 경로는 서로 겹치지 않는다.

## Required End-to-End Vertical Slice

최소 자동화 vertical slice는 다음 경계를 실제 composition root를 통해 통과해야 한다.

```text
Reference model import
-> ReferenceAssetService persist/resolve + ReferenceSurfaceFactory world-space bake
-> WebGL2 reference render of ReferenceSurface.geometry
-> normalized pen down/move(coalesced)/up dispatch
-> Tool Runtime capture
-> PickingService ray + SurfaceQuery hit
-> RetopoStrokeSession.update -> RetopoStep/ToolPreview
-> MeshMutationService.execute -> MeshMutationResult -> session.continue -> next step
-> every result.patch -> HistoryTransaction.recordApplied
-> one-stroke/one-history-entry commit
-> updated MeshSnapshot + selection/preview render
-> undo -> redo
-> project save/reload
-> export
```

별도 cancel slice는 `pointer cancel/lost capture -> preview clear -> transaction rollback -> mesh/history unchanged`를
검증한다. renderer slice는 initialize 결과/state, context loss/restore 결과와 Optional provider 실패 후 Core
fallback을 검증한다.

## Optional SDK Publication

09는 10~13이 Core concrete import 없이 시작할 수 있도록 다음을 `baseline/optional-sdk-v1`에 게시한다.

- canonical contract/package export와 `src/optional-sdk/**` 전용 entrypoint
- `ExtensionRuntime`의 activate/deactivate/reverse-dispose 및 Core와 분리된 optional composition root
- `ExtensionHost`와 modeling/input/image/panel/state/shading registry의 contract-only test fakes
- WebGL2 `glsl-es-300` provider의 supports/compile/link/candidate-snapshot/fallback harness
- image resolver revision invalidation/context restore fixture와 configured GPU/image budget
- Optional source를 제거해도 성공하는 Core-only build 명령

이 tag는 Optional 병렬 작업의 개발 branch point이지 release 승인 표식이 아니다. RESULT에는
`Release readiness: NOT_ASSESSED | READY | BLOCKED`를 별도로 기록한다. 09의 자동화 acceptance가 끝났지만
실제 iPad/Pencil 또는 hard-limit 측정이 없으면 Status는 `COMPLETE`일 수 있어도 Release readiness는
`BLOCKED`이며, 최종 release tag는 14에서 만들 수 없다.

## Core Acceptance

Optional 기능 없이 아래가 가능해야 한다.

```text
Reference model import
-> camera navigation
-> retopo mesh creation/edit
-> surface snapping
-> selection
-> move/delete/basic topology
-> Pencil stroke-based retopo
-> undo/redo
-> project persistence
-> export
```

위 기능 목록은 개별 smoke의 합이 아니라 Required End-to-End Vertical Slice와 실제 composition root에서
검증한다.

## iPad Safari Validation Path

- baseline ADR에 지정된 최소 지원 iPadOS/Safari 및 대표 기기에서 WebGL2 initialize/fallback을 확인한다.
- Apple Pencil의 down/move/coalesced/up, pressure/tilt 전달, pointer capture와 화면 밖 release를 확인한다.
- `pointercancel`, lost capture, app background/foreground에서 preview/history가 rollback되고 입력이 복구되는지
  확인한다.
- Pencil modeling 중 touch navigation의 분리와 multi-touch가 active Pencil gesture를 탈취하지 않는지 확인한다.
- CSS/device pixel, resize, orientation change와 viewport 복구 후 picking/overlay 정렬을 확인한다.
- 00 ADR의 기준 asset/mesh에서 frame time, pointer latency, memory와 thermal 관찰을 측정한다.
- 실기기 검증을 수행하지 못한 항목은 통과로 기록하지 않고 RESULT의 `iPad validation`과
  `Remaining core issues`에 명시한다.

## Acceptance / Tests

- [ ] `baseline/core-v1`의 resolved SHA와 01~08 branch ancestry를 확인했다.
- [ ] 01~08 모든 RESULT 항목과 contract request에 accepted/rejected/adapter/remaining 결론이 있다.
- [ ] merge마다 module tests/typecheck가 통과하고 최종 canonical `typecheck`, `test`, `build`, CI-equivalent가
      통과한다.
- [ ] Required End-to-End Vertical Slice와 cancel/context-loss slice가 실제 composition root에서 통과한다.
- [ ] 한 Pencil stroke의 다중 mesh patch가 history entry 하나이며 undo/redo가 stable ID/attributes를 복원한다.
- [ ] WebGL2 Core가 WebGPU 및 Optional 10~13 없이 ready initialize/render/restore되고 unsupported/failed가
      명시적 결과와 state로 검증된다.
- [ ] empty `ToolRegistry`, `RenderExtensionRegistry`, `PanelRegistry`, `ImageAssetService`,
      `ReferenceAssetService`, `ExtensionStateRegistry`, `ModelingExtensionServices`를 포함한 Optional SDK host와
      `ExtensionRuntime`이 Core-only composition에서 안전하게 생성·dispose된다.
- [ ] optional SDK export/test fake/WebGL2 provider harness와 optional source 제거 build 명령이 게시되었다.
- [ ] SDK fake에서 panel-local normalized input, stable modeling facade/document-change cancel, image revision
      undo/redo, candidate `[quality, realtime]` fallback과 versioned extension state round trip이 검증된다.
- [ ] 실제 iPad Safari + Apple Pencil path를 검증했거나 미검증 항목을 core issue로 명시했다.
- [ ] project save/reload/export 후 topology, attributes, reference local geometry/transform, image refs와
      extension data 보존을 검증한다.
- [ ] shared contract 변경은 문서/소스/export/tests가 동기화되고 근거가 RESULT에 기록된다.
- [ ] RESULT 갱신을 포함한 최종 Core integration commit에 `baseline/optional-sdk-v1` tag를 생성하고
      `git rev-parse baseline/optional-sdk-v1^{commit}`으로 resolved SHA를 최종 보고했다.

## Optional Isolation Check

- `src/extensions/**`가 없어도 core build 가능
- Core가 optional module을 import하지 않음
- optional shading/material/texture가 없어도 renderer 정상
- WebGPU backend와 WGSL provider가 없어도 required WebGL2 vertical slice 통과

## RESULT
Status: NOT_STARTED

Release readiness: NOT_ASSESSED

### Baseline refs
- Core input: `baseline/core-v1`
- Optional SDK output: `baseline/optional-sdk-v1`
- Output resolved SHA: 생성 후 최종 보고에서 검증

### Integrated
-

### Conflicts resolved
-

### Contract changes accepted
-

### Contract changes rejected
-

### Files created or modified
-

### Public API / exports
-

### Build / test
-

### iPad validation
-

### Integration notes
-

### Remaining core issues
-
