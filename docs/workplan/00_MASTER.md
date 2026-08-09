# OctoPoly — Master Work Plan

## Goal

`OctoPoly`는 iPad Safari에서 Apple Pencil 중심으로 동작하는 low-poly / retopology modeling tool이다.
최초 구현은 기존 `octopoly` Cloudflare Pages project의 `https://octopoly.pages.dev/`에 feature-free 빈 앱
셸을 배포하는 00 Bootstrap이며, 그 뒤 Core 기능을 병렬화한다.

핵심 제품 흐름:

```text
Reference import
-> touch camera navigation
-> Pencil surface stroke / topology edit
-> quad-oriented retopo mesh
-> selection and transform
-> grouped undo/redo
-> project save/reload
-> mesh export
```

설계 원칙:

- Pencil-first retopology와 touch navigation의 명확한 분리
- surface snapping과 quad-oriented workflow
- stable-ID topology kernel과 transaction 기반 history
- contract 기반 병렬 개발
- mobile memory/GPU/thermal budget 우선
- Optional 기능과 Core의 빌드·런타임 완전 분리

## Document Roles

- `/AGENTS.md` — 모든 작업 대화와 에이전트의 공통 운영 규칙
- `docs/workplan/00_BOOTSTRAP.md` — 병렬 구현 전 필수 scaffold/contract baseline
- `docs/workplan/00_MASTER.md` — 전체 관계, 의존 방향, 실행 및 조립 순서
- `docs/workplan/INTERFACE_CONTRACTS.md` — frozen public boundary
- `docs/workplan/01~08` — 필수 Core 구현 workstream
- `docs/workplan/09_INTEGRATION.md` — 필수 Core 최종 조립과 제품 vertical slice
- `docs/workplan/10~13` — 09 이후 선택 가능한 Optional Extension
- `docs/workplan/14_OPTIONAL_INTEGRATION.md` — 선택한 Optional 산출물의 main 조립과 release gate
- `docs/workplan/15_CLOUDFLARE_PAGES.md` — 검증된 Core/Full Optional baseline의 Pages release와 운영 강화
- `docs/workplan/START_PROMPTS.md` — 새 작업 대화에 복사할 프롬프트

## Mandatory Start Gate

모든 기능 workstream보다 먼저 `00_BOOTSTRAP`을 main에서 완료한다.

```text
00 Bootstrap COMPLETE
-> canonical build/test commands PASS
-> src/contracts/** published
-> immutable tag `baseline/core-v1` created
-> tag resolves to one verified commit SHA
-> 01~08 branches/worktrees created from exactly that commit
```

baseline 이전에는 01~08의 branch/worktree나 기능 코드를 만들지 않는다. baseline 이후 개별 workstream은
공용 설정이나 frozen contract를 직접 변경하지 않고 change request만 남긴다.

## Execution Matrix

| No | Workstream | Required | Mode | Branch |
|---|---|---:|---|---|
| 00 | Bootstrap Baseline | YES | MAIN | `main` |
| 01 | Main Leaf | YES | WORKTREE | `wt/main-leaf` |
| 02 | Mesh Kernel | YES | WORKTREE | `wt/mesh-kernel` |
| 03 | Surface Engine | YES | WORKTREE | `wt/surface-engine` |
| 04 | Selection Engine | YES | WORKTREE | `wt/selection-engine` |
| 05 | History Engine | YES | WORKTREE | `wt/history-engine` |
| 06 | Tool Runtime | YES | WORKTREE | `wt/tool-runtime` |
| 07 | Renderer | YES | WORKTREE | `wt/renderer` |
| 08 | Retopo Engine | YES | WORKTREE | `wt/retopo-engine` |
| 09 | Integration | YES | MAIN | `main` |
| 10 | UV Editor | NO | WORKTREE | `wt/uv-editor` |
| 11 | Texture Paint | NO | WORKTREE | `wt/texture-paint` |
| 12 | Lightweight PBR / Quality Render | NO | WORKTREE | `wt/lookdev-render` |
| 13 | MatCap | NO | WORKTREE or SAME AS 12 | `wt/matcap` or `wt/lookdev-render` |
| 14 | Optional Integration | CONDITIONAL | MAIN | `main` |
| 15 | Cloudflare Pages Release / Operations | CONDITIONAL | MAIN | `main` |

## Core Dependency Direction

```text
                          00 Bootstrap / Contracts
                                     │
        ┌──────────┬──────────┬───────┼────────┬──────────┬──────────┐
        ▼          ▼          ▼       ▼        ▼          ▼          ▼
      01 Leaf    02 Mesh    03 Surface 04 Selection 05 History 06 Runtime
                      │          │          ▲                   │
                      └──────┬───┴──────────┘                   │
                             ▼                                  │
                          08 Retopo                    07 Renderer
        │                    │                                  │
        └────────────────────┴──────────────────────────────────┘
                                     │
                                     ▼
                              09 Integration
```

화살표는 concrete implementation 의존이 아니라 `INTERFACE_CONTRACTS.md`의 public boundary 소비를
뜻한다. 04와 08은 02/03 구현 완료를 기다리지 않고 baseline contract와 fake로 독립 테스트할 수 있다.

## Data Ownership

```text
Shared contracts/scaffold  -> 00 Bootstrap, 이후 09/14 Integration만 제한적으로 조정
Deployment build/config    -> 00 Bootstrap, 이후 15가 문서 Ownership 안에서만 제한적으로 조정
Input/camera/IO/UI leaves  -> 01 Main Leaf
Mesh topology/attributes   -> 02 Mesh Kernel
Reference/high-poly query  -> 03 Surface Engine
Selection state/operators  -> 04 Selection Engine
Undo/redo history          -> 05 History Engine
Tool lifecycle/dispatch    -> 06 Tool Runtime
GPU/render resources       -> 07 Renderer
Retopo inference/preview   -> 08 Retopo Engine
Application composition    -> 09 Integration
Optional composition       -> 14 Optional Integration
Pages release/operations   -> 15 Cloudflare Pages
```

각 workstream의 Agent A/B/C는 해당 문서에 지정된 파일 범위만 소유한다. 역할 설명만 있고 파일 소유가
나뉘지 않는 경우 주 에이전트가 구현 전에 경로를 확정한다.

## Parallel Execution Strategy

00 완료 후 01~08은 동일 baseline에서 독립 작업 대화로 시작할 수 있다.

- 각 workstream은 public contract와 contract fake만 사용한다.
- 다른 worktree의 미완성 코드를 가져오지 않는다.
- 전체 앱 build 대신 소유 module의 typecheck/test와 public export 검증을 성공 조건으로 삼는다.
- 내부 foundation이 필요한 workstream은 문서의 internal gate를 먼저 끝낸 뒤 하위 에이전트를 병렬화한다.
- contract 부족은 shadow type으로 우회하지 않고 RESULT의 change request로 남긴다.
- 병렬 작업 완료 여부는 commit SHA와 RESULT evidence로 판단한다.

## Required Merge Order

09 Integration 권장 순서:

1. 00 baseline이 main ancestry에 있는지 확인
2. `wt/mesh-kernel`
3. `wt/surface-engine`
4. `wt/renderer`
5. `wt/selection-engine`
6. `wt/history-engine`
7. `wt/tool-runtime`
8. `wt/retopo-engine`
9. `wt/main-leaf`
10. requested contract change reconciliation
11. application composition/wiring
12. full typecheck/test/build
13. Core vertical-slice smoke test
14. iPad Safari/Apple Pencil validation
15. final Core integration commit에 `baseline/optional-sdk-v1` tag 생성

Merge 순서는 ownership 충돌과 adapter 작성 순서를 줄이기 위한 권장값이다. Integration은 merge 전 각
workstream의 RESULT, commit SHA, tests, known limitations를 확인한다.

## Required Core Vertical Slice

09의 완료 조건에는 다음 한 흐름이 실제로 연결되어야 한다.

```text
reference fixture import
-> viewport render
-> normalized Pencil fixture
-> surface ray hit
-> vertex/edge or quad creation request
-> mesh mutation
-> one grouped history entry
-> undo/redo round trip
-> project save/reload
-> export
```

실기기 확인과 별도로 동일 입력 fixture를 재생하는 deterministic integration test를 둔다.

## Platform and Budget Gates

00의 ADR에서 다음을 숫자와 측정법으로 고정한다.

- 최소 지원 iPadOS/Safari와 검증 기기
- Core GPU baseline과 fallback
- reference/retopo mesh 규모
- frame time/FPS, pointer latency, startup time
- JS heap/GPU resource/texture 예산
- context loss와 memory pressure 복구 정책
- 수치 허용오차와 geometry degeneracy 정책

실기기 측정은 09에서 처음 시작하지 않는다. 00 capability smoke와 각 관련 workstream의 fixture 검증을
거쳐 09에서 전체 경로를 확인한다.

## Deployment Baseline

- existing Cloudflare Pages project: `octopoly`
- production URL: `https://octopoly.pages.dev/`
- production branch: `main`
- first implementation: 00의 feature-free `OctoPoly` empty shell build/deploy
- initial runtime: static Pages assets only; Pages Functions/Workers/bindings/secrets 없음
- future dynamic scope: 별도 Cloudflare Worker와 versioned HTTP API/client adapter로 추가

GitHub 저장소와 Pages 연결은 사용자가 이미 완료했다. 00은 project를 다시 만들지 않고 기존 설정과 build
output을 확인한 뒤 빈 shell을 배포한다. Dynamic backend 부재가 Core/Optional build나 local IndexedDB project
persistence를 막아서는 안 된다.

현재 GitHub 저장소 기준 production 배포 성공은 사용자가 확인했지만 애플리케이션은 아직 구현되지 않았다.
따라서 이는 Pages 연결 상태의 확인일 뿐 00 RESULT 완료가 아니다. 00의 첫 빈 shell 이후, 실제 Core-only 또는
Full Optional production release의 preview·rollback·cache/header 운영 강화는 15에서 별도로 수행한다.

## Optional Feature Rule

10~13은 전부 생략 가능하며 09가 생성한 immutable ref `baseline/optional-sdk-v1`의 resolved commit에서
시작한다.

```text
01~09 Core ─────────► Optional Extensions
Optional ─────X─────► Core 필수 build/runtime dependency
```

- Core package는 `src/extensions/**`를 import하지 않는다.
- 별도 optional entrypoint/composition root만 extension을 등록한다.
- Optional directory를 제거한 Core build/test를 09와 각 Optional acceptance에서 확인한다.
- Optional 작업에 필요한 public SDK가 부족하면 Core를 직접 고치지 않고 proposal을 남긴다.

## Optional Relationships

```text
                     01~09 CORE
                         │
             ┌───────────┼───────────┐
             ▼           ▼           ▼
           10 UV       12 PBR      13 MatCap
             │
             └─────┐
                   ▼
             11 Texture Paint
```

11은 UV 데이터가 있을 때 동작하지만 10 구현 자체에는 강제 의존하지 않는다.

```text
Imported UV 존재 + 11 -> Paint 가능
10 + 11              -> UV 생성/편집 후 Paint 가능
UV 없음              -> Paint UI가 안전하게 비활성
```

13을 12와 같은 `wt/lookdev-render`에서 수행하는 경우 같은 대화가 12 완료 후 순차 수행한다. 별도 대화로
병렬 수행할 때는 `wt/matcap`을 사용하며 두 작업이 같은 파일을 수정하지 않는다.

## Optional Merge and Release Order

10~13은 직접 main에 merge하지 않는다. 네 Optional 전체를 포함하는 Full Optional 제품을 만들 때 네 RESULT와
branch SHA가 모두 준비된 뒤 14를 별도 MAIN 대화로 실행한다. 기본 merge 순서는 `10 -> 11 -> 12 -> 13`이다.
개별 Optional workstream은 독립 개발·검증할 수 있지만 일부만 main에 통합하려면 14나 `baseline/full-v1`을
재사용하지 않고 별도 조합 계획과 immutable tag를 먼저 정의한다. 11은 10 코드에 의존하지 않으므로 imported
UV fixture로 독립 검증하고, 14에서는 UV-create-to-paint 조합을 추가한다. 12/13 및 11의 shading lease는 이전
active provider 복원을 조합 테스트로 검증한다.

14는 optional entrypoint, extension runtime/state persistence, image resolver/GPU lifecycle, 조합별 build와
Core-only 회귀를 소유한다. 실제 대표 iPad Safari/Apple Pencil과 ADR hard-limit 증거가 없으면 개발 통합은
완료할 수 있어도 release readiness는 `BLOCKED`이며 `baseline/full-v1` tag를 만들지 않는다.

## Pages Release Order

15는 앱 구현이나 Pages 프로젝트 생성을 담당하지 않는다. Core-only release는 09의
`baseline/optional-sdk-v1`, 10~13 전체를 포함한 release는 14의 `baseline/full-v1`을 입력으로 사용한다.
기존 `octopoly` 프로젝트를 그대로 재사용해 동일 candidate SHA의 preview와 production을 검증하고, 실제
rollback/roll-forward가 통과한 production source commit에만 `deploy/pages-v1` tag를 만든다. 동적 기능은
15 범위에도 포함하지 않으며 추후 별도 Worker/API 계획으로 분리한다.

## Definition of Ready for a Work Conversation

아래 항목은 00을 제외한 작업 대화에 적용한다. 15는 여기에 더해 자체 `Start Gates`의 09 또는 14 release
baseline과 Pages evidence 조건을 충족해야 한다.

- 00 RESULT가 COMPLETE이고 immutable baseline ref가 존재함
- baseline ref를 SHA로 해석했으며 지정 branch/worktree가 그 commit에서 생성됨
- 작업 MD와 contract를 읽음
- Agent별 파일 소유 범위를 확정함
- 테스트 명령과 acceptance fixture를 확인함
- 필요한 dependency가 contract에 존재함

하나라도 충족되지 않으면 누락을 보고하고 추측 구현을 시작하지 않는다.
