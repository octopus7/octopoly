# Codex Work Conversation Start Prompts

이 문서는 사용자가 새 작업 대화를 만든 뒤 **해당 코드블록 하나만 복사**하기 위한 문서다.

모든 대화는 저장소 루트 `/AGENTS.md`의 공통 규칙을 따른다. 00을 제외한 기능 작업은
`docs/workplan/00_BOOTSTRAP.md`의 RESULT가 `COMPLETE`이고 immutable baseline ref가 생성된 뒤에만 시작한다.

## 00 — Bootstrap Baseline

```text
docs/workplan/00_BOOTSTRAP.md를 이번 대화의 단일 작업 명세로 사용해 00 Bootstrap만 수행해.
먼저 /AGENTS.md, docs/workplan/00_MASTER.md, 00 문서, docs/workplan/INTERFACE_CONTRACTS.md를 순서대로
끝까지 읽어.
Execution대로 main에서 작업하고, Agent A/B/C의 파일 소유 범위를 겹치지 않게 확정한 뒤 가능한 작업은
최대 3개 서브에이전트로 병렬 수행해. scaffold, 실제 src/contracts/**, contract tests, ADR과 canonical
build/test 명령을 완성해. 첫 앱은 제품명이 정확히 `OctoPoly`인 feature-free 빈 메인 페이지로 만들고,
사용자가 미리 구성한 기존 Cloudflare Pages project/Git integration을 재생성하거나 덮어쓰지 마. 정적
Pages만 사용하고 Functions/Workers/bindings/secrets는 추가하지 마. candidate main commit을 push해 production
URL과 deep-link/header를 검증한 뒤 RESULT와 final baseline commit을 만들고, final commit을 다시 push해 같은
SHA의 Pages 배포 성공을 확인해. 그 뒤에만 `baseline/core-v1` annotated tag를 생성·push하고 resolved SHA와
deployment URL을 최종 보고에 포함해.
01~08 기능은 구현하지 마.
```

---

## 01 — Main Leaf

```text
docs/workplan/01_MAIN_LEAF.md를 이번 대화의 단일 작업 명세로 사용해 01 작업만 수행해.
먼저 /AGENTS.md, docs/workplan/00_MASTER.md, docs/workplan/00_BOOTSTRAP.md 전체,
docs/workplan/INTERFACE_CONTRACTS.md와 01 문서를 순서대로 읽고 baseline ref를 commit SHA로 해석해.
문서의 wt/main-leaf
branch/worktree가 그 commit에서 시작했는지 검증해.
Agent A/B/C의 명시된 파일 소유대로 가능한 작업을 최대 3개 서브에이전트로 병렬 수행하되 application
wiring이나 다른 workstream 코드는 구현하지 마. acceptance를 검증하고 01 RESULT를 갱신한 뒤 branch에
commit하고 최종 응답에 commit SHA를 보고해. main merge/push는 하지 마.
```

---

## 02 — Mesh Kernel

```text
docs/workplan/02_MESH_KERNEL.md를 이번 대화의 단일 작업 명세로 사용해 02 작업만 수행해.
먼저 /AGENTS.md, docs/workplan/00_MASTER.md, docs/workplan/00_BOOTSTRAP.md 전체,
docs/workplan/INTERFACE_CONTRACTS.md와 02 문서를 순서대로 읽고 baseline ref를 commit SHA로 해석해.
wt/mesh-kernel이 그 commit에서 시작했는지 검증하고, 문서의 internal foundation gate를 먼저 완료한 뒤
파일 소유가 분리된 mutation/quad 작업을 서브에이전트로 병렬화해. UI/GPU/input이나 UV semantics는
구현하지 마. invariant/property/round-trip 테스트를 실행하고 02 RESULT를 갱신한 뒤 branch에 commit하고
최종 응답에 commit SHA를 보고해. main merge/push는 하지 마.
```

---

## 03 — Surface Engine

```text
docs/workplan/03_SURFACE_ENGINE.md를 이번 대화의 단일 작업 명세로 사용해 03 작업만 수행해.
먼저 /AGENTS.md, docs/workplan/00_MASTER.md, docs/workplan/00_BOOTSTRAP.md 전체,
docs/workplan/INTERFACE_CONTRACTS.md와 03 문서를 순서대로 읽고 baseline ref를 commit SHA로 해석해.
wt/surface-engine이 그 commit에서 시작했는지 검증하고, 문서의 파일 소유대로 reference geometry,
spatial acceleration, SurfaceQuery를 가능한 범위에서 최대 3개 서브에이전트로 병렬 수행해. Retopo나
Renderer concrete implementation은 만들지 마. 수치/degenerate/miss fixture를 검증하고 03 RESULT를
갱신한 뒤 branch에 commit하고 최종 응답에 commit SHA를 보고해. main merge/push는 하지 마.
```

---

## 04 — Selection Engine

```text
docs/workplan/04_SELECTION_ENGINE.md를 이번 대화의 단일 작업 명세로 사용해 04 작업만 수행해.
먼저 /AGENTS.md, docs/workplan/00_MASTER.md, docs/workplan/00_BOOTSTRAP.md 전체,
docs/workplan/INTERFACE_CONTRACTS.md와 04 문서를 순서대로 읽고 baseline ref를 commit SHA로 해석해.
wt/selection-engine이 그 commit에서 시작했는지 검증하고 MeshQuery contract fake만 사용해 selection
state, loop/ring, operators를 명시된 파일 소유대로 최대 3개 서브에이전트로 병렬 수행해. picking이나 raw
input은 구현하지 마. boundary/non-manifold fixture를 검증하고 04 RESULT를 갱신한 뒤 branch에 commit하고
최종 응답에 commit SHA를 보고해. main merge/push는 하지 마.
```

---

## 05 — History Engine

```text
docs/workplan/05_HISTORY_ENGINE.md를 이번 대화의 단일 작업 명세로 사용해 05 작업만 수행해.
먼저 /AGENTS.md, docs/workplan/00_MASTER.md, docs/workplan/00_BOOTSTRAP.md 전체,
docs/workplan/INTERFACE_CONTRACTS.md와 05 문서를 순서대로 읽고 baseline ref를 commit SHA로 해석해.
wt/history-engine이 그 commit에서 시작했는지 검증하고 reversible change, undo/redo stack, transaction
grouping을 명시된 파일 소유대로 최대 3개 서브에이전트로 병렬 수행해. Mesh 구현을 복제하지 말고 contract
fake를 사용해. apply/revert 및 stroke grouping round trip을 검증하고 05 RESULT를 갱신한 뒤 branch에
commit하고 최종 응답에 commit SHA를 보고해. main merge/push는 하지 마.
```

---

## 06 — Tool Runtime

```text
docs/workplan/06_TOOL_RUNTIME.md를 이번 대화의 단일 작업 명세로 사용해 06 작업만 수행해.
먼저 /AGENTS.md, docs/workplan/00_MASTER.md, docs/workplan/00_BOOTSTRAP.md 전체,
docs/workplan/INTERFACE_CONTRACTS.md와 06 문서를 순서대로 읽고 baseline ref를 commit SHA로 해석해.
wt/tool-runtime이 그 commit에서 시작했는지 검증하고 lifecycle, state machine, normalized pointer routing을
명시된 파일 소유대로 최대 3개 서브에이전트로 병렬 수행해. 구체 modeling tool이나 raw PointerEvent 처리는
구현하지 마. capture/cancel/transaction 종료 fixture를 검증하고 06 RESULT를 갱신한 뒤 branch에 commit하고
최종 응답에 commit SHA를 보고해. main merge/push는 하지 마.
```

---

## 07 — Renderer

```text
docs/workplan/07_RENDERER.md를 이번 대화의 단일 작업 명세로 사용해 07 작업만 수행해.
먼저 /AGENTS.md, docs/workplan/00_MASTER.md, docs/workplan/00_BOOTSTRAP.md 전체,
docs/workplan/INTERFACE_CONTRACTS.md와 07 문서를 순서대로 읽고 GPU ADR 및 baseline ref를 commit SHA로
해석해.
wt/renderer가 그 commit에서 시작했는지 검증하고 WebGL2 Core, reference path, retopo/overlay
path를 명시된 파일 소유대로 최대 3개 서브에이전트로 병렬 수행해. PBR/MatCap은 구현하지 마. resize/DPR,
resource disposal, context loss와 fallback을 검증하고 07 RESULT를 갱신한 뒤 branch에 commit하고 최종
응답에 commit SHA를 보고해. main merge/push는 하지 마.
```

---

## 08 — Retopo Engine

```text
docs/workplan/08_RETOPO_ENGINE.md를 이번 대화의 단일 작업 명세로 사용해 08 작업만 수행해.
먼저 /AGENTS.md, docs/workplan/00_MASTER.md, docs/workplan/00_BOOTSTRAP.md 전체,
docs/workplan/INTERFACE_CONTRACTS.md와 08 문서를 순서대로 읽고 baseline ref를 commit SHA로 해석해.
wt/retopo-engine이 그 commit에서 시작했는지 검증하고 stroke processing, chain generation, quad inference를
명시된 파일 소유대로 최대 3개 서브에이전트로 병렬 수행해. RetopoStrokeInput/MeshQuery contract와 fake만
사용하고 concrete Mesh/Surface/Picking 코드는 구현하지 마. deterministic replay/degenerate/cancel fixture를
검증하고 08 RESULT를 갱신한 뒤 branch에 commit하고 최종 응답에 commit SHA를 보고해. main merge/push는
하지 마.
```

---

## 09 — Core Integration

```text
docs/workplan/09_INTEGRATION.md를 이번 대화의 단일 작업 명세로 사용해 09 Core Integration만 수행해.
먼저 /AGENTS.md, docs/workplan/00_MASTER.md, docs/workplan/00_BOOTSTRAP.md 전체,
docs/workplan/INTERFACE_CONTRACTS.md, 09 문서와 01~08 각 RESULT를 순서대로 끝까지 읽어. main에 baseline tag가 가리키는
commit이 포함되어 있고 각 workstream이 `COMPLETE` 또는 `READY_WITH_CONTRACT_REQUEST`이며 commit SHA와
검증 evidence가 있는지 확인해. 문서의 권장 순서로 merge하고, Agent A/B/C 파일 소유를 분리해 contract
reconciliation, application wiring, validation을 가능한 범위에서 병렬 수행해. 필수 vertical slice와
Optional 제거 build, iPad Safari 경로를 검증하고 09 RESULT를 갱신해. 변경을 최종 Core integration
commit으로 만든 뒤 `baseline/optional-sdk-v1` annotated tag를 생성하고 resolved SHA를 보고해. 10~13은
구현하지 마.
```

---

# Optional Conversations

Optional 작업은 09 RESULT가 `COMPLETE`이고 immutable ref `baseline/optional-sdk-v1`이 생성된 뒤 시작한다.

## 10 — UV Editor

```text
docs/workplan/10_UV_EDITOR.md를 이번 대화의 단일 작업 명세로 사용해 Optional 10만 수행해.
먼저 /AGENTS.md, docs/workplan/00_MASTER.md, docs/workplan/00_BOOTSTRAP.md 전체,
docs/workplan/INTERFACE_CONTRACTS.md, docs/workplan/09_INTEGRATION.md의 RESULT와 10 문서를 순서대로 읽어.
`baseline/optional-sdk-v1`을 commit SHA로 해석하고 wt/uv-editor가 그 commit에서 시작했는지
검증하고 문서의 파일 소유대로 최대 3개 서브에이전트를 사용해.
Core를 수정하거나 UV-specific semantics를 Mesh Kernel에 추가하지 마. extension 제거 build와 UV attribute
round trip을 검증하고 10 RESULT를 갱신한 뒤 branch에 commit하고 최종 응답에 commit SHA를 보고해.
main merge/push는 하지 마.
```

---

## 11 — Texture Paint

```text
docs/workplan/11_TEXTURE_PAINT.md를 이번 대화의 단일 작업 명세로 사용해 Optional 11만 수행해.
먼저 /AGENTS.md, docs/workplan/00_MASTER.md, docs/workplan/00_BOOTSTRAP.md 전체,
docs/workplan/INTERFACE_CONTRACTS.md, docs/workplan/09_INTEGRATION.md의 RESULT와 11 문서를 순서대로 읽어.
`baseline/optional-sdk-v1`을 commit SHA로 해석하고 wt/texture-paint가 그 commit에서 시작했는지
검증하고 문서의 파일 소유대로 최대 3개 서브에이전트를
사용해. 10 UV Editor 구현을 필수로 가정하지 말고 UV 데이터가 없으면 안전하게 비활성화해. Core를
수정하지 말고 paint/history/image round trip과 extension 제거 build를 검증한 뒤 11 RESULT를 갱신하고
branch에 commit해. 최종 응답에 commit SHA를 보고하고 main merge/push는 하지 마.
```

---

## 12 — Lookdev / PBR

```text
docs/workplan/12_LOOKDEV_RENDER.md를 이번 대화의 단일 작업 명세로 사용해 Optional 12만 수행해.
먼저 /AGENTS.md, docs/workplan/00_MASTER.md, docs/workplan/00_BOOTSTRAP.md 전체,
docs/workplan/INTERFACE_CONTRACTS.md, docs/workplan/09_INTEGRATION.md의 RESULT와 12 문서를 순서대로 읽어.
Renderer SDK와 `baseline/optional-sdk-v1`을 확인하고 commit SHA로 해석해. wt/lookdev-render가 그 commit에서
시작했는지 검증하고 material, realtime PBR, quality fallback을 명시된
파일 소유대로 최대 3개 서브에이전트로 수행해. Core Renderer를 수정하지 말고 ShadingProvider extension만
사용해. unsupported/failure fallback과 extension 제거 build를 검증하고 12 RESULT를 갱신한 뒤 branch에
commit해. 최종 응답에 commit SHA를 보고하고 main merge/push는 하지 마.
```

---

## 13 — MatCap

```text
docs/workplan/13_MATCAP.md를 이번 대화의 단일 작업 명세로 사용해 Optional 13만 수행해.
먼저 /AGENTS.md, docs/workplan/00_MASTER.md, docs/workplan/00_BOOTSTRAP.md 전체,
docs/workplan/INTERFACE_CONTRACTS.md, docs/workplan/09_INTEGRATION.md의 RESULT와 13 문서를 순서대로 읽어.
Renderer SDK와 `baseline/optional-sdk-v1`을 확인하고 commit SHA로 해석해.
별도 대화라면 wt/matcap을 사용하고, 12와 같은 대화에서 수행한다면 12가 완료된 뒤 wt/lookdev-render에서
순차 수행해. Core/PBR 파일을 수정하지 않고 독립 ShadingProvider extension으로 구현해. preset/custom
image 실패 fallback과 extension 제거 build를 검증하고 13 RESULT를 갱신한 뒤 branch에 commit해. 최종
응답에 commit SHA를 보고하고 main merge/push는 하지 마.
```

---

## 14 — Optional Integration

```text
docs/workplan/14_OPTIONAL_INTEGRATION.md를 이번 대화의 단일 작업 명세로 사용해 10~13 Full Optional
Integration만 수행해. 먼저 /AGENTS.md, docs/workplan/00_MASTER.md, docs/workplan/00_BOOTSTRAP.md 전체,
docs/workplan/INTERFACE_CONTRACTS.md, 09 RESULT, 10~13 전체 문서와 RESULT를 순서대로 끝까지 읽어.
main과 `baseline/optional-sdk-v1`, 각 branch ancestry/tip을 검증하고 dedicated/combined MatCap mode를
확정해. 문서의 순서로 main에 merge한 뒤 Agent A/B/C 소유를 분리해 additive contract reconciliation,
optional entrypoint/lifecycle과 전체 조합 검증을 수행해. candidate shading lease, image revision/GPU restore,
extension state, Core-only 회귀와 실제 iPad/Pencil hard-limit gate를 모두 검증해. 미검증/실패가 있으면
`baseline/full-v1` tag를 만들지 마. 모두 통과하면 14 RESULT와 final commit을 만든 뒤 annotated tag의
resolved SHA를 보고해. push는 명시적 사용자 승인 없이는 하지 마.
```

---

## 15 — Cloudflare Pages Release / Operations

```text
docs/workplan/15_CLOUDFLARE_PAGES.md를 이번 대화의 단일 작업 명세로 사용해 Pages release/operations
hardening만 수행해. 먼저 /AGENTS.md, docs/workplan/00_MASTER.md, docs/workplan/00_BOOTSTRAP.md 전체와
RESULT, 15 문서, 그리고 release shape에 따라 09 또는 14 전체와 RESULT를 순서대로 끝까지 읽어.
기존 Pages project `octopoly`와 production URL https://octopoly.pages.dev/ 을 재사용하고 project를 생성,
재생성, 교체, 초기화, 삭제 또는 덮어쓰지 마. Core-only는 `baseline/optional-sdk-v1`, Full Optional은
`baseline/full-v1`의 resolved commit을 입력으로 사용해. Agent A/B/C의 파일 소유를 분리해 정적 artifact,
preview/deep-link, production/iPad/rollback 증거를 가능한 범위에서 병렬 수집해. Pages Functions, Worker,
binding, secret이나 동적 API는 추가하지 마. 사용자 승인이 필요한 외부 변경 전에 정확한 대상과 범위를
확인하고, 같은 candidate SHA의 preview와 production, 실제 rollback/roll-forward가 모두 통과한 경우에만
active production source commit에 `deploy/pages-v1` annotated tag를 만들어 push하고 RESULT와 resolved SHA를
보고해.
```

---

# Post-Integration Product Conversations

16과 18, 17의 early-core 준비는 계획 문서를 포함한 동일한 최신 `origin/main` commit을
`POST_PLAN_BASE_SHA`로 기록하고 각각의 worktree를 정확히 그 SHA에서 만든다. 17의 표준 app 연결과
first-asset E2E branch는 승인된 16 산출물이 main에 병합된 exact commit에서 새로 시작한다. 가능한 준비 작업은
병렬 수행하지만 각 대화는 branch commit과 RESULT만 만들며 main merge/push는 coordinator가 별도로 수행한다.
`baseline/full-v1` 부재는 시작 차단 조건이 아니고, 어느 작업도 해당 release tag를 만들 수 없다.

## 16 — Basic Primitives

```text
docs/workplan/16_BASIC_PRIMITIVES.md를 이번 대화의 단일 작업 명세로 사용해 Basic Primitives만 수행해.
먼저 /AGENTS.md, docs/workplan/00_MASTER.md, docs/workplan/INTERFACE_CONTRACTS.md,
docs/OCTOPOLY_FOLLOW_UP_FEATURE_ANALYSIS.md, 16 문서를 순서대로 끝까지 읽어. 계획 문서를 포함한 최신
origin/main을 commit SHA로 해석해 POST_PLAN_BASE_SHA로 기록하고 wt/basic-primitives가 정확히 그 SHA에서
시작했는지 확인해. 문서의 파일 소유대로 가능한 작업을 최대 3개 서브에이전트로 병렬 수행해. Plane과 Cube
생성은 command/history transaction을 통과해야 하며 ID를 수동 생성하거나 mesh/history/renderer 구현을
복제하지 마. 빈 장면에서 생성, 선택, frame, undo/redo, 저장/재로드, export까지 검증하고 16 RESULT를
갱신한 뒤 branch에 단위별 commit을 만들고 최종 commit SHA를 보고해. main merge/push, 17/18 구현,
baseline/full-v1 tag 생성은 하지 마.
```

---

## 17 — Guided Retopo

```text
docs/workplan/17_GUIDED_RETOPO.md를 이번 대화의 단일 작업 명세로 사용해 Guided Retopo만 수행해.
먼저 /AGENTS.md, docs/workplan/00_MASTER.md, docs/workplan/INTERFACE_CONTRACTS.md,
docs/OCTOPOLY_IPAD_COMMERCIAL_VIABILITY.md, docs/OCTOPOLY_FOLLOW_UP_FEATURE_ANALYSIS.md, 17 문서를 순서대로
끝까지 읽어. 16 RESULT와 ancestry를 먼저 판정해. 16이 아직 승인·병합되지 않았다면 문서의 Early parallel
core mode만 `wt/guided-retopo-core`에서 수행하고 app/project/sample launcher 경로는 건드리지 않은 채 순수
단위 commit을 같은 이름의 origin branch로 non-force push해. RESULT는 `IN_PROGRESS`로 남기고 commit SHA와
남은 standard gate를 보고해. 16이 main에 승인·병합돼 있다면 그 exact post-16 commit에서
`wt/guided-retopo`를 만들고 Standard mode 전체를 수행해. 어느 mode든 lesson engine/state, topology
diagnostic/preview, guided UI의 허용 범위를 파일 소유대로 최대 3개 서브에이전트로 병렬 수행하되 초보/Pro용
topology 엔진을 따로 만들지 마. 실제 mesh를 몰래 수정하거나 단 하나의 정답 topology를 강제하지 말고,
skip/resume/restart와 undo/redo 안전성을 보장해. 라이선스가 명확한 fixture로 첫 asset 학습 흐름과
offline/accessibility를 mode가 허용하는 범위까지 검증하고 17 RESULT를 갱신한 뒤 branch에 단위별 commit을
만들고 최종 commit SHA를 보고해. main merge/push, baseline/full-v1 tag 생성은 하지 마.
```

---

## 18 — Desktop Mouse Camera

```text
docs/workplan/18_DESKTOP_MOUSE_CAMERA.md를 이번 대화의 단일 작업 명세로 사용해 데스크톱 마우스·트랙패드
카메라 조작만 수행해. 먼저 /AGENTS.md, docs/workplan/00_MASTER.md,
docs/workplan/INTERFACE_CONTRACTS.md, docs/OCTOPOLY_DESKTOP_MOUSE_INPUT_ANALYSIS.md, 18 문서를 순서대로
끝까지 읽어. 계획 문서를 포함한 최신 origin/main을 commit SHA로 해석해 POST_PLAN_BASE_SHA로 기록하고
wt/desktop-mouse-camera가 정확히 그 SHA에서 시작했는지 확인해. 중간 버튼 orbit, Shift+중간 버튼 pan,
wheel/trackpad zoom, pointer capture/cancel cleanup을 문서의 파일 소유대로 최대 3개 서브에이전트로 병렬
수행해. 왼쪽 버튼 modeling 입력을 빼앗거나 wheel을 가짜 PointerSample로 변환하지 말고, 실제 데스크톱
브라우저에서 조합 키·capture·페이지 스크롤 억제·touch/Pencil 회귀를 검증해. 실제 물리 iPad mouse를
검증하지 않았다면 통과했다고 쓰지 마. 18 RESULT를 갱신한 뒤 branch에 단위별 commit을 만들고 최종 commit
SHA를 보고해. main merge/push, 16/17 구현, baseline/full-v1 tag 생성은 하지 마.
```
