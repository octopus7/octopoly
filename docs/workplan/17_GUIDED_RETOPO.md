# 17 Guided Retopo

## Required

CONDITIONAL — 기존 Pro retopology 편집기와 Core-only 실행에는 필수가 아니지만, 초보 사용자가 첫 자산을
완성하는 Guided 제품 흐름을 제공하려면 필수다.

이 workstream을 생략해도 기존 Pro mode의 mesh 편집, history, selection, Tool Runtime, Retopo Engine 및
Core/Optional entrypoint는 이전과 동일하게 동작해야 한다. 반대로 Guided Retopo를 제품 기능으로 표시하려면
이 문서의 실제 first-asset E2E, 접근성 입력 경로, 오프라인·복구 및 sample provenance gate를 모두 통과해야
한다.

## Policy Compatibility Gate

루트 `AGENTS.md`와 `docs/workplan/00_MASTER.md`는 현재 00~15의 원래 제품 조립 순서를 정의한다. 17은 그
baseline을 깨지 않는 **post-baseline additive workstream**으로만 실행한다.

- beginner Guided Retopo와 Pro mode를 별도 제품, 별도 mesh 문서 또는 별도 편집 코어로 복제하지 않는다.
- 두 모드는 같은 canonical `MeshQuery`/`MeshMutationService`, `HistoryService`, `SelectionService`, `ToolRegistry`,
  `RetopoEngine`과 renderer preview 경계를 사용한다.
- Guided layer는 목적 설명, 단계 상태, hint, preview와 접근 가능한 UI를 추가하는 progressive disclosure다.
- Pro mode는 lesson package나 sample content가 없어도 기존 동작과 import graph를 유지해야 한다.
- `src/guided/**`는 canonical contract를 소비할 수 있지만 concrete Mesh/History/Tool/Retopo 내부 구현을 직접
  import하지 않는다. 실제 서비스 연결은 app composition adapter가 소유한다.
- 10~13 Optional extension은 Guided Retopo의 필수 dependency가 아니다. UV/Paint/Lookdev/MatCap 유무가 lesson
  engine의 start, pause, resume 또는 completion semantics를 바꾸면 안 된다.
- frozen contract가 부족하면 shadow type이나 concrete import로 우회하지 않고 `Requested contract changes`에
  기록한다. 별도 승인 없는 breaking contract 변경은 수행하지 않는다.
- 17의 Integration Ownership은 해당 worktree 안에서 first-asset vertical slice를 조립할 권한일 뿐 main merge,
  release, deploy 또는 tag 권한이 아니다.

## Execution

### Standard mode

```text
Mode: WORKTREE
Branch: wt/guided-retopo
Worktree: ../wt-guided-retopo
Order: AFTER 25 PRACTICAL TOOL INTEGRATION IS PUSHED
Minimum product input: exact PRODUCT_INPUT_BASE_SHA published by 19 Phase A
Branch point: exact `PRACTICAL_TOOL_BASE_SHA` recorded and pushed by 25
Output: reviewed early-core commits + one final Standard/RESULT commit + same-name origin branch push
Tag: NONE
Main merge/deploy: OUT OF SCOPE
```

`origin/main` 같은 mutable ref를 결과에 그대로 적지 않는다. 시작 시 25 RESULT의 exact
`PRACTICAL_TOOL_BASE_SHA`, 19의 `PRODUCT_INPUT_BASE_SHA`, 16/18과 20~24 입력 commit SHA를 RESULT에 기록하고
ancestry를 확인한다.

### Early parallel core mode

구현 계획 commit이 push된 뒤 아래 실행 정보로 순수 범위를 병렬화할 수 있다.

```text
Mode: WORKTREE — EARLY CORE ONLY
Branch: wt/guided-retopo-core
Worktree: ../wt-guided-retopo-core
Branch point: exact immutable POST_PLAN_BASE_SHA
Output: reviewed pure checkpoint commits + IN_PROGRESS RESULT + same-name origin branch push
Main merge/tag/deploy: PROHIBITED
```

허용 경로:

```text
src/guided/core/**
src/guided/content/**
src/guided/analysis/**
src/guided/preview/**
src/guided/ui/**
src/guided/accessibility/**
tests/guided/core/**
tests/guided/content/**
tests/guided/analysis/**
tests/guided/preview/**
tests/guided/ui/**
tests/guided/accessibility/**
tests/guided/fixtures/**
```

이 mode에서는 lesson schema/parser, 상태기계, topology diagnostic, flow/density preview, sample manifest validator,
local UI/accessibility shell과 contract fake 기반 deterministic tests만 구현한다. 다음 경로와 작업은 시작하지
않는다.

```text
src/app/**
src/project/**
public/samples/guided/**
tests/integration/guided/**
tests/e2e/guided/**
tests/device/guided/**
scripts/verify-guided*
16이 소유한 empty state / Add Plane / sample launcher 경로
```

Early parallel core는 16/18 또는 20~24의 concrete API를 추측하거나 복사하지 않으며 `COMPLETE`가 될 수 없다.
25가 20~24를 통합하면 exact `PRACTICAL_TOOL_BASE_SHA`에서 표준 `wt/guided-retopo`를 새로 만들고, 준비 branch의
**순수 소유 범위 commit만 검토 후 cherry-pick**한다. 다른 worktree를 merge하지 않고 app wiring, persistence,
sample asset, integration/E2E/device 작업은 새 표준 branch에서 수행한다.

## Required Inputs

구현 대화는 다음을 순서대로 끝까지 읽는다.

1. `/AGENTS.md`
2. `docs/workplan/00_MASTER.md`
3. `docs/workplan/00_BOOTSTRAP.md`와 현재 승인된 product baseline SHA
4. `docs/workplan/INTERFACE_CONTRACTS.md` 및 실제 `src/contracts/**`
5. `docs/workplan/06_TOOL_RUNTIME.md`
6. `docs/workplan/08_RETOPO_ENGINE.md`
7. `docs/workplan/09_INTEGRATION.md`
8. `docs/workplan/14_OPTIONAL_INTEGRATION.md`
9. `docs/OCTOPOLY_IPAD_COMMERCIAL_VIABILITY.md`
10. `docs/OCTOPOLY_FOLLOW_UP_FEATURE_ANALYSIS.md`
11. `docs/workplan/16_BASIC_PRIMITIVES.md`와 그 RESULT
12. `docs/workplan/18_DESKTOP_MOUSE_CAMERA.md`와 그 RESULT
13. `docs/workplan/20_TOPOLOGY_ACTIONS.md`부터 `24_RETOPO_VISIBILITY.md`까지와 각 RESULT
14. `docs/workplan/25_PRACTICAL_TOOL_INTEGRATION.md`와 그 RESULT

구현 시작 시 25가 게시한 exact `PRACTICAL_TOOL_BASE_SHA`, 16/18과 20~24 final SHA, Add Plane/Cube, camera,
topology actions, transform/refinement/symmetry, project/recovery, import/visibility의 실제 API와 ownership을
preflight 표에 고정한다.

## Goal

초보 사용자가 edge loop, pole, manifold 같은 전문 용어를 먼저 외우지 않아도 작은 실제 자산의 retopology를
시작하고 완료하도록 목적 중심 lesson과 비파괴 guidance를 제공한다.

```text
Start from approved sample or 16 Add Plane/sample flow
-> choose a purpose-based lesson
-> understand the deformation/shape goal
-> preview a possible flow without committing it
-> create/edit through the existing Tool/Retopo path
-> receive non-blocking density/flow/topology explanations
-> undo/redo safely
-> skip, pause, resume, or restart without hidden mesh edits
-> complete the first asset
-> save/reload/export through the existing project path
-> continue in Pro mode with the same mesh/history/selection
```

초기 lesson content는 최소한 다음 목적을 설명할 수 있는 schema와 검증 규칙을 갖춘다.

- 눈 주위를 감싸 표정 변형을 지지하는 loop
- 입 주위를 감싸 개폐·표정 변형을 지지하는 loop
- 팔꿈치·무릎 같은 관절 굽힘을 지지하는 loop

MVP 제품 E2E는 위 목적 중 승인된 한 개의 first-asset lesson을 처음부터 저장·재개·export까지 완주해야 한다.
나머지 목적은 동일 엔진에서 동작하는 검증된 lesson fixture 또는 ship-ready lesson으로 제공하되, 내용 수를
늘리기 위해 검증되지 않은 sample을 포함하지 않는다.

## Non-Goals

- 자동 retopology 또는 사용자의 전체 mesh를 대신 생성하는 시스템
- Guided 전용 mesh kernel, history stack, selection model, Tool Runtime 또는 Retopo Engine 복제
- 정답 topology의 vertex/edge 수, 위치 또는 pole 배치를 하나로 강제
- 사용자의 mesh를 몰래 수정하거나 lesson 진도를 이유로 history를 임의 rewind
- hint를 따르지 않았다는 이유로 일반 편집, save, export 또는 Pro mode 전환을 막기
- 새로운 sculpting, rigging, animation 평가 또는 deformation simulator 구현
- 계정, cloud sync, leaderboard, 광고, 분석 SDK 또는 기본 활성 telemetry
- lesson marketplace, 원격 content delivery, Pages Functions/Workers/API
- 16의 primitive 생성, sample launcher 또는 project lifecycle 내부 구현 재작성
- 18 또는 별도 mouse camera workstream의 navigation 구현 선행
- raster artwork가 필요하지 않은 diagram/UI를 ImageGen으로 생성

## Start Gates

### Common gates

다음을 모두 확인하기 전에는 write를 시작하지 않는다.

- 선택한 baseline SHA가 존재하고 현재 worktree branch point와 정확히 일치한다.
- 06 Tool Runtime과 08 Retopo Engine RESULT가 `COMPLETE`이며 현재 baseline ancestry에 포함된다.
- 09의 Core vertical slice가 현재 baseline에서 통과하거나, 이후 변경으로 대체된 동등 regression evidence가
  존재한다.
- 14 산출물을 baseline에 포함한다면 그 RESULT의 `BLOCKED` 원인과 Full Optional tag 부재를 release-ready로
  오해하지 않는다. Guided 구현은 14의 physical iPad blocker를 해소했다고 주장하지 않는다.
- canonical mesh/history/selection/tool/retopo/preview/project 경계를 실제 source와 대조했다.
- Agent A/B/C와 주 에이전트의 파일 소유 범위를 시작 전에 exact path로 선언했다.
- Pro mode regression, Core-only build와 실제 first-asset E2E 실행 경로를 정의했다.

### Standard-mode gates

- `docs/workplan/25_PRACTICAL_TOOL_INTEGRATION.md` technical status가 `COMPLETE`이고 exact
  `PRACTICAL_TOOL_BASE_SHA`가 push되었다. 별도 external/device evidence의 `NOT_RUN`은 PASS로 간주하지 않는다.
- `PRACTICAL_TOOL_BASE_SHA`가 19 Phase A의 `PRODUCT_INPUT_BASE_SHA`와 16/18, 20~24 accepted commits를 모두
  ancestor로 가진다.
- 16과 18 및 20~24 RESULT status/provenance가 25에서 명시적으로 수용되었다.
- Guided가 소비하는 Add Plane, camera, topology action, transform/refinement/symmetry, project/recovery,
  import/visibility API와 소유 경계가 확정되어 있다.
- 16의 integration note와 contract request를 `accepted | rejected | deferred`로 판정했다.
- 16이 sample을 제공하지 않거나 license/provenance가 부족하면 17이 자체 승인 sample을 소유한다는 결정을
  먼저 기록한다.

### Early-parallel gates

- 준비 branch가 exact `POST_PLAN_BASE_SHA`에서 시작했다.
- Agent A/B/C가 early-mode 허용 경로 밖의 app/composition/project/persistence/sample/E2E/device 경로를 수정하지 않는다.
- fake `MeshQuery`, `HistoryService`, `SelectionService`, `RetopoEngine`과 serialized lesson fixtures만 사용한다.
- 조기 산출물의 공개 타입은 `src/guided/**` 내부 API이며 canonical cross-module contract로 가장하지 않는다.

## 16 Dependency and Separation

16은 사용자에게 다음과 같은 **시작 입력**을 제공한다.

```text
empty state
-> Add Plane or Add Cube
-> automatic selection/framing
-> project save/reload
```

17은 이 흐름을 재사용할 수 있지만 guided engine의 core를 sample/lesson data 또는 16 concrete implementation과
결합하지 않는다.

```text
16 start source adapter ──┐
approved lesson sample ───┼─> app composition ─> GuidedSession
existing user project ────┘

GuidedSession
  ├─ consumes immutable lesson definition
  ├─ observes canonical MeshQuery/Selection/History state
  ├─ requests preview through existing ToolPreview boundary
  └─ never owns a second mesh or history stack
```

- engine tests는 sample filename, asset URL 또는 Add Plane implementation을 알지 않는다.
- lesson data는 versioned declarative records로 엔진 코드와 분리한다.
- sample geometry는 lesson pack manifest가 참조하며 engine package에 hard-code하지 않는다.
- 16 launcher가 바뀌어도 app-owned adapter만 바꾸고 lesson parser/analyzer/state machine은 유지한다.
- 16 없이 시작한 기존 project도 mesh/reference 조건을 만족하면 lesson을 시작할 수 있다.
- 16 sample이 lesson 요구조건과 맞지 않으면 명시적 `incompatible-start-source` 결과를 반환하고 mesh를 바꾸지
  않는다.
- 현재 16 계획은 lesson용 reference sample의 제공을 acceptance로 요구하지 않는다. 16 RESULT에 승인된 sample이
  실제로 추가되지 않았다면 17이 provenance/license를 갖춘 자체 lesson sample을 소유하며, Add Plane/Cube와
  lesson sample을 같은 데이터로 가장하지 않는다.

## One Core, Progressive Disclosure

Guided와 Pro는 mode가 아니라 제품을 둘로 나누는 경계가 아니다. 동일 workspace 위에서 노출 수준만 다르게
한다.

| 영역 | Guided Retopo | Pro mode | 공통 invariant |
|---|---|---|---|
| Mesh | 목적과 현재 단계에 필요한 요소를 강조 | 전체 편집 제어 노출 | 같은 `MeshDocument`와 stable ID |
| History | 단계별 의미 있는 label과 Undo 설명 | 기존 undo/redo UI | 같은 `HistoryService` stack |
| Tool | 추천 tool과 preview를 먼저 제시 | 모든 tool/shortcut 즉시 노출 | 같은 `ToolRegistry`와 capture/cancel |
| Selection | 현재 목적 관련 component를 설명 | 세부 vertex/edge/face 선택 노출 | 같은 `SelectionService` snapshot |
| Retopo | 목적 언어와 flow preview | 직접 stroke/quad 편집 | 같은 `RetopoEngine` session |
| UI | glossary, hint, step controls | compact controls | mode 전환 시 document 보존 |

mode 전환은 mesh, selection, history 또는 project를 복사하거나 reset하지 않는다. 진행 중 preview/gesture가
있으면 canonical cancel 경로를 거친 뒤 UI mode만 바꾼다. Pro mode에서 편집한 결과를 Guided로 돌아왔을 때
다시 분석하며, lesson의 과거 정답 snapshot으로 덮어쓰지 않는다.

## Guided Core Model

### Lesson definition

lesson data는 최소한 다음 의미를 표현하는 versioned immutable record다. 실제 타입명은 구현 전에
`src/guided/**` 내부에서 동결한다.

- `lessonId`, `schemaVersion`, locale-neutral content key
- 목적과 사용자에게 보이는 쉬운 설명
- 필요한 start-source capability와 sample manifest ID
- ordered step IDs와 optional/required 여부
- 각 step의 observable goal constraints와 허용 범위
- flow preview seed 또는 region annotation
- density target band와 과밀/희박 설명
- pole/non-manifold glossary key와 관련 hint
- skip 가능 여부, resume checkpoint policy와 completion rule
- sample provenance/license manifest reference

lesson 문구와 평가 규칙을 코드 분기로 섞지 않는다. locale text가 달라도 같은 fixture는 같은 topology
diagnostic과 completion 결과를 만든다.

### Session state

Guided session은 최소 다음 상태를 명시적으로 구분한다.

```text
idle
-> active(step)
-> paused
-> active(step)
-> completed

active/paused
-> abandoned

active/paused/completed/abandoned
-> restart-confirmed -> active(first step)
```

- `skip`은 허용된 step의 진도만 이동하고 mesh/history를 바꾸지 않는다.
- `pause`/`resume`은 progress state만 저장·복원하고 tool gesture를 이어 붙이지 않는다. pause 시 active gesture와
  preview는 cancel한다.
- `abandon`은 lesson UI/session만 닫고 현재 project와 history를 보존한다.
- `restart` 기본 동작은 lesson progress만 초기화한다. mesh reset이 필요한 경우 현재 project를 보존한 채 새
  sample project를 만들거나, 명시적 확인 뒤 canonical mutation/history 경로를 사용한다.
- crash/background recovery는 마지막 durable progress와 현재 project를 함께 다시 열되, 완료되지 않은 gesture나
  preview를 복원하지 않는다.
- lesson version이 바뀌어 step ID를 찾을 수 없으면 mesh를 건드리지 않고 안전한 migration/fallback 선택지를
  제공한다.

### Undo-safe progression

- 모든 mesh 변경은 기존 tool 또는 `MeshMutationService`가 만든 reversible patch를 기존
  `HistoryTransaction`에 기록한다.
- Guided engine은 mesh mutation을 관찰하기 전에 성공했다고 가정하지 않는다.
- step completion은 committed mesh/history state에서 계산한다. preview나 열린 transaction은 완료 근거가 아니다.
- Undo로 completion 조건이 사라지면 해당 step은 재평가 상태로 돌아가지만, redo stack을 변경하거나 자동으로
  다시 적용하지 않는다.
- lesson progress 저장 실패가 이미 commit된 mesh/history를 rollback하거나 project save를 손상시키면 안 된다.
- 하나의 사용자 action은 lesson 단계 수와 무관하게 기존 history grouping 규칙을 유지한다.

## Purpose-Based Guidance

전문 용어보다 결과 목적을 먼저 제시하고, 필요할 때 glossary로 정확한 용어를 연결한다.

| 목적 중심 설명 | 뒤에서 노출할 개념 | 예시 hint |
|---|---|---|
| 눈 주위를 끊기지 않게 감싸 표정을 따라가게 하기 | closed edge loop, pole | “눈을 한 바퀴 감싸는 흐름이 아직 열려 있습니다.” |
| 입이 열리고 오므라들 때 형태를 유지하게 하기 | concentric loops, density | “입꼬리 쪽 간격이 중앙보다 급격히 좁습니다.” |
| 관절이 접힐 때 납작해지지 않게 여유 줄 만들기 | deformation loops, pole placement | “굽힘 축 양옆에 지지 loop를 둘 수 있습니다.” |
| 면이 한쪽에만 붙거나 여러 갈래로 찢어지지 않게 하기 | manifold/non-manifold | “이 edge는 세 face가 공유해 다음 편집이 불안정합니다.” |

glossary는 짧은 정의, 왜 중요한지, 현재 mesh에서의 예와 “더 알아보기”를 제공한다. lesson 완료를 위해 긴
문서를 먼저 읽도록 강제하지 않는다.

## Flow Preview, Density Guide, and Topology Diagnostics

### Flow preview

- preview는 기존 `ToolPreview`/overlay 경계를 사용하며 mesh mutation이 아니다.
- 가능한 흐름 중 하나를 제안하는 시각화이며 “정답”이라고 표시하지 않는다.
- 현재 mesh version, selection/region과 lesson step을 입력으로 결정적으로 재계산한다.
- stale mesh version 또는 cancel/dispose 뒤 preview를 commit 후보로 재사용하지 않는다.
- preview를 수락하는 action이 추후 추가되더라도 명시적 사용자 실행, 변경 요약, canonical history entry와
  Undo를 요구한다.

### Density guide

- 절대 edge 수 하나를 강제하지 않고 lesson의 목적과 local scale에 대한 허용 band를 사용한다.
- 과밀/희박은 색뿐 아니라 pattern, icon, text와 해당 영역 이름으로 전달한다.
- density 차이가 존재해도 유효한 의도라면 dismiss/skip할 수 있다.
- hidden sample answer mesh와 좌표가 다르다는 이유만으로 실패 처리하지 않는다.

### Pole and non-manifold explanation

- pole은 valence와 주변 flow를 설명하되 특정 위치 하나를 정답으로 강제하지 않는다.
- deformation corridor 안의 pole은 경고할 수 있지만 대안과 이유를 함께 제시한다.
- non-manifold, degenerate 또는 contract invariant 위반은 정확한 요소와 영향을 설명한다.
- diagnostic ordering은 stable ID 기준으로 결정적이어야 하며 같은 snapshot에서 메시지 순서가 바뀌지 않는다.

## Blocking Boundary and No Hidden Auto-Fix

Guidance 결과는 다음 세 수준을 명확히 구분한다. 실제 내부 이름은 구현 시 소유 package 안에서 정한다.

1. `info`: 개념 설명, 대안 flow 또는 glossary. 편집과 진도를 막지 않는다.
2. `warning`: density, pole 위치, 열린 loop처럼 개선 가능한 상태. dismiss/skip 가능하며 save/export를 막지 않는다.
3. `completion-blocker`: non-manifold, degenerate topology 또는 해당 step의 최소 목적이 전혀 성립하지 않는 상태.
   **lesson step 완료 표시만** 막으며 일반 편집, Undo, save, export와 Pro mode 전환은 막지 않는다.

MVP에는 자동 수정 기능을 포함하지 않는다. 향후 명시적 `Fix` action을 추가하려면 다음을 모두 만족하는 별도
승인 범위가 필요하다.

- 수정 대상 stable ID와 예상 변경을 먼저 preview한다.
- 사용자가 명시적으로 확인하기 전에는 mesh/history/selection을 바꾸지 않는다.
- canonical `MeshCommand`와 `HistoryTransaction`을 사용해 action 하나/entry 하나로 만든다.
- cancel 또는 validation 실패 시 mesh/history/progress가 모두 이전 상태다.
- 여러 유효 topology 대안을 하나로 축소하지 않으며 “다른 방식으로 계속”을 제공한다.
- 사용자의 mesh를 백그라운드에서 정리, weld, dissolve, rotate 또는 replace하지 않는다.

lesson engine이 몰래 mesh를 수정해야만 acceptance를 만족할 수 있다면 구현을 중단하고 설계를 다시 승인받는다.

## Sample Asset Provenance and License

모든 shipped sample은 네트워크 없이 사용할 수 있어야 하며 manifest에 다음을 기록한다.

- stable sample ID와 content hash
- 원본 제작자/기관과 원본 URL 또는 `OctoPoly original`
- license identifier, license 원문 또는 저장소 내 license 경로
- redistribution, modification, commercial use와 attribution 조건
- OctoPoly가 수정했다면 수정 내용과 날짜
- reference geometry, starter mesh, expected diagnostic fixture의 역할 구분

출처, 재배포 권리 또는 상업적 사용 권리가 불명확한 asset은 test fixture로도 외부 배포하지 않는다. 정답
topology를 sample에 숨겨 사용자 결과를 좌표 일치로 채점하지 않는다. expected fixture는 알고리즘 회귀 검증에만
사용하고 제품 completion은 목적 기반 constraints로 판정한다.

절차적 sample geometry가 목적에 충분하면 code-native 생성을 우선하며 manifest에 `OctoPoly original`로
기록한다. 외부 sample을 포함하면 repository에 필요한 attribution/license 파일을 함께 둔다.

## Accessibility and Input Completion Matrix

### General rules

- 성공/경고/차단을 색만으로 전달하지 않는다. label, icon, line style/pattern, text와 접근성 상태를 함께 쓴다.
- UI text와 overlay는 충분한 contrast를 가지며 focus indicator를 제거하지 않는다.
- hover, pressure, tilt, multi-touch chord 중 하나만으로 필수 정보를 제공하지 않는다.
- 모든 step control은 semantic button/heading/progress 구조와 예측 가능한 focus order를 가진다.
- status 변화는 화면 reader가 반복 소음 없이 이해할 수 있는 live-region 정책을 사용한다.
- reduced motion에서 animated flow를 static arrow/numbered segments로 대체한다.
- glossary는 초보 용어와 전문 용어를 연결하고 약어만 단독 사용하지 않는다.
- input 종류를 최초 event 하나로 영구 고정하지 않으며 중간에 장치를 바꿔도 같은 session을 계속할 수 있다.

### Required basic-lesson paths

| 입력 경로 | 필수 완료 방식 |
|---|---|
| Pencil | pressure/tilt가 없어도 direct stroke, select, preview accept/cancel과 모든 step control 사용 가능 |
| Touch | 명시적인 Touch Modeling mode 또는 동등한 충돌 없는 경로로 modeling과 navigation을 구분하고 완주 가능 |
| Mouse | primary-button modeling과 별도 camera navigation을 구분하고 hover 없이 완주 가능 |
| Keyboard | focusable viewport/step controls, 선택·anchor 이동·preview confirm/cancel·Undo/Redo·skip/resume를 통해 pointer-only gesture 없이 완주 가능 |

Pencil/touch/mouse/keyboard 경로는 같은 lesson goal을 사용하되 동일한 gesture를 강요하지 않는다.
Standard 구현 write 전에 25의 실제 tool/action/accessibility adapter만으로 각 입력의 완주가 가능한지 preflight한다.
불가능한 경로는 Guided 내부에서 mesh/tool/camera를 복제하지 않고 exact missing capability와 소유 파일을 blocker로
기록해 별도 입력 접근성 변경 승인을 받는다. mouse navigation은 18 산출물만 소비하며 중복 구현하지 않는다.

touch-only 경로는 기존 touch navigation을 우발적으로 modeling으로 바꾸지 않는다. visible mode, pointer owner,
cancel/lost-capture cleanup과 exit affordance가 있어야 한다. keyboard path는 자동 정답 적용이 아니라 사용자가
focus 가능한 control point/selection과 명시적 command를 조정·확정하는 경로여야 한다.

## Data, Offline, and Privacy

- 첫 구현은 완전 offline이다. lesson engine, glossary, sample과 progress에 계정이나 network가 필요하지 않다.
- 기본 동작에서 analytics/telemetry SDK, tracking identifier, remote log, crash upload 또는 lesson 행동 전송을
  추가하지 않는다.
- local progress는 최소 데이터만 저장하고 project와 lesson/version/step을 연결하는 데 필요한 범위를 넘지
  않는다.
- mesh, sample 편집 결과, glossary 열람, hint dismiss, abandon 이유를 외부로 전송하지 않는다.
- progress export/delete와 project 삭제 시 관련 local lesson state 정리 정책을 제공한다.
- 알 수 없는/손상된 progress record는 mesh나 project document를 수정하지 않고 안전한 resume/restart 선택지를
  제시한다.
- 익명 제품 telemetry가 필요하면 목적, event schema, retention, opt-in/withdraw/delete, privacy notice와
  offline fallback을 정의한 **별도 승인 workstream**으로만 추가한다. opt-out을 기본값으로 바꾸는 수정은 17
  범위가 아니다.

## Integration Ownership

17은 자기 worktree 안에서만 아래 경로를 소유한다. 기존 저장소 구조가 다르면 write 전에 동등한 exact path를
선언하고 Agent 경로가 겹치지 않게 한다.

```text
src/guided/**
tests/guided/**
public/samples/guided/**
tests/integration/guided/**
tests/e2e/guided/**
tests/device/guided/**
scripts/verify-guided*
docs/validation/guided/**

src/app/composition/guided-*
src/app/bootstrap.* (Guided entry/panel의 최소 wiring만)
tests/app/guided/**

docs/licenses/guided/**
docs/workplan/17_GUIDED_RETOPO.md (RESULT만)
```

`src/app/bootstrap.*`는 16/18 또는 20~24와 동시에 수정하지 않는다. 25가 main에 통합된 뒤 Standard 주 에이전트만
Guided 진입점의 최소 변경을 수행한다. 공용 `src/contracts/**`, concrete mesh/history/tool/retopo/renderer 내부, Optional
extension 내부, package/lockfile, build/CI 설정과 다른 workplan은 Ownership에 포함하지 않는다.

새 dependency나 shared config 변경이 꼭 필요하면 구현하지 않고 RESULT에 요청한다. 기존 dependency와
canonical test command로 구현하는 것을 기본으로 한다.

## Agent Allocation

### Early-mode allocation

- **Agent A:** `src/guided/core/**`, `src/guided/content/**`와 대응 core/content/fixture unit tests만 소유한다.
  `src/guided/persistence/**`, sample/license asset은 금지한다.
- **Agent B:** 아래 analysis/preview 소유 범위를 그대로 사용할 수 있다.
- **Agent C:** `src/guided/ui/**`, `src/guided/accessibility/**`와 대응 unit tests만 소유한다. app/integration/E2E/device/evidence는 금지한다.
- **Main Agent:** ownership/preflight와 `IN_PROGRESS` RESULT/checkpoint push만 소유한다.

아래 표는 **Standard mode**에서만 적용한다.

### Agent A — Lesson Core, Content, and Local Progress

소유 파일:

```text
src/guided/core/**
src/guided/content/**
src/guided/persistence/**
tests/guided/core/**
tests/guided/content/**
tests/guided/persistence/**
tests/guided/fixtures/lessons/**
public/samples/guided/**
docs/licenses/guided/**
```

책임:

- immutable versioned lesson schema/parser/validator
- start/pause/resume/skip/abandon/restart/completion 상태기계
- offline local progress와 lesson version migration/fallback
- sample manifest의 hash/provenance/license validation
- engine과 sample/locale data 분리

### Agent B — Topology Analysis and Preview

소유 파일:

```text
src/guided/analysis/**
src/guided/preview/**
tests/guided/analysis/**
tests/guided/preview/**
tests/guided/fixtures/meshes/**
```

책임:

- canonical `MeshQuery`/snapshot 기반 loop, density, pole와 non-manifold diagnostic
- 목적 기반 constraint 평가와 stable-ID deterministic ordering
- non-mutating flow/density `ToolPreview`
- info/warning/completion-blocker 경계와 stale preview rejection
- 여러 유효 topology를 허용하는 positive/negative/adversarial fixtures

### Agent C — Guided UI, Accessibility, and E2E Harness

소유 파일:

```text
src/guided/ui/**
src/guided/accessibility/**
tests/guided/ui/**
tests/guided/accessibility/**
tests/e2e/guided/**
tests/device/guided/**
docs/validation/guided/**
```

책임:

- progressive disclosure panel, glossary, step/progress controls
- 색 외 label/icon/pattern, focus, screen reader와 reduced-motion behavior
- Pencil/touch/mouse/keyboard basic-lesson harness
- actual first-asset browser/device procedure와 evidence schema
- abandon/recovery와 Pro mode 전환 E2E fixture

### Main Agent Reserved

```text
src/app/composition/guided-*
src/app/bootstrap.*
tests/app/guided/**
tests/integration/guided/**
scripts/verify-guided*
docs/workplan/17_GUIDED_RETOPO.md (RESULT만)
```

주 에이전트 책임:

- baseline/16 RESULT/ancestry와 contract preflight
- Agent별 exact path 선언과 early/standard mode 판정
- A의 lesson/session, B의 analysis/preview, C의 UI를 같은 Core service instance에 연결
- 16 start-source adapter와 Pro mode regression 조립
- actual first-asset vertical slice, input matrix와 privacy/network gate 최종 판정
- RESULT 갱신, final worktree commit/push와 exact SHA 보고

Agent A/B/C의 쓰기 경로는 서로 겹치지 않는다. `RESULT`, app composition과 shared bootstrap은 주 에이전트만
수정한다.

## Implementation Order

```text
preflight and ownership freeze
-> Agent A lesson schema/state + Agent B analysis/preview in parallel
-> Agent C local UI/accessibility shell and E2E fixture preparation
-> pure contract tests and content/provenance validation
-> 25 practical baseline / Standard-mode gate
-> reviewed early-core commits into exact PRACTICAL_TOOL_BASE_SHA branch
-> main agent start-source/project/tool composition
-> input-specific completion paths
-> actual first-asset E2E and Pro regression
-> physical/browser accessibility and recovery validation
-> RESULT and final worktree commit/push
```

Agent C가 16 이전에 시작한다면 `src/guided/ui/**`, unit accessibility tests와 fake harness만 소유하며 app
bootstrap/E2E wiring은 시작하지 않는다.

## Actual First-Asset End-to-End Slice

버튼 존재 여부나 lesson parser 단위 테스트만으로 완료하지 않는다. 승인된 실제 sample 또는 16 시작 흐름을
사용해 다음을 UI 경계부터 검증한다.

```text
fresh offline launch
-> choose Guided Retopo
-> inspect sample provenance/attribution
-> open approved first-asset sample or 16 start source
-> complete camera/input introduction
-> read purpose before terminology
-> create first committed topology through existing Tool/Retopo path
-> inspect flow preview and density/pole/non-manifold explanation
-> dismiss one non-blocking hint
-> perform one undo and redo
-> skip an optional step
-> pause/close
-> reload offline and resume at the durable step
-> complete the purpose-based topology constraint
-> switch to Pro mode without mesh/history/selection loss
-> save/reload/export
```

별도 abandon/recovery slice는 다음을 검증한다.

```text
active lesson with committed edits
-> abandon
-> project/history unchanged
-> restart lesson progress only
-> background/crash-style reload
-> no active gesture or stale preview restored
-> choose resume or explicit new-sample restart
```

completion fixture는 hidden answer mesh 좌표와의 equality가 아니라 목적 constraints, manifold invariants와
허용 density/flow band를 사용한다.

## Validation Layers

### Automated correctness gates

- lesson schema/version/parser와 invalid content rejection
- start/pause/resume/skip/abandon/restart deterministic state transitions
- 같은 mesh/version/lesson에서 diagnostic과 preview byte-stable ordering
- valid alternative topology가 한 정답과 다르다는 이유로 reject되지 않음
- preview/hint/dismiss/skip/resume가 mesh/history/selection을 변경하지 않음
- completion-blocker가 lesson completion만 막고 일반 edit/save/export/Pro transition을 막지 않음
- committed action의 history grouping, Undo/Redo 후 step 재평가
- stale mesh version, cancel, tool switch, dispose와 load replacement cleanup
- corrupt/missing progress와 lesson version mismatch recovery
- sample hash/provenance/license manifest validation
- default runtime network request/telemetry 0
- Guided package 제거 또는 Pro mode에서 기존 Core vertical slice 회귀 없음
- actual first-asset E2E, completion, abandon와 recovery slices

### Input and accessibility gates

- Pencil-only basic lesson
- touch-only basic lesson
- mouse-only basic lesson
- keyboard-oriented basic lesson
- mixed-device handoff 중 session/progress 보존
- 색을 제거하거나 monochrome simulation에서도 상태 구분
- screen reader name/role/state와 focus order
- reduced-motion static preview

### Browser/device gates

- production-equivalent desktop Chromium에서 first-asset E2E
- minimum supported iPad Safari에서 Pencil과 touch 경로
- 가능한 Magic Keyboard/mouse/trackpad 조합
- orientation/background/foreground와 offline reload
- lesson overlay가 00 ADR의 frame/input/memory hard limit을 넘지 않음

실물 기기나 특정 입력 장치가 없어 실행하지 못한 항목은 `NOT_RUN`이며 PASS가 아니다.

## Product Go / No-Go Metrics

테스트 통과는 구현 정확성과 회귀 방지를 뜻할 뿐, 시장 수요나 onboarding 성공을 증명하지 않는다. 다음 값은
별도 사용자 연구에서 검증할 **제품 가설**이며 17의 technical `Status: COMPLETE`와 분리한다.

초기 제안 기준:

- 적합한 초보/전환 사용자 30명 이상
- 80% 이상이 설명자 도움 없이 Guided 시작 경로를 선택하고 sample을 연다.
- 60% 이상이 10분 안에 첫 committed quad/strip을 만든다.
- 40% 이상이 첫 자산을 save/reload/export까지 완료한다.
- 25% 이상이 2주 안에 resume 또는 두 번째 asset을 시작한다.
- 완료 사용자 중 20% 이상이 제시 가격에 실제 구매 의향을 보인다.
- data loss 0건, 재현 가능한 치명적 camera/input blocker 0건
- 사용자가 “정답을 강요받았다” 또는 “내 mesh가 몰래 바뀌었다”고 보고한 사건 0건

초기 앱에는 telemetry가 없으므로 moderated study, 동의받은 관찰, 인터뷰와 사용자가 명시적으로 제공한
export/evidence로 측정한다. 수치가 기준을 밑돌아도 automated test를 실패로 바꾸지 않으며 원인을 lesson content,
입력 UX, 문제 빈도, 가격 또는 sample 적합성으로 분리한다.

RESULT에는 다음 두 항목을 별도로 기록한다.

```text
Technical status: NOT_STARTED | IN_PROGRESS | READY_WITH_CONTRACT_REQUEST | COMPLETE | BLOCKED
Product evidence: NOT_ASSESSED | STUDY_IN_PROGRESS | GO | ITERATE | NO_GO
```

## Image and Visual Asset Rule

- flow diagram, UI wireframe, overlay, arrow, loop marker, density pattern과 glossary icon은 SVG, HTML/CSS, canvas
  또는 code-native geometry를 우선한다.
- 새로운 raster illustration, texture, sprite 또는 기존 raster 편집이 lesson 이해에 실제로 필요할 때만
  `imagegen` skill/tool을 사용한다.
- ImageGen을 사용한 asset은 선택된 최종본만 Agent Ownership 안의 제품 경로로 옮기고 consuming code, alt text,
  provenance와 검증을 함께 갱신한다.
- ImageGen 결과를 정답 topology, 평가 fixture 또는 출처가 필요한 외부 sample geometry로 가장하지 않는다.
- 이미지가 없어도 명확한 UI에 장식 목적 bitmap을 억지로 추가하지 않는다.

## Acceptance Gates

다음을 모두 충족해야 `Status: COMPLETE`다.

- [ ] exact `PRACTICAL_TOOL_BASE_SHA`, 16/18과 20~24 입력 문서/RESULT/final SHA 및 ancestry를 기록했다.
- [ ] 조기 작업이 있었다면 순수 소유 commit만 표준 `PRACTICAL_TOOL_BASE_SHA` branch로 옮겼고 provenance를 기록했다.
- [ ] Guided/Pro가 동일 mesh/history/tool/selection/retopo service instance를 사용하며 별도 코어가 없다.
- [ ] `src/guided/**` core가 lesson/sample filename과 16 concrete implementation에 의존하지 않는다.
- [ ] lesson schema/data, engine, locale/UI와 sample manifest가 분리되어 있다.
- [ ] 눈/입/관절 loop의 목적 중심 설명과 glossary 연결을 동일 engine에서 표현·검증한다.
- [ ] flow preview, density guide, pole와 non-manifold 설명이 deterministic하고 non-mutating이다.
- [ ] info/warning/completion-blocker 경계가 명확하며 일반 editing/save/export를 차단하지 않는다.
- [ ] 사용자 확인 없는 auto-fix, hidden mesh mutation 또는 단일 answer topology 강제가 없다.
- [ ] 한 사용자 action의 mesh 변경이 기존 history entry 하나로 Undo/Redo되고 step이 committed state에서 재평가된다.
- [ ] skip/resume/abandon/restart가 명시된 semantics를 지키고 project/history를 몰래 reset하지 않는다.
- [ ] sample provenance, hash, redistribution/commercial license와 attribution이 검증된다.
- [ ] 색 외 상태 표현, glossary, focus, screen reader와 reduced-motion 요구가 통과한다.
- [ ] Pencil/touch/mouse/keyboard 각각으로 기본 lesson 완료 경로가 검증된다.
- [ ] 기본 runtime이 offline이며 account/network/telemetry dependency와 외부 행동 전송이 없다.
- [ ] actual first-asset E2E가 UI부터 Pro transition, save/reload/export까지 통과한다.
- [ ] completion, abandon, crash/background-style recovery와 stale preview cleanup test가 통과한다.
- [ ] 22의 project-associated cleanup hook에 Guided progress를 등록하고 project 삭제 시 해당 local state만 atomic하게 정리한다.
- [ ] Guided 제거/비활성 Pro mode와 Optional 유무 조합에서 기존 Core vertical slice가 회귀하지 않는다.
- [ ] canonical typecheck/test/build와 clean checkout CI-equivalent가 통과한다.
- [ ] representative desktop browser 및 minimum supported iPad/input device gate가 PASS다. 미검증은 PASS가 아니다.
- [ ] RESULT를 갱신하고 17 Ownership만 포함한 final worktree commit과 same-name origin branch push를 완료했다.
- [ ] tag를 만들지 않았고 main merge/deploy를 수행하지 않았다.

`Product evidence`의 GO 여부는 위 technical acceptance와 별도다. 사용자 연구를 아직 하지 않았다는 이유만으로
기술 구현을 `BLOCKED`로 만들지 않으며, 반대로 좋은 사용자 반응으로 실패한 test/device gate를 덮지 않는다.

## Failure and Stop Rules

- 16이 없거나 미완료여도 Early parallel core 범위는 진행할 수 있지만 app wiring, sample launcher와 final E2E는
  시작하지 않는다.
- 16의 concrete API/Ownership이 불명확하면 추측 adapter를 만들지 않고 standard integration을 중단한다.
- canonical contract 부족으로 같은 service instance를 사용할 수 없으면 shadow type을 만들지 않고
  `READY_WITH_CONTRACT_REQUEST` 또는 `BLOCKED`로 기록한다.
- lesson completion이 hidden answer 좌표 일치나 한 topology만 요구하면 acceptance 실패다.
- hint/preview/skip/resume가 mesh/history를 변경하거나 undo stack을 오염하면 즉시 blocker다.
- 출처·license·재배포 권리가 불명확한 sample은 제거 전까지 ship-ready acceptance 실패다.
- Pencil/touch/mouse/keyboard 중 하나의 기본 lesson 완료 경로가 없으면 `COMPLETE`로 기록하지 않는다.
- 실제 first-asset E2E, save/reload/export 또는 recovery에서 data loss가 발생하면 blocker다.
- physical iPad/input/performance 필수 항목이 `NOT_RUN`이면 개발 결과를 남길 수 있지만 `COMPLETE`로 과장하지
  않는다.
- Pro mode/Core-only regression이 실패하면 Guided UI가 동작해도 완료할 수 없다.
- 계정/telemetry/network가 필수 dependency로 들어오면 범위를 중단하고 별도 privacy workstream 승인을 받는다.
- early branch의 app/shared-file 변경을 cherry-pick하지 않는다. 충돌하면 순수 commit을 다시 검토해 표준
  branch에서 최소 변경으로 재적용한다.
- 다른 worktree를 현재 worktree에 merge하거나 main에서 직접 구현/merge하지 않는다.

## Final Commit, Push, and No-Tag Rule

Early parallel core mode는 표준 완료 commit과 구분한다. 허용된 순수 경로만 포함하고 focused test가 통과한
단위는 `wt/guided-retopo-core`에 checkpoint commit으로 남겨 같은 이름의 origin branch에 non-force push할 수
있다. 이때 RESULT는 `Status: IN_PROGRESS`로 갱신하고 early-core commit SHA, 검증 범위와 남은 standard gate를
기록한다. app/project/sample launcher/E2E wiring을 섞거나 `COMPLETE`로 기록하지 않는다.

1. acceptance evidence와 input/device matrix를 수집한다.
2. `docs/workplan/17_GUIDED_RETOPO.md`의 RESULT를 먼저 갱신한다.
3. final commit SHA를 RESULT 내부에 자기 참조로 기록하려고 추가 commit을 만들지 않는다.
4. 17 Ownership과 승인된 파일만 stage해 하나의 완결된 workstream commit을 만든다.
5. `wt/guided-retopo`를 같은 이름의 origin branch로 non-force push한다.
6. branch, `git rev-parse HEAD`, input baseline/16 SHA와 검증 결과를 최종 응답에 보고한다.
7. 이 workstream에서는 어떤 baseline/release/deploy tag도 만들지 않는다.
8. main merge, Pages preview/production deploy와 release 판정은 별도 승인된 후속 integration/release 작업으로
   넘긴다.

`COMPLETE` 또는 contract만 남은 `READY_WITH_CONTRACT_REQUEST`가 아니면 사용자의 명시적 checkpoint 요청 없이
완료 commit/push를 만들지 않는다.

## RESULT

Status: IN_PROGRESS

Product evidence: NOT_ASSESSED

### Execution mode
- Standard or early-parallel: Early parallel core only
- Branch/worktree: `wt/guided-retopo-core` / `/home/beelink/wt-guided-retopo-core`
- Input baseline resolved SHA (`POST_PLAN_BASE_SHA` or `PRACTICAL_TOOL_BASE_SHA`): `b78cff6dba292ffdab9bc5cd58830c56bff9ee3f`
- Input-SHA ancestry check: PASS — `b78cff6dba292ffdab9bc5cd58830c56bff9ee3f` is an ancestor of the early-core checkpoint and RESULT descendant
- PRODUCT_INPUT_BASE_SHA / PRACTICAL_TOOL_BASE_SHA: NOT RESOLVED — Standard mode deferred until 25 is complete
- 16/18 RESULT status and final SHAs: NOT CONSUMED — outside Early Core
- 20~24 RESULT status and final SHAs: NOT CONSUMED — outside Early Core
- 25 integration RESULT / final SHA: NOT CONSUMED — Standard mode not started
- Early-core commits carried forward: `ee477ff09b6623678882c4e2e297a87ec3eab20d` (`feat(guided): add early core checkpoint`)

### Implemented
- Versioned, immutable Guided lesson schema with a closed constraint vocabulary and deeply frozen parser output.
- Pure Guided session lifecycle for start, committed-state evaluation, pause/resume, optional evaluated-versus-skipped provenance, abandon, restart and versioned progress restore.
- Deterministic, non-mutating topology diagnostics over canonical `MeshQuery`/`MeshSnapshot`, including face-local degeneracy tolerance, manifold, loop, joint-support and density checks.
- Canonical `ToolPreview` flow/density overlays with source identity, mesh-version, region, seed and density cache identity plus cancel/dispose invalidation.
- Strict offline sample-manifest provenance, license, modification-rights, path and precomputed SHA-256 validation.
- Local `HTMLElement` Guided panel and accessibility helpers with native controls, enabled focus fallback, persistent fixed-polarity live regions, non-color status presentation, reduced-motion descriptors and mixed-input availability.

### Files created or modified
- Pure product modules: `src/guided/{core,content,analysis,preview,ui,accessibility}/**`
- Pure tests and canonical-contract fixtures: `tests/guided/**`
- RESULT-only update: `docs/workplan/17_GUIDED_RETOPO.md`
- No app, composition, project, persistence, E2E, device, shared contract, build configuration or integration source was modified.

### Public/local API
- Lesson/content: `parseGuidedLesson`, `BUILTIN_GUIDED_LESSONS`, `validateSampleManifest`, `verifySampleContentHash`
- Session: `createGuidedSession`
- Analysis/preview: `analyzeTopology`, `evaluatePurposeConstraints`, `buildGuidedFlowPreview`
- Local UI/accessibility: `mountGuidedPanel`, `statusPresentation`, `createAccessiblePreviewDescriptor`, `recordInputDevice`

### Lesson/content coverage
- First-asset lesson: Schema/session primitives only; launcher and actual first-asset workflow deferred to Standard mode.
- Eye loop: Purpose-oriented closed-loop/manifold built-in definition and deterministic tests.
- Mouth loop: Purpose-oriented closed-loop/density-band built-in definition and deterministic tests.
- Joint loop: Purpose-oriented joint-support/manifold built-in definition and deterministic tests.
- Glossary: Locale-neutral glossary keys and local glossary action represented; localized content wiring deferred.

### Sample provenance / license
- Sample manifest: Versioned immutable metadata contract implemented; no sample asset was added in Early Core.
- Content hash validation: Strict `sha256:<64 lowercase hex>` metadata and precomputed expected/actual comparison covered.
- Author/source/license/attribution: Required; relative allowlisted license path, redistribution/commercial rights and modification rights validated.

### Tests / validation
- Typecheck/test/build: PASS — final `npm run ci`: 140 files / 695 tests, TypeScript, Vite production build and baseline artifact verification. One earlier full-suite attempt hit the existing 5-second mesh budget timeout at 5.575s; the same test passed alone at 3.196s and the complete rerun passed at 2.704s.
- Guided core/content/analysis: PASS — `npx vitest run tests/guided`: 8 files / 48 tests. Recent blocker focus: 3 files / 20 tests plus `npm run typecheck` PASS.
- Canonical regression: PASS — `npx vitest run tests/contracts tests/retopo tests/tools/runtime`: 14 files / 91 tests.
- Ownership/security/offline scan: PASS — 18 pure files before RESULT, no ownership violations, whitespace errors, prohibited concrete imports, network/storage/telemetry APIs, unsafe HTML/eval/process APIs, hardcoded secret patterns, `.only`, TODO or FIXME markers.
- Pro/Core-only regression: PASS within full `npm run ci`; no Guided app wiring was introduced.
- Actual first-asset E2E: NOT_RUN — prohibited in Early Core.
- Completion/abandon/recovery: Pure session completion, abandon, restart, restore and stale preview lifecycle PASS; crash/background project recovery deferred.
- Offline/network/telemetry gate: Static scan PASS; no account, network, storage or telemetry dependency in `src/guided/**`.

### Accessibility / input matrix
- Pencil: Pure availability and handoff representation PASS; physical Pencil lesson path NOT_RUN.
- Touch: Pure availability and handoff representation PASS; physical touch lesson path NOT_RUN.
- Mouse: Pure availability and handoff representation PASS; browser lesson path NOT_RUN.
- Keyboard: Native button semantics, deterministic order and enabled focus fallback PASS in jsdom; full app path NOT_RUN.
- Screen reader/focus/color/reduced motion: Persistent polite/assertive live-region identity, deferred initial announcement, deduplication, text/icon/pattern status and static reduced-motion descriptor tests PASS; assistive-technology hardware smoke NOT_RUN.

### Browser / device evidence
- Desktop browser: NOT_RUN — local pure DOM tests only.
- iPad Safari: NOT_RUN — Standard/device gate deferred.
- Performance/memory/input limits: Full canonical CI budget suite PASS on the development host; Guided-specific physical-device profiling NOT_RUN.

### Integration notes
- Standard mode remains deferred until workstream 25 publishes the required exact practical-tool baseline.
- App/composition wiring, sample launcher/assets, project-associated persistence/cleanup, history integration, localization, actual first-asset E2E and Pro transition belong to the later Standard/integration phase.
- Early Core consumes canonical contracts only and does not introduce a shadow mesh, history, selection or retopo implementation.

### Requested contract changes
- NONE

### Known limitations
- Technical status remains `IN_PROGRESS`: no Standard mode, app wiring, actual sample asset, project persistence/recovery, localized lesson UI, first-asset save/reload/export E2E, browser smoke or physical iPad/input evidence.
- Product study has not started.
- Density diagnostics are advisory warnings; product tuning and usability thresholds require later device and study evidence.

### Product study
- Evidence collection method: NOT_STARTED
- Cohort: NONE
- Outcome: NOT_ASSESSED

### Final disposition
- Final local branch tip: This RESULT commit; exact non-self-referential SHA is reported in the final handoff.
- Pushed same-name origin branch tip: `origin/wt/guided-retopo-core`; exact SHA is reported in the final handoff.
- Local/remote tip equality: verified after non-force push and reported in the final handoff.
- Branch push performed: YES — non-force push to `origin/wt/guided-retopo-core`
- Tag created: NO — prohibited by this workstream
- Main merge/deploy performed: NO — out of scope
