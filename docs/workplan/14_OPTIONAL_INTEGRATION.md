# 14 Optional Integration

## Required

NO — Core-only 제품에는 필요하지 않지만 **10~13을 포함한 Full Optional 배포에는 필수**다.

이 workstream을 생략해도 `baseline/optional-sdk-v1`의 Core는 정상이어야 한다. 반대로 `baseline/full-v1`은
10~13을 이 문서의 게이트에 따라 통합·검증하지 않고 생성할 수 없다.

## Policy Compatibility Gate

루트 `AGENTS.md`와 `00_MASTER.md`는 14를 post-Core Optional Integration으로 인정한다. 이 권한은 14 실행
대화에만 적용되며 10~13 작업자에게 merge/push 권한을 주지 않는다. 10~13은 각자의 WORKTREE에서 구현과
RESULT commit까지만 수행하고, main merge와 최종 tag는 14의 주 에이전트만 수행한다.

## Execution

```text
Mode: MAIN
Branch: main
Worktree: NONE
Order: AFTER 09 COMPLETE AND AFTER 10~13 COMMITTED RESULTS
Input baseline: `baseline/optional-sdk-v1^{commit}`
Output: FINAL OPTIONAL INTEGRATION COMMIT + IMMUTABLE TAG `baseline/full-v1`
Push: PRE-AUTHORIZED AFTER ALL ACCEPTANCE/RESULT/TAG GATES; NEVER FORCE-PUSH
```

별도 worktree를 만들지 않는다. merge 전에 현재 branch가 `main`이고 working tree가 clean한지 확인한다.
관련 없는 사용자 변경이 있으면 건드리지 않으며, 안전하게 분리할 수 없으면 merge를 시작하지 않는다.

## Goal

09가 게시한 Core/Optional SDK 위에 10 UV Editor, 11 Texture Paint, 12 Lookdev, 13 MatCap을 additive하게
통합하고 다음 두 제품을 모두 보장한다.

```text
Core entrypoint
-> Optional module을 import하지 않음
-> `src/extensions/**`가 없어도 build/test/runtime 정상

Optional entrypoint
-> 선택된 extension만 deterministic하게 load
-> 한 ExtensionHost와 공용 asset/renderer bridge를 사용
-> 실패한 extension만 격리하고 Core는 계속 동작
-> 역순 dispose와 이전 shading mode 복원
```

14는 branch merge, Optional SDK reconciliation, optional composition root, cross-extension lifecycle 및 최종
검증을 소유한다. 10~13의 내부 알고리즘을 편의상 재작성하지 않는다.

## Non-Goals

- UV projection/island, brush, PBR shader 또는 MatCap shader 알고리즘 재구현
- Optional 기능을 Core 기본 entrypoint나 필수 dependency로 승격
- 10~13 worktree에서 main merge, tag 또는 push 수행
- frozen contract 누락을 shadow type, service locator 또는 concrete Core import로 우회
- hard-limit 실패나 미실행 실기기 검증을 문서상 통과로 간주

## Required Inputs

아래를 순서대로 끝까지 읽는다.

1. `/AGENTS.md`
2. `docs/workplan/00_MASTER.md`
3. `docs/workplan/00_BOOTSTRAP.md`
4. `docs/workplan/INTERFACE_CONTRACTS.md`와 실제 `src/contracts/**`
5. `docs/workplan/09_INTEGRATION.md` 전체, RESULT, `baseline/optional-sdk-v1` resolved SHA
6. `docs/workplan/10_UV_EDITOR.md`
7. `docs/workplan/11_TEXTURE_PAINT.md`
8. `docs/workplan/12_LOOKDEV_RENDER.md`
9. `docs/workplan/13_MATCAP.md`

각 Optional RESULT의 status, 실제 변경 파일, public API, 검증 명령, Integration notes, Requested contract
changes, Known limitations를 하나의 preflight 표로 옮긴다. 최종 SHA는 RESULT 내부의 자기 참조 값이 아니라
branch tip을 `git rev-parse`하여 기록한다.

## Start Gates

다음을 모두 충족하기 전에는 첫 merge를 시작하지 않는다.

- `09_INTEGRATION`의 RESULT가 `COMPLETE`이고 `baseline/optional-sdk-v1`이 존재한다.
- tag의 resolved commit이 현재 `main` ancestry에 있고, 10~13의 시작 기준과 정확히 일치한다.
- 10~13 RESULT가 모두 `COMPLETE` 또는 `READY_WITH_CONTRACT_REQUEST`다.
- 각 RESULT에 files, public API, tests, integration notes, contract request와 limitations가 채워져 있다.
- 각 전용 branch tip은 clean committed state이고 `baseline/optional-sdk-v1`을 ancestor로 가진다.
- `NOT_STARTED`, `IN_PROGRESS`, `BLOCKED`, uncommitted 결과 또는 출처를 확인할 수 없는 branch tip이 없다.
- 13 실행 방식이 dedicated `wt/matcap`인지 12와 결합한 `wt/lookdev-render`인지 하나로 확정되어 있다.
- 모든 contract request를 merge 전에 `accepted | rejected | deferred`로 예비 판정했다.
- rejected/deferred 요청 때문에 해당 extension acceptance가 불가능하면 14를 시작하지 않는다.

`baseline/full-v1`은 네 extension을 모두 포함하는 tag다. 하나라도 의도적으로 제외하면 14를 `COMPLETE`로
기록하거나 이 tag를 만들지 않고, 별도 범위와 별도 tag를 새 계획으로 정의한다.

## Branch and RESULT Gate Details

### Dedicated Branch Mode

```text
wt/uv-editor      -> 10 RESULT
wt/texture-paint  -> 11 RESULT
wt/lookdev-render -> 12 RESULT
wt/matcap         -> 13 RESULT
```

네 branch 모두 `baseline/optional-sdk-v1^{commit}`에서 분기했는지 `merge-base --is-ancestor`로 확인한다.

### 12 + 13 Combined Mode

```text
wt/lookdev-render -> 12 write/RESULT commit -> 13 write/RESULT commit -> one final branch tip
```

- 12 RESULT가 `COMPLETE` 또는 `READY_WITH_CONTRACT_REQUEST`로 commit된 뒤 13 write가 시작되었는지 history로
  확인한다.
- 12의 완료 commit이 combined branch tip의 ancestor여야 한다.
- 같은 `wt/lookdev-render` branch를 두 번 merge하지 않는다. 12/13 결과를 모두 승인한 뒤 한 번만 merge한다.
- dedicated `wt/matcap`과 combined 산출물이 동시에 있으면 어느 것을 채택할지 사용자가 확정하기 전까지
  merge하지 않는다.

## Recommended Merge Order

Preflight와 contract request 예비 판정이 끝난 뒤 주 에이전트가 main에서 순서대로 merge한다.

1. `wt/uv-editor`
2. `wt/texture-paint`
3. `wt/lookdev-render`
4. dedicated mode일 때만 `wt/matcap`
5. accepted Optional SDK contract reconciliation
6. optional entrypoint/composition 및 cross-extension adapter
7. exhaustive combination matrix와 Core-only regression
8. browser/WebGL2 smoke와 iPad/performance release gate
9. RESULT 갱신을 포함한 final integration commit
10. immutable annotated tag `baseline/full-v1`

merge는 provenance를 남기는 non-fast-forward merge를 기본으로 한다. 각 merge 직후 다음을 수행한다.

- conflict와 변경 파일이 해당 workstream Ownership/RESULT와 일치하는지 확인
- 해당 extension의 focused tests 및 가능한 typecheck 실행
- Core가 새 Optional concrete module을 import하지 않는지 정적 검사
- 기존에 merge된 Optional 조합의 lifecycle smoke 재실행

accepted contract reconciliation 전이라 compile할 수 없는 `READY_WITH_CONTRACT_REQUEST` 산출물은 그 사유와
영향 범위를 기록하고 reconciliation 직후 focused test를 반드시 다시 실행한다. conflict를 해결할 때 다른
workstream의 내부 구현을 섞거나 새 shadow contract를 만들지 않는다.

## Contract Reconciliation

14에서 다룰 수 있는 변경은 Optional SDK를 완결하는 additive 변경, 문서/소스 불일치 수정, 또는 Core-only
호환성을 유지하는 adapter/export 변경으로 제한한다.

### Decision Rules

- `accepted`: 10~13 중 하나 이상의 acceptance에 필요하고 canonical boundary로 일반화할 수 있으며
  Core-only build/runtime을 깨지 않는다.
- `rejected`: extension 내부 구현으로 해결할 수 있거나 concrete implementation 노출, shadow type,
  Optional-to-Core 역방향 의존을 요구한다.
- `deferred`: 현재 full release 범위에 필요하지 않고 별도 versioned SDK가 필요한 breaking change다.
- Core public semantics를 깨뜨리는 요청이 Full acceptance에 필수라면 우회하지 않고 `BLOCKED`로 종료한다.
- accepted 변경은 `INTERFACE_CONTRACTS.md`, `src/contracts/**`, public export와 contract tests를 같은
  reconciliation commit에서 동기화한다.

### Mandatory Boundary Closure

실제 baseline과 RESULT를 기준으로 아래 경계가 없다면 contract request를 승인·구현하거나 14를 `BLOCKED`로
종료한다. 이름이 다른 동등 API가 이미 있으면 중복 타입을 추가하지 않는다.

1. UV panel이 normalized pointer와 mesh/mutation/history/selection service를 concrete app import 없이 받는
   panel-local input/modeling service injection 경계
2. Texture Paint가 renderer triangulation과 동일한 retopo triangle을 `FaceId`, 세 `CornerId`, barycentric,
   world position 및 mesh version으로 식별하는 canonical raycast/hit 경계
3. image edit의 preview/commit/cancel, revision 또는 immutable-ref swap, synchronous undo/redo와 orphan cleanup을
   함께 만족하는 image edit 경계
4. Renderer가 `ImageAssetRef`를 같은 `ImageAssetService`로 resolve하고 GPU cache invalidation/context restore를
   수행할 수 있는 주입 경계
5. ordered provider 후보, failure snapshot과 이전 selection 복원을 함께 표현하는 candidate-list scoped lease
6. extension state schema version, contributed image refs와 unknown extension data를 보존하는 persistence 경계

`SurfaceHit`의 reference triangle ID를 retopo `FaceId`/`CornerId`로 형변환하지 않는다. 비동기 image 저장을
동기 `ReversibleChange`로 가장하거나 GPU handle을 extension에 노출하지 않는다.

### Conditional Reconciliation Ownership

accepted 요청에 한해 주 에이전트는 affected module의 public adapter/export와 focused tests를 14의 임시
소유로 지정할 수 있다. 시작 전에 정확한 파일 목록, 요청 ID와 이유를 선언하고 RESULT에 기록한다.
extension 내부 알고리즘 리팩터링이나 요청과 무관한 파일 변경은 허용하지 않는다.

## Optional Entrypoint and Extension Loader

### Entrypoint Isolation

- 기존 Core entrypoint는 유지하며 `src/extensions/**` 또는 optional manifest를 import하지 않는다.
- 별도 `src/optional/**` entrypoint/composition root만 10~13 module을 import한다.
- optional aggregate barrel은 Core barrel과 분리한다.
- build-time manifest는 선택된 extension만 정적으로 import한다. wildcard eager import로 모든 extension을
  Core bundle에 포함하지 않는다.
- extension 0개인 host와 Core-only production build는 09 동작과 동일해야 한다.

### Loader and Lifecycle

1. 하나의 app-owned `ExtensionHost`와 `ImageAssetService`를 만든다.
2. manifest 순서 `UV -> Texture Paint -> Lookdev -> MatCap`으로 extension instance를 만든다.
3. 각 extension에는 공용 registry를 직접 무제한 노출하지 않고 owner-scoped host/registry facade를 제공한다.
4. activation은 deterministic하게 직렬 수행한다. 한 extension activation이 실패하면 그 extension의 부분
   등록을 역순 정리하고 disabled reason을 기록한 뒤 Core와 독립 extension은 계속 시작한다.
5. 성공적으로 활성화된 instance만 loader stack에 넣는다.
6. shutdown, project close 또는 startup rollback에서는 성공 stack을 역순 dispose한다.
7. extension dispose 후 owner-scoped tool/provider/panel/image edit resource가 0개인지 검증한다.
8. 마지막 extension 정리 뒤 host를 dispose한다. 모든 dispose는 반복 호출에 안전해야 한다.

Async activation/edit completion은 dispose/cancel 이후 상태를 변경하지 못한다. extension ID와 등록 ID는
전역에서 고유해야 하며 duplicate는 해당 extension의 activation failure로 격리한다.

## Provider Active-Mode Coordination

Texture Preview, Realtime/Quality PBR, MatCap은 하나의 global active shading slot을 공유한다. activation
순서가 mode를 결정하지 않으며, extension activation만으로 현재 mode를 탈취하지 않는다.

Optional composition root는 owner-scoped registry facade와 canonical candidate-list
`ShadingSelectionLease`를 사용해 다음 정책을 적용한다.

- 빈 후보 또는 `active() === null`은 Core solid/wireframe mode다.
- 명시적인 최신 사용자 선택만 active provider를 바꾼다.
- Realtime은 `[realtime]`, Quality는 `[quality, realtime]`, Paint/MatCap은 각 `[providerId]` 후보 lease다.
- mode 선택 시 직전 selection lease를 보존하며 현재 lease가 해제/dispose될 때만 이전 selection을 복원한다.
- 현재가 아닌 오래된 extension의 dispose는 더 최근 사용자 선택을 덮어쓰지 않는다.
- 최상위 lease의 후보는 순서대로 missing/supports/compile/uniform/image 검증을 받고 failure snapshot을
  게시한다. 후보가 모두 실패하면 해당 lease를 유지한 채 Core로 fallback한다.
- lease dispose 뒤 복원된 이전 selection의 후보도 같은 검증을 다시 거친다.
- provider ID 충돌, stale lease와 repeated release는 side effect 없는 명시적 결과로 처리한다.

Fallback 우선순위는 다음과 같이 검증한다.

```text
Lookdev Quality unsupported/compile/runtime failure
-> Realtime PBR if registered and ready
-> Core solid/wireframe

Texture Preview or MatCap failure/dispose
-> failure 중에는 Core solid/wireframe
-> lease dispose 시 previous valid selection
```

failure snapshot을 polling, private renderer state 접근 또는 실패를 성공으로 간주하는 방식으로 우회하지
않는다.

## Texture/Image to GPU Path

Image 경로는 하나의 app-owned `ImageAssetService`와 renderer-owned GPU cache로 통일한다.

```text
import/edit source
-> ImageAssetService validation + CPU-side asset/revision
-> ImageAssetRef in ShadingProvider uniforms
-> renderer image resolver adapter
-> renderer-owned WebGL texture cache
-> draw
```

필수 규칙:

- Texture Paint/Lookdev/MatCap은 `ImageAssetRef`만 보관하고 WebGL texture/program handle을 소유하지 않는다.
- paint stroke의 live preview, commit, cancel은 versioned edit session 또는 immutable-ref swap으로 구분한다.
- stroke commit이 만든 `ReversibleChange.apply/revert`는 이미 준비된 before/after ref 또는 revision을
  동기적으로 전환하며 async decode/upload를 직접 수행하지 않는다.
- async prepare/import 실패 또는 cancel은 previous active ref를 유지하고 history entry/orphan asset을 남기지
  않는다.
- GPU cache key는 최소 asset ID와 content revision을 포함하고 stale revision을 재사용하지 않는다.
- Renderer만 `ImageAssetService.resolve` 결과를 upload하고 max texture size, aggregate GPU/image budget,
  color space와 decode 실패를 allocation 전에 검사한다.
- 같은 ref는 extension 종류와 무관하게 cache를 공유하되 reference count/eviction ownership을 Renderer가
  가진다.
- context loss에서는 GPU cache만 폐기하고 CPU/project asset은 유지한다. restore 후 현재 scene/provider의
  ref를 service에서 다시 resolve하여 lazy 재생성한다.
- provider/image failure는 해당 channel 또는 provider fallback으로 제한하고 Core frame을 중단하지 않는다.
- project close 시 edit session -> extension -> provider -> GPU cache -> image service의 소유 관계를 따라
  누수 없이 정리한다.

실제 API가 이 수명주기를 표현하지 못하면 Mandatory Boundary Closure에 따라 contract를 조정한 뒤 구현한다.

## Integration Ownership

14에 한해 다음 shared/cross-extension 경로를 조정할 수 있다.

```text
src/optional/**
src/optional-sdk/**
src/extensions/index.*
src/extensions/uv/index.*
src/extensions/texture-paint/index.*
src/extensions/lookdev/index.*
src/extensions/matcap/index.*
src/contracts/**
tests/contracts/**
src/renderer/extension-adapters/**
tests/renderer/extension-adapters/**
tests/optional/**
tests/optional-sdk/**
tests/integration/optional/**
tests/e2e/optional/**
tests/device/optional/**
scripts/verify-optional*
docs/validation/optional/**

package.json 및 선택된 lockfile
tsconfig*.json
vite.config.*
vitest.config.* 또는 선택된 test 설정
.github/workflows/**
docs/workplan/INTERFACE_CONTRACTS.md
docs/workplan/14_OPTIONAL_INTEGRATION.md (RESULT만)
```

`src/renderer/extension-adapters/**`는 canonical image/provider boundary를 기존 Renderer에 연결하는 최소
adapter만 허용한다. Renderer 내부 pass/shader/resource architecture를 다시 작성하지 않는다. 실제 저장소
구조가 다르면 merge 전 동등한 정확한 경로를 선언하며, Agent 소유 경로와 겹치지 않게 한다.

## Agent Allocation

주 에이전트는 merge와 최종 판정을 소유한다. merge/reconciliation revision을 확정하기 전에는 write agent를
시작하지 않는다. 아래 기본 경로는 서로 겹치지 않는다.

### Agent A — Contract / Public Export Reconciliation

소유 파일:

```text
src/contracts/**
tests/contracts/**
src/optional-sdk/**
tests/optional-sdk/**
src/extensions/index.*
src/extensions/uv/index.*
src/extensions/texture-paint/index.*
src/extensions/lookdev/index.*
src/extensions/matcap/index.*
docs/workplan/INTERFACE_CONTRACTS.md
```

책임:

- 10~13 contract request의 accepted/rejected/deferred 근거 정리
- accepted Optional SDK contract의 문서/소스/type test/export 동기화
- duplicate/shadow type 제거와 Core -> Optional 역방향 import 차단
- Optional aggregate export가 Core barrel에 섞이지 않는지 검증

### Agent B — Optional Composition / Lifecycle

소유 파일:

```text
src/optional/**
tests/optional/**
```

책임:

- optional-only entrypoint, manifest와 extension loader
- owner-scoped host/registry facade와 역순 activation rollback/dispose
- provider candidate-list lease와 이전 selection 복원
- shared image service/renderer bridge의 composition wiring
- 모든 extension 조합의 deterministic lifecycle unit tests

### Agent C — Integration / Device Validation

소유 파일:

```text
tests/integration/optional/**
tests/e2e/optional/**
tests/device/optional/**
scripts/verify-optional*
docs/validation/optional/**
```

책임:

- 16개 extension 조합 build/test matrix 자동화
- Core-only regression, full bundle e2e, failure/cancel/context-loss fixture
- real WebGL2 shader/image upload smoke와 GPU cache restore 검증
- iPad Safari/Apple Pencil 및 performance evidence 기록

### Main Agent Reserved

```text
package.json 및 선택된 lockfile
tsconfig*.json
vite.config.*
vitest.config.* 또는 선택된 test 설정
.github/workflows/**
src/renderer/extension-adapters/**
tests/renderer/extension-adapters/**
docs/workplan/14_OPTIONAL_INTEGRATION.md (RESULT만)
```

주 에이전트 책임:

- branch tip/ancestry/RESULT gate 판정과 merge order 실행
- accepted request의 conditional ownership 파일 목록 확정
- shared build entry와 renderer image/provider adapter의 최소 조정
- Agent A 결과로 contract를 재동결한 뒤 Agent B/C 시작 revision 공지
- 최종 acceptance, integration commit, `baseline/full-v1` tag와 최종 SHA 보고

실행 순서는 `preflight -> sequential merge -> Agent A reconciliation -> contract freeze -> Agent B/C 병렬 ->
final matrix/device validation -> RESULT/final commit/tag`다.

## Combination Build and Test Matrix

네 extension을 bit set으로 보고 **16개 모든 조합**을 자동화한다.

```text
0000 Core only
1000 UV
0100 Texture Paint
0010 Lookdev
0001 MatCap
... all remaining pairs/triples ...
1111 UV + Texture Paint + Lookdev + MatCap
```

각 조합에서 최소한 다음을 검증한다.

- production typecheck/build와 entrypoint import graph
- 선택되지 않은 extension의 module/bundle side effect 부재
- activation order, duplicate registration, partial failure와 reverse dispose
- tool/panel/provider registry leak 0
- provider mode 선택/해제/실패 시 previous-state restore
- project open/close와 repeated host dispose

추가 semantic 조합 테스트:

- Texture Paint only + imported/project `uv0`: paint enabled
- Texture Paint only + UV 없음: paint만 disabled, Core 정상
- UV + Texture Paint: UV 생성/편집 후 paint eligibility 갱신
- Lookdev + MatCap: 양방향 mode switch와 이전 mode 복원
- Texture Preview + Lookdev + MatCap: 세 provider의 latest-user-choice/lease 충돌
- Full bundle: save/reload, extensionData/image refs, context loss/restore와 shutdown

WebGL2가 없는 headless test는 contract fake에 한정하고, real browser smoke는 WebGL2 compile/link, image upload,
fallback과 context restore를 별도 실행한다.

## Core-Only Regression Gate

Optional 통합 전후 같은 canonical 명령과 09 vertical-slice fixture를 실행한다.

- Core entrypoint import graph에 `src/extensions/**`와 `src/optional/**`가 없음
- Optional directory를 build input에서 제외하거나 임시로 없는 것으로 취급해도 typecheck/test/build 성공
- provider 0개에서 Core solid/wireframe initialize/render/context restore 성공
- reference import -> retopo stroke -> mutation/history -> save/reload -> export vertical slice 동일
- Core bundle/startup/memory가 00/09 hard limit을 넘지 않음
- Optional activation failure가 Core input, renderer, project load/save를 중단하지 않음

Core-only regression 하나라도 실패하면 Full bundle이 동작하더라도 `COMPLETE` 또는 final tag를 허용하지 않는다.

## Full Optional End-to-End Slices

### UV / Paint Slice

```text
project with retopo mesh
-> UV extension activation and panel input normalization
-> uv0 projection/edit through MeshMutationService
-> one-action history undo/redo
-> renderer-consistent retopo triangle hit
-> pressure/coalesced paint stroke
-> image edit commit and one history entry
-> texture preview GPU upload
-> cancel/undo/redo
-> save/reload and image/extension data preservation
```

### Shading Mode Slice

```text
Core solid/wireframe
-> Realtime PBR
-> Quality PBR
-> MatCap
-> Texture Preview
-> dispose non-current provider: current unchanged
-> dispose current provider: previous valid mode restored
-> compile/runtime failure: declared fallback chain
-> all providers removed: Core solid/wireframe
```

### Resource Recovery Slice

```text
full bundle with image-backed providers
-> context loss
-> GPU handles/cache invalidated
-> CPU/project assets retained
-> renderer restore
-> lazy image resolve/re-upload
-> active mode and visual state restored or explicit fallback
-> no duplicate registration/resource leak
```

## iPad / Performance Release Gate

`baseline/full-v1`은 실제 기기 증거 없는 planning tag가 아니라 release baseline이다. 다음 항목은 00 ADR의
최소 지원 iPadOS/Safari와 대표 iPad/Apple Pencil에서 실제로 실행한다.

- Core-only와 Full bundle의 cold start, first usable frame와 orientation/resize
- Pencil down/move/coalesced/up/cancel, pressure/tilt, pointer capture/lost capture
- UV 2D navigation과 Pencil edit, Core viewport touch navigation의 간섭 없음
- 기준 texture 크기의 paint latency, dirty update와 cancel/undo/redo
- Core/Realtime/Quality/MatCap/Texture Preview mode switch와 fallback/previous restore
- context loss 또는 가능한 동등 복구 fixture, background/foreground와 memory pressure
- 00 ADR 기준 scene에서 frame CPU/GPU time, pointer latency, peak JS heap, GPU/image memory, startup time
- ADR에 정한 관찰 시간 동안 thermal 상태와 성능 저하율

판정 규칙:

- hard limit 초과, crash, blank frame, 입력 유실, 복구 불가 또는 resource leak은 release blocker다.
- target을 놓쳤지만 hard limit 이내인 항목도 수치와 원인을 기록하고 release owner의 명시적 waiver 없이는
  통과 처리하지 않는다.
- 기기나 측정 도구가 없어 실행하지 못한 항목은 `미검증`이며 통과가 아니다.
- 자동화와 desktop browser 결과는 실제 iPad/Pencil gate를 대체하지 않는다.
- blocker 또는 미검증 필수 항목이 있으면 final integration commit은 남길 수 있지만
  `baseline/full-v1` tag와 `Status: COMPLETE`는 만들지 않는다.

## Acceptance Gates

다음을 모두 충족해야 `COMPLETE`다.

- [ ] 09 baseline ref와 10~13 branch ancestry/tip/RESULT를 모두 검증했다.
- [ ] dedicated/combined 13 mode에 맞춰 각 branch를 정확히 한 번, 권장 순서로 main에 merge했다.
- [ ] 10~13 작업자는 main merge/tag/push를 하지 않았고 14만 통합을 수행했다.
- [ ] 모든 contract request에 accepted/rejected/deferred 결론과 호환성 근거가 있다.
- [ ] accepted contract가 문서/소스/export/tests에 동기화되고 contract가 재동결되었다.
- [ ] Mandatory Boundary Closure의 panel input, retopo triangle hit, image edit/resolver, candidate-list shading
      lease와 extension persistence 경계가 실제 API와 tests로 닫혔다.
- [ ] 별도 optional entrypoint/loader가 owner-scoped registration, partial rollback와 reverse dispose를 보장한다.
- [ ] provider active-mode 충돌, fallback과 이전 유효 mode 복원이 실제 registry/renderer 경로에서 통과한다.
- [ ] Texture Paint image edit부터 renderer GPU upload/cache invalidation/context restore까지 연결되었다.
- [ ] 16개 모든 extension 조합의 typecheck/build/lifecycle test가 통과한다.
- [ ] UV/Paint, shading mode, resource recovery e2e slice가 통과한다.
- [ ] Optional directory가 없는 Core-only build/test와 09 vertical slice가 회귀 없이 통과한다.
- [ ] canonical typecheck, test, build와 CI-equivalent가 clean checkout에서 통과한다.
- [ ] 실제 iPad Safari/Apple Pencil 및 ADR performance gate가 blocker/미검증 없이 통과했다.
- [ ] RESULT를 포함한 final integration commit에 annotated tag `baseline/full-v1`을 생성했다.
- [ ] `git rev-parse baseline/full-v1^{commit}`이 final commit으로 해석되며 SHA를 최종 응답에 보고했다.

## Failure and Stop Rules

- merge conflict가 RESULT/contract만으로 판정되지 않으면 해당 merge를 abort하고 사용자 결정을 요청한다.
- accepted contract 변경이 Core-only 호환성을 깨면 tag를 만들지 않고 `BLOCKED`로 기록한다.
- extension 하나의 runtime activation failure는 Core를 중단시키면 안 되지만, 해당 extension acceptance가
  충족되지 않았으므로 full release는 차단한다.
- hard-limit 실패나 필수 iPad 미검증은 Known limitation만으로 낮출 수 없다.
- 이미 공유된 `baseline/optional-sdk-v1` 또는 다른 immutable tag를 이동/덮어쓰지 않는다.
- `baseline/full-v1` 생성 후 수정이 필요하면 tag를 rewrite하지 않고 새 versioned baseline을 계획한다.

## Final Commit and Tag Rule

1. 모든 acceptance evidence를 수집한다.
2. `RESULT`를 먼저 갱신한다. final commit SHA를 RESULT 내부에 자기 참조로 기록하지 않는다.
3. 14 Ownership과 승인된 conditional 파일만 포함한 final integration commit을 `main`에 생성한다.
4. final commit에 annotated tag `baseline/full-v1`을 생성한다.
5. `git rev-parse baseline/full-v1^{commit}`과 `git rev-parse HEAD`가 같은지 검증한다.
6. branch, resolved SHA, build/test/device 결과를 최종 응답에 보고한다.
7. 루트 authority의 사전 승인에 따라 모든 acceptance/RESULT/tag gate가 통과한 경우 main과 tag를 함께
   non-force push한다. gate 미충족 시 push/tag를 수행하지 않는다.

## RESULT

Status: BLOCKED

### Baseline refs
- Core/Optional SDK input: `baseline/optional-sdk-v1`
- Input resolved SHA: `175ecff7613c15d5afd39327e957885c6eed4e50`
- Full output: `baseline/full-v1`
- Output resolved SHA: NOT CREATED — physical iPad Safari / Apple Pencil hard gate is not verified

### Integrated branch tips
| Workstream | Branch | Tip SHA | Result status | Merge commit |
|---|---|---|---|---|
| 10 UV Editor | `wt/uv-editor` | `6f0383f0bf013d9300e07db94e3a6c1e46777f48` | COMPLETE | `0c296a11f528fc6f501e741af38af078902e9895` |
| 11 Texture Paint | `wt/texture-paint` | `773dbde364eda6ee3284c67b9170e2fae2c72b65` | READY_WITH_CONTRACT_REQUEST | `4e487024c3df3b3c2795959c21758ed6a13e2792` |
| 12 Lookdev | `wt/lookdev-render` | `e6dbde37f1992c12051b661286a04714f10bf9eb` | COMPLETE | `c2c71ead713334453a084c61ffbf7cdc9537510e` |
| 13 MatCap | dedicated `wt/matcap` | `b5822ac9ae610092ec6f894ecc50a520319ce3e7` | COMPLETE | `b8bd0eae35413c86c227a2a03f311b5f676ff5fe` |

### RESULT / ancestry gate evidence
- Starting `main`, `HEAD`, and `origin/main` matched `cf71caff179df331b277e8088e1cdc5cb3fa835d` with a clean worktree before integration.
- Local and origin tips matched for all four input branches; each input tip descended from the resolved Optional SDK baseline.
- All 10–13 RESULT gates were read before merge. Workstream 11's sole contract request was preliminarily accepted before merge.
- Lookdev and MatCap shared exactly the baseline merge-base, confirming the dedicated MatCap mode rather than a combined branch.

### Merge order and conflicts
- Merged with `--no-ff` in the required order: UV Editor, Texture Paint, Lookdev, then dedicated MatCap.
- No merge conflicts occurred. Focused extension tests, typecheck, and Core import scans passed between merges.

### Contract changes accepted
- Accepted workstream 11's Core-only compatible semantic hardening without a signature change: `ImageAssetService.prepareEdit(ref)` now revalidates the full `ImageAssetRef` after all asynchronous load/reservation work and immediately before acquiring the edit lock.
- A stale request rejects without changing current image state, lock state, emitted events, or revision allocation. Reconciliation commit: `572d757f9362fcda795fd99c5e3a6e5f6aa93760`.

### Contract changes rejected
- NONE

### Contract changes deferred
- NONE

### Conditional ownership used
- `src/project/image-assets.ts`, `tests/project/assets.test.ts`, and `docs/workplan/INTERFACE_CONTRACTS.md` for the accepted workstream 11 semantic hardening.
- `scripts/verify-core.mjs` for the workstream 12 integration note requiring Core-only validation to exclude Optional source and test roots.

### Optional entrypoint / loader / lifecycle
- `src/optional/index.ts` is loader-only and imports no concrete extension. Static per-feature manifest boundaries and `src/optional/full.ts` provide explicit composition choices.
- The loader canonicalizes UV → Texture Paint → Lookdev → MatCap, activates serially through one `ExtensionRuntime`, scopes host resources by owner, rolls back partial failures, and performs reverse disposal before shared-host shutdown.
- Duplicate activation/registration, cancellation, repeated disposal, state visibility, image-edit cancellation, and resource-leak paths are covered.

### Provider mode / fallback / restore
- Activation-phase shading leases remain dormant. Post-activation candidates and explicit selection promote the canonical current lease.
- Latest user choice wins across Texture Preview, Lookdev, and MatCap; non-current release is inert and top-lease release restores the previous available mode.
- Missing candidates, compile failure, MatCap image failure, and Core fallback/restore paths pass deterministic and desktop WebGL2 verification.

### Texture / image / GPU path
- Full-reference stale edit rejection, revision invalidation, dirty re-upload, image-event deduplication/flush, and failed edit cleanup pass.
- Desktop WebGL2 verified revision 1 → 2 re-upload and GPU cache invalidation, context restoration, and resource re-resolution.

### Files created or modified
- Merged owned extension implementations/tests under `src/extensions/**` and `tests/extensions/**` from workstreams 10–13.
- Added `src/optional/**`, `tests/optional/**`, `tests/integration/optional/**`, `tests/e2e/optional/**`, and `tests/device/optional/**`.
- Added `scripts/verify-optional.mjs` and `docs/validation/optional/**`; reconciled `scripts/verify-core.mjs`, `package.json`, the image asset service/test, and frozen contract prose within 14's conditional ownership.
- Parallel sidecar paths `docs/workplan/OCTOPOLY_TASK_TIMELINE.md`, `docs/workplan/assets/**`, `docs/OCTOPOLY_IPAD_COMMERCIAL_VIABILITY.md`, `docs/OCTOPOLY_FOLLOW_UP_FEATURE_ANALYSIS.md`, and `docs/OCTOPOLY_DESKTOP_MOUSE_INPUT_ANALYSIS.md` were not owned or staged by this workstream.

### Public API / exports
- `defineOptionalManifest`, `OPTIONAL_FEATURE_ORDER`, `createOptionalComposition`, and `OptionalComposition` lifecycle/query APIs.
- Static UV, Texture Paint, Lookdev, and MatCap manifests plus `FULL_OPTIONAL_MANIFEST` and `createFullOptionalComposition`.
- No concrete Optional extension is imported by Core or the loader-only entrypoint.

### Combination build / test matrix
- All 16 independent feature subsets typechecked and produced Vite bundles; each artifact contained selected concrete markers and excluded unselected concrete modules.
- Canonical activation order, Paint-only fallback, UV/Paint cooperation, all-full activation, isolation, rollback, reverse shutdown, repeated disposal, and zero owner leaks passed.

### Core-only regression
- `npm run verify:core`: PASS with `src/extensions` and `src/optional` excluded.
- `npm run verify:optional`: PASS for an isolated repository copy with both Optional source roots physically absent; isolated typecheck, Core tests including the 09 vertical slice, production build, and artifact hard limits passed.
- `npm run ci`: PASS, 132 files / 647 tests, typecheck, production build, and artifact limits (226,055 bytes total; 61,189 compressed JS/CSS; 221,412 parsed JS).

### Full Optional e2e
- Automated Optional validation passed, including 4 Agent B files / 12 lifecycle tests and 5 Agent C files / 26 semantic, e2e, and device-boundary tests.
- Actual desktop WebGL2 smoke passed on candidate commit `485008a061a8f1781ec14ccd68c0fc7b34b961b8` using in-app Chromium 151 on Windows. All four render providers compiled/linked and no warning/error console messages were observed.

### iPad / performance evidence
- Desktop WebGL2: PASS; WebGL2 context created with `MAX_TEXTURE_SIZE=16384`, provider compile/link, image revision upload, candidate fallback/restore, and context loss/restore passed.
- Automated iPad boundary checks: PASS, but they are not substituted for physical evidence.
- Physical iPad Safari and Apple Pencil pressure/tilt/coalesced-sample, touch/Pencil separation, long-session memory, GPU, and thermal checks: NOT RUN because no physical device evidence is available.
- `npm run verify:optional:physical` therefore fails closed by design and blocks release/tagging.

### Integration notes
- Candidate code/harness integration commit: `485008a061a8f1781ec14ccd68c0fc7b34b961b8`.
- RESULT/evidence commit: `e54edeed9094d71679b4b081729a34354e820e4a`.
- Workstream 15 was not performed. Pages release/operations remains outside this task.

### Remaining release issues
- Run and record the prescribed physical iPad Safari / Apple Pencil matrix, including performance, memory, GPU recovery, and thermal hard limits, against the final integration commit.
- Until that evidence passes, Status remains BLOCKED and `baseline/full-v1` must not exist.

### Final disposition
- Final integration commit created: YES — candidate implementation/harness commit above; the RESULT/evidence record is commit `e54edeed9094d71679b4b081729a34354e820e4a`.
- `baseline/full-v1` created: NO — required physical hard gate is unverified.
- Push performed: YES — `origin/main` resolved to `e54edeed9094d71679b4b081729a34354e820e4a` after non-force push.
