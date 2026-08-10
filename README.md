# OctoPoly

iPad Safari와 Apple Pencil을 우선 지원하는 low-poly / retopology 웹 모델링 도구의 병렬 개발 계획 저장소입니다.

> **Core Bootstrap 기준선**은 공용 contract, 정적 OctoPoly shell, 빌드·테스트·Pages 검증 경로를
> 포함하며 immutable `baseline/core-v1` tag에서 시작합니다.

## 문서 읽기 순서

구현 작업이나 작업용 대화를 시작하기 전에 다음 문서를 순서대로 읽습니다.

1. [`AGENTS.md`](AGENTS.md) — 모든 작업과 에이전트에 적용되는 공통 운영 규칙
2. [`docs/workplan/00_MASTER.md`](docs/workplan/00_MASTER.md) — 전체 관계, 실행 위치, 의존 방향 및 조립 순서
3. [`docs/workplan/00_BOOTSTRAP.md`](docs/workplan/00_BOOTSTRAP.md) — 기능 병렬화 전 필수 baseline 작업
4. [`docs/workplan/INTERFACE_CONTRACTS.md`](docs/workplan/INTERFACE_CONTRACTS.md) — 병렬 구현을 위한 공용 인터페이스 계약
5. [`docs/workplan/START_PROMPTS.md`](docs/workplan/START_PROMPTS.md) — 작업별 Codex 대화 시작 프롬프트

그다음 선택한 `docs/workplan/XX_*.md`를 해당 대화의 단일 작업 명세로 사용합니다.

후속 16~25 실행을 재개할 때는
[`docs/workplan/NEXT_SESSION_HANDOFF.md`](docs/workplan/NEXT_SESSION_HANDOFF.md)에서 현재 planning commit,
`POST_PLAN_BASE_SHA`, 남은 보호 승인과 worktree 생성 여부를 먼저 확인합니다.

## 문서 구조

```text
AGENTS.md
README.md
docs/workplan/
  00_BOOTSTRAP.md
  00_MASTER.md
  01_MAIN_LEAF.md
  02_MESH_KERNEL.md
  03_SURFACE_ENGINE.md
  04_SELECTION_ENGINE.md
  05_HISTORY_ENGINE.md
  06_TOOL_RUNTIME.md
  07_RENDERER.md
  08_RETOPO_ENGINE.md
  09_INTEGRATION.md
  10_UV_EDITOR.md
  11_TEXTURE_PAINT.md
  12_LOOKDEV_RENDER.md
  13_MATCAP.md
  14_OPTIONAL_INTEGRATION.md
  15_CLOUDFLARE_PAGES.md
  16_BASIC_PRIMITIVES.md
  17_GUIDED_RETOPO.md
  18_DESKTOP_MOUSE_CAMERA.md
  19_FOLLOW_UP_INTEGRATION.md
  20_TOPOLOGY_ACTIONS.md
  21_TRANSFORM_REFINEMENT_SYMMETRY.md
  22_PROJECT_LIFECYCLE.md
  23_IMPORT_INTEROP.md
  24_RETOPO_VISIBILITY.md
  25_PRACTICAL_TOOL_INTEGRATION.md
  INTERFACE_CONTRACTS.md
  OCTOPOLY_TASK_TIMELINE.md
  NEXT_SESSION_HANDOFF.md
  START_PROMPTS.md
docs/
  OCTOPOLY_FOLLOW_UP_FEATURE_ANALYSIS.md
  OCTOPOLY_DESKTOP_MOUSE_INPUT_ANALYSIS.md
  OCTOPOLY_IPAD_COMMERCIAL_VIABILITY.md
```

`src/**`, `tests/**` 및 프로젝트 설정 파일은 모두 저장소 루트를 기준으로 합니다.

## 구현 시작 전 Bootstrap

병렬 workstream을 시작하기 전에
[`docs/workplan/00_BOOTSTRAP.md`](docs/workplan/00_BOOTSTRAP.md)를 별도 작업 대화의 명세로 사용해
main에서 다음 baseline을 준비합니다.

- 제품명이 `OctoPoly`인 feature-free 빈 메인 페이지와 Cloudflare Pages 최초 정적 배포
- 실제 공용 contract 소스와 최소 project scaffold
- package manager와 dependency 설정
- typecheck, build 및 test 실행 경로
- workstream이 독립적으로 검증할 수 있는 기본 test setup
- 모든 작업 branch/worktree의 기준이 되는 baseline commit

00 RESULT가 `COMPLETE`이고 immutable baseline tag가 생성되기 전에는 01~08 branch/worktree를 만들지
않습니다. 모든 필수 Core 작업은 그 tag가 가리키는 commit에서 분기합니다.

## 작업 흐름

1. `docs/workplan/START_PROMPTS.md`의 00 프롬프트로 Bootstrap 대화를 시작합니다.
2. 00에서 `OctoPoly` 빈 메인 페이지를 기존 Cloudflare Pages 프로젝트에 먼저 배포·검증하고,
   `baseline/core-v1` tag와 resolved SHA를 확정합니다.
3. 01~08용 별도 대화를 만들고 각 작업 MD의 `Execution`, `Ownership`, `Agent Allocation`, `Acceptance`를
   확인합니다.
4. 동일 baseline에서 01~08 필수 Core 작업을 병렬 진행합니다.
5. 각 작업은 검증 결과와 통합 요청을 `RESULT`에 기록하고 branch commit SHA는 최종 응답으로 보고합니다.
6. 09에서 필수 Core를 main에 통합하고 contract, build, test, vertical slice 및 iPad 경로를 검증한 뒤
   `baseline/optional-sdk-v1` tag를 생성합니다.
7. 일정과 Core 상태에 따라 그 tag에서 10~13 Optional Extension을 선택적으로 진행합니다.
8. 10~13 전체를 포함할 때는 14에서 main에 통합하고 실제 iPad/performance release gate를 통과한 경우에만
   `baseline/full-v1`을 생성합니다.
9. Core-only는 09, Full Optional은 14의 immutable baseline을 입력으로 15에서 Pages preview, production,
   실제 rollback/roll-forward와 정적 배포 운영 정책을 검증합니다.
10. 후속 제품 기능은 계획 commit의 동일한 `POST_PLAN_BASE_SHA`에서 16 Basic Primitives, 17 Guided early
    core, 18 Desktop Mouse Camera를 별도 worktree로 병렬 진행합니다.
11. 19 Phase A가 16과 18을 main에 조립해 exact `PRODUCT_INPUT_BASE_SHA`를 게시합니다.
12. 그 SHA에서 20 Topology Actions, 21 Transform/Refinement/Symmetry, 22 Project Lifecycle, 23 Import/Interop,
    24 Retopo Visibility를 별도 worktree로 병렬 진행합니다.
13. 25가 `20 -> 21 -> 22 -> 23 -> 24`를 main에 조립하고 complete-asset E2E 뒤 exact
    `PRACTICAL_TOOL_BASE_SHA`를 게시합니다.
14. 17 Standard는 그 SHA에서 early-core 순수 commit을 검토해 반입하고 first-asset Guided를 수행하며,
    19 Phase B가 최종 Guided 조합 E2E와 main 통합을 담당합니다.

16~18은 `baseline/full-v1` release tag 부재와 별개로 시작할 수 있습니다. 이 작업들은 제품 사용성 공백을
닫는 기능 개발이며, 14의 실제 iPad/Pencil release gate를 통과한 것으로 대신 기록하거나 release tag를
생성하지 않습니다.

현재 배포 기준은 Cloudflare Pages의 정적 SPA입니다. Pages Functions/Workers와 server-side secret은 초기
범위에 없으며, 동적 기능이 필요해질 때 별도 Cloudflare Worker와 versioned API 경계로 추가합니다.
GitHub 저장소와 기존 Pages project `octopoly`의 연결은 완료되어 있으며 현재 production URL은
[`https://octopoly.pages.dev/`](https://octopoly.pages.dev/)입니다. 00 Bootstrap의 최초 빈 앱 셸 조건은
역사적 bootstrap 설명이며 현재 저장소에는 00/09/14 개발 통합이 존재합니다. 현재 배포 SHA와 release/device
readiness는 `00_BOOTSTRAP.md`, `14_OPTIONAL_INTEGRATION.md` 및 validation evidence를 기준으로 판정합니다.

01~08 작업자는 main merge나 cross-worktree 조립을 수행하지 않습니다. Optional 기능이 하나도 없어도
01~09 Core는 정상적으로 빌드되고 사용할 수 있어야 합니다.

## 주요 대상 환경

- iPad Safari
- Apple Pencil 기반 모델링
- Pencil modeling과 touch navigation의 분리
- 모바일 메모리, GPU 및 발열 제약을 고려한 구현

구체적인 branch/worktree 배치와 병합 순서는
[`docs/workplan/00_MASTER.md`](docs/workplan/00_MASTER.md)를 기준으로 합니다.
