# 00 Bootstrap Baseline

## Required
YES — **01~08 병렬 구현 전에 반드시 완료해야 하는 선행 workstream**

이 작업이 `COMPLETE`이고 immutable baseline ref가 생성되기 전에는 01~08 branch/worktree를 생성하거나
기능 구현을 시작하지 않는다. 01~08의 모든 branch/worktree는 그 ref가 가리키는 동일 commit에서 분기한다.

## Execution
```text
Mode: MAIN
Branch: main
Worktree: NONE
Order: BEFORE 01~08
Output: FINAL BASELINE COMMIT + IMMUTABLE TAG `baseline/core-v1`
```

별도 worktree를 만들지 않는다. 시작 시 현재 branch가 `main`인지 확인하고, 완료 시 검증된 scaffold와
contract를 하나의 식별 가능한 baseline commit으로 남기고 `baseline/core-v1` tag를 붙인다.

## Inputs

- `/AGENTS.md`
- `docs/workplan/00_MASTER.md`
- `docs/workplan/INTERFACE_CONTRACTS.md`
- `docs/workplan/01_MAIN_LEAF.md` ~ `docs/workplan/08_RETOPO_ENGINE.md`
- 기존 Cloudflare Pages project `octopoly`와 production URL `https://octopoly.pages.dev/`

현재 GitHub 저장소 기준 Pages 연결과 배포는 사용자가 완료했다. 애플리케이션 구현은 아직 없으며, 00은
project 생성이 아니라 기존 deployment를 최초 `OctoPoly` 빈 앱 셸로 교체하는 작업이다.

## Goal

01~08이 동일한 도구, 공용 타입, 빌드 및 테스트 명령을 사용해 독립적으로 구현될 수 있는 최소 기준선을
만든다.

- 제품 표시 이름을 정확히 `OctoPoly`로 고정한 feature-free 정적 메인 페이지를 첫 구현으로 만든다.
- 사용자가 미리 구성한 Cloudflare Pages 프로젝트에 그 빈 앱 셸을 먼저 배포하고 production URL을 검증한다.
- 재현 가능한 package manager 및 toolchain 고정
- TypeScript, build, test, lint/format 및 CI의 최소 실행 경로 제공
- 문서 계약과 일치하는 단일 `src/contracts/**` 공용 소스 제공
- 공용 계약 export 및 타입 수준 호환성 검증
- 빈 앱이 시작되고 build/test할 수 있는 최소 bootstrap 제공
- iPad Safari 우선 browser/GPU 기준과 fallback 결정
- 좌표계, 수치 허용오차 및 성능/용량 예산 결정
- 병렬 구현 전에 계약과 결정 사항을 동결하고 baseline commit/tag 생성

## Explicit Non-Feature Scope

이 작업은 제품 기능 구현 작업이 아니다. 다음 항목을 구현하지 않는다.

- mesh topology 또는 편집 연산
- reference surface, BVH, raycast 또는 snapping 구현
- selection, undo/redo, tool lifecycle 또는 retopo 추론
- renderer scene/pass/material 구현 또는 품질 렌더링
- Pencil/touch 입력 처리, camera, picking 또는 transform
- import/export, persistence, autosave 또는 project schema
- 실제 viewport, tool palette, modeling UI 또는 디자인 시스템
- UV, texture paint, PBR, MatCap 등 Optional Extension
- 01~08 module의 placeholder concrete implementation

허용되는 앱 코드는 `<title>`과 접근 가능한 최소 shell에 `OctoPoly` 이름을 쓰는 빈 root mount, 명시적인
capability 결과 표시/로그, 실패 가능한 초기화 경계뿐이다. 모델링 상태, 도메인 서비스 또는 기능 UI를
소유하지 않는다. 이 단계의 배포는 정적 Pages asset만 사용하며 Pages Functions, `_worker.js`, Worker
binding, 서버 API, secret 또는 원격 persistence를 추가하지 않는다.

## Ownership

Bootstrap 기간에 한해 다음 공유 파일을 소유한다.

```text
package.json
<selected-package-manager-lockfile>
.nvmrc / .node-version / volta fields (선택한 방식만)
tsconfig*.json
vite.config.* 또는 선택한 동등 build 설정
vitest.config.* 또는 선택한 동등 test 설정
eslint.config.* / prettier.config.* (사용하기로 결정한 경우)
browserslist 관련 설정 (사용하기로 결정한 경우)
.github/workflows/** (baseline CI에 필요한 파일만)
wrangler.jsonc (기존 Pages 설정을 source-of-truth로 채택하기로 ADR에서 결정한 경우만)

index.html
public/_headers
src/main.*
src/app/bootstrap.*
src/app/capabilities.*
src/app/**/*.css (빈 bootstrap 표시에 필요한 최소 파일만)

src/contracts/**
tests/contracts/**
tests/bootstrap/**
scripts/verify-baseline.* (필요한 경우)
scripts/verify-pages.* (필요한 경우)

docs/adr/**
docs/validation/pages/**
docs/workplan/INTERFACE_CONTRACTS.md
docs/workplan/00_BOOTSTRAP.md (RESULT만)
```

규칙:

- lockfile은 선택한 package manager의 파일 하나만 생성한다.
- `docs/workplan/INTERFACE_CONTRACTS.md`는 **병렬 구현 시작 전** 문서-소스 일치 및 누락 계약 해소를
  위해서만 수정할 수 있다. baseline commit 이후에는 다시 frozen contract로 취급한다.
- `src/contracts/**`는 공용 계약의 유일한 코드 정의다. 다른 workstream이 복사본이나 shadow type을
  만들 필요가 없도록 export 경로를 고정한다.
- 공용 root barrel이 필요하면 범위를 최소화하고 주 에이전트만 수정한다.
- 사용자가 준비한 Pages project/Git 연결 설정을 임의로 재생성하거나 덮어쓰지 않는다. Dashboard 설정을
  repository config로 옮길 때는 현재 설정을 먼저 확인하고 명시적 승인 없이 download/overwrite하지 않는다.
- 위 목록 밖의 `src/**`, `tests/**`, 작업 MD 및 기능 디렉터리는 수정하지 않는다.

## Agent Allocation

주 에이전트가 ADR 결정을 확정하고 파일 소유를 선언한 뒤 아래 범위로 최대 3개 서브에이전트를 사용할
수 있다. 서로의 파일을 수정하지 않는다.

### Agent A — Toolchain / CI

소유 파일:

```text
package.json
<selected-package-manager-lockfile>
.nvmrc / .node-version / package.json volta fields 중 선택된 것
tsconfig*.json
vite.config.* 또는 동등 build 설정
vitest.config.* 또는 동등 test 설정
eslint.config.* / prettier.config.* (채택한 경우)
browserslist 관련 설정 (채택한 경우)
.github/workflows/**
wrangler.jsonc (채택한 경우)
```

책임:

- runtime/package manager 버전과 재현 가능한 install 고정
- `typecheck`, `test`, `build` 및 CI 명령 정의
- CI와 로컬 명령의 동등성 확보
- Pages build command/output directory와 clean-install production build의 일치 검증
- feature package를 추가하지 않고 최소 dependency만 설치

### Agent B — Contract Source / Contract Tests

소유 파일:

```text
src/contracts/** (단, 공용 root barrel은 제외)
tests/contracts/**
docs/workplan/INTERFACE_CONTRACTS.md
```

책임:

- 문서 계약을 TypeScript의 단일 canonical source로 구현
- 01~08이 요구하는 import/export 및 의존 방향 검토
- compile-time/API-shape 테스트와 최소 runtime invariant 테스트 작성
- 병렬 구현을 막는 누락 계약은 bootstrap 중 해결하고 문서와 소스를 함께 동기화

### Agent C — Minimal Bootstrap / ADR / Smoke Validation

소유 파일:

```text
index.html
src/main.*
src/app/bootstrap.*
src/app/capabilities.*
src/app/**/*.css (필요한 최소 파일만)
tests/bootstrap/**
scripts/verify-baseline.* (필요한 경우)
scripts/verify-pages.* (필요한 경우)
docs/adr/**
docs/validation/pages/**
```

책임:

- 기능 없는 앱 entry와 실패 가능한 capability 초기화 경계 구현
- `OctoPoly` 최소 정적 shell, Pages용 `_headers`, deep-link/asset 경로 smoke 구현
- browser/GPU baseline 및 fallback smoke 검증
- 기존 Pages project의 preview/production 설정을 읽기 전용으로 확인하고 첫 production deploy 증거 기록
- 좌표/수치/예산 결정을 ADR로 기록
- clean checkout 기준 baseline 검증 절차 문서화

### Main Agent Reserved Files

- `src/contracts/index.*` 등 공용 root barrel
- `docs/workplan/00_BOOTSTRAP.md`의 `RESULT`와 baseline ref 이름
- agent 산출물 간 최종 reconciliation
- baseline commit 생성 및 SHA 기록
- 최종 baseline commit push, Pages deployment 확인과 tag push

Agent B의 계약 산출물을 Agent C가 소비해야 하는 검증은 canonical public import 경로만 사용한다. 설정이
필요한 테스트는 Agent A가 runner를 먼저 고정한 뒤 실행하며, 병렬 작업 중 같은 파일을 공동 편집하지
않는다.

## Decisions / ADRs to Record

결정은 `docs/adr/`에 번호가 있는 ADR로 기록한다. 각 ADR에는 상태, 날짜, 배경, 결정, 대안, 결과,
검증 방법을 포함한다. `TBD`인 필수 항목이 하나라도 남으면 baseline을 완료로 처리하지 않는다.

### ADR-0001 — Toolchain and Repository Commands

- Node/runtime 버전과 고정 방식
- package manager 및 lockfile 정책
- TypeScript target/module/module-resolution과 strictness
- build tool, test runner, DOM/browser test 환경
- lint/format 사용 여부와 명령
- canonical `install`, `typecheck`, `test`, `build`, `ci` 명령
- source/test path alias와 public contract import 경로

### ADR-0002 — Browser and GPU Baseline / Fallback

- 최소 지원 iPadOS/Safari 버전과 검증 대상 기기
- desktop 개발 브라우저 matrix
- Required Core backend인 WebGL2 지원 기준과 선정 근거
- WebGL2 context 생성 실패/context loss 시 Core fallback 또는 unsupported 안내 순서
- WebGPU는 향후 Optional backend로만 허용하며 Core build/start 조건이 되지 않는다는 원칙
- WebGPU/WebGL2 또는 unsupported 상태의 capability detection 방식(CPU renderer는 Required 범위 아님)
- fallback에서 유지되는 기능과 명시적으로 비활성화되는 기능
- blank screen 없이 사용자에게 실패를 전달하는 최소 동작

### ADR-0003 — Coordinate and Geometry Conventions

- world handedness, up axis, forward axis 및 길이 단위
- matrix/vector 저장 및 곱셈 순서
- front-face winding과 normal 방향
- object/world/view/clip/NDC/screen 변환 규칙
- 화면 원점과 pixel/CSS pixel/device pixel 관계
- ray direction 정규화 규칙
- UV 원점/방향은 Core generic attribute와 분리해 Optional 소유로 남기는 원칙

### ADR-0004 — Numeric Precision and Tolerance Policy

- CPU/GPU scalar precision과 serialization precision
- `NaN`/`Infinity`/degenerate input 처리
- 절대 epsilon, 상대 epsilon, 거리/각도/면적 tolerance의 이름과 단위
- scene scale에 따른 scale-relative tolerance 공식
- 벡터 정규화, 평행/공선/중복 판정 규칙
- deterministic comparison, stable ordering 및 필요한 quantization 정책
- ID 정수 범위, version 증가 및 overflow 처리

단일 무차별 epsilon을 모든 연산에 사용하지 않는다. tolerance는 용도별로 이름을 부여하고 contract 또는
공용 numeric policy에서 import한다.

### ADR-0005 — Measurable Target Budgets

최소한 다음 항목에 **숫자, 단위, 측정 환경, 측정 방법, target/hard-limit 구분**을 기록한다.

- initial JS/CSS transfer 및 parsed bundle 크기
- cold start와 first usable frame 시간
- interactive frame rate와 frame CPU/GPU time
- main-thread long task 한도
- peak JS heap, GPU resource 및 project/reference asset memory
- 기준 retopo mesh와 reference mesh의 vertex/triangle 규모
- pointer sample/coalesced batch 처리 지연
- 한 stroke의 최대 staged retopo step 수와 budget 초과 시 cancel/rollback 한도
- autosave/project size는 01에서 구체화할 수 있도록 bootstrap 한도와 측정 hook만 정의
- CI install/typecheck/test/build 시간과 test timeout
- iPad thermal/memory 관찰 시간과 성능 저하 판정 기준

실기기에서 아직 측정할 수 없는 값도 목표치와 측정 절차를 먼저 결정하고, 미검증 상태를 RESULT의
`Known limitations`에 명시한다. 미측정 값을 통과로 기록하지 않는다.

### ADR-0006 — Contract Publication and Freeze

- `src/contracts/**` 파일 구조와 canonical import 경로
- 문서 계약과 TypeScript 소스의 동기화 규칙
- public export 및 breaking-change 판정 방식
- contract type test 방식
- baseline 이후 Core 변경 요청의 09, additive Optional SDK 요청의 14 Integration 승인 절차
- 01~08 branch/worktree가 기준으로 삼을 immutable baseline ref와 SHA 확인 방법

### ADR-0007 — Cloudflare Pages Static Delivery

- 기존 Pages project `octopoly`, production branch `main`, production URL
  `https://octopoly.pages.dev/`과 Git integration 상태
- canonical build command, repository root와 정확한 output directory
- `index.html`이 있고 top-level `404.html`이 없는 Pages 기본 SPA routing 및 deep-link refresh 검증
- hashed asset의 immutable cache와 `index.html`의 revalidation/basic security header 정책
- branch/PR preview와 production deployment의 구분 및 배포 commit SHA 확인 방법
- 현재 `functions/`, `_worker.js`, Pages/Workers binding, secret과 server runtime을 사용하지 않는 원칙
- 동적 기능은 추후 별도 Cloudflare Worker와 versioned HTTP API/client adapter로 추가하며 Core/Optional의
  선행 dependency로 만들지 않는 원칙
- 배포 실패 시 tag를 만들지 않고 Pages deployment rollback 또는 후속 fix commit을 사용하는 절차
- 실행 시점 최신 Cloudflare Pages 공식 문서/limits를 재확인하는 절차

## Contract Readiness Gate

`INTERFACE_CONTRACTS.md`의 이름만 옮긴 placeholder가 아니라 01~08과 09가 게시할 Optional SDK가 독립
구현을 시작할 수 있는 최소 경계를 제공해야 한다. 적어도 다음을 검토하고 결과를 테스트 또는 ADR로
고정한다.

- MeshSnapshot의 읽기/query 방식과 ID 유효성
- MeshPatch의 적용/역적용 또는 History가 소비할 reversible change 경계
- selection/attribute 변경의 transaction 참여 방식
- normalized pointer의 down/move/up/cancel 및 coalesced sample 전달 경계
- Tool의 pointer/lifecycle dispatch와 cancellation 경계
- renderer input/resource ownership, shared mesh triangulation 및 candidate-list shading lease 경계
- revision-aware image edit/resolver event/flush와 legacy `ImageAssetRef.revision = 0` migration
- modeling facade, panel-local normalized input, extension runtime/state persistence와 reverse-dispose 경계
- error/result/cancellation semantics와 version/stale snapshot 처리

구체 알고리즘이나 storage를 contract에 넣지 않는다. 위 항목 중 01~08에 필요한 경계를 의도적으로
유보한다면 소비 workstream, adapter 우회, 09 Integration 책임을 명시하고 해당 workstream이 독립적으로
컴파일/테스트 가능함을 증명해야 한다.

## Work Sequence

1. `main`과 현재 working tree를 확인하고 기존 사용자 변경을 보존한다.
2. 01~08의 public boundary 요구를 읽고 누락/충돌 목록을 만든다.
3. ADR-0001~0007 결정을 주 에이전트가 확정한다.
4. 에이전트별 소유 파일을 선언하고 분리 가능한 작업을 병렬 수행한다.
5. 공용 barrel과 문서/소스 계약을 주 에이전트가 reconciliation한다.
6. clean-install 조건으로 typecheck, contract tests, bootstrap tests, build와 CI 동등 명령을 실행한다.
7. 지원 browser/GPU baseline 및 fallback을 가능한 환경에서 smoke 검증한다.
8. target budget의 정적 게이트와 측정 hook을 실행하고 미측정 실기기 항목을 구분한다.
9. `OctoPoly` 빈 shell을 commit/push해 기존 Pages production deployment와 deep-link/static header를 검증한다.
10. 검증 증거를 반영해 `RESULT`를 갱신하고 Bootstrap 소유 파일만 포함한 최종 baseline commit을 만든다.
11. final commit을 push하고 Pages가 같은 commit을 성공 배포했는지 다시 확인한다. 실패하면 tag를 만들지
    않고 원인을 수정한다.
12. 성공한 final commit에 annotated tag `baseline/core-v1`을 생성·push하고
    `git rev-parse baseline/core-v1^{commit}`으로 resolved SHA를 검증·보고한다. 01~08은 tag가 가리키는
    commit에서만 분기한다.

## Acceptance Gates

다음 항목을 모두 충족해야 `COMPLETE`다.

- [ ] 작업이 `main`에서 수행되었고 Ownership 밖 파일을 수정하지 않았다.
- [ ] runtime/package manager 버전과 lockfile이 고정되어 clean install이 재현된다.
- [ ] canonical `typecheck`, `test`, `build`, `ci` 명령이 문서화되어 모두 성공한다.
- [ ] CI가 clean checkout에서 로컬과 같은 필수 검증을 수행한다.
- [ ] 최소 앱 entry가 feature module 없이 시작되고 production build가 성공한다.
- [ ] 빈 메인 페이지의 document title/표시 이름이 `OctoPoly`이며 모델링 기능이나 backend 의존이 없다.
- [ ] 사용자가 미리 구성한 Pages project를 재생성/덮어쓰지 않고 기존 Git integration과 `main` production
      branch를 사용했다.
- [ ] Pages production URL의 root와 client deep-link refresh가 같은 shell을 반환하고 hashed asset/index
      cache 및 basic security headers가 ADR과 일치한다.
- [ ] 배포 artifact에 `functions/`, `_worker.js`, Worker/Pages binding 또는 secret 의존이 없다.
- [ ] browser/GPU capability 성공, fallback 및 unsupported 경로가 빈 화면이나 unhandled rejection 없이
      검증된다.
- [ ] `src/contracts/**`가 문서 계약의 canonical public import를 제공한다.
- [ ] contract export, readonly/shape, error/cancel/version invariant가 `tests/contracts/**`에서 검증된다.
- [ ] 01~08 각각이 concrete cross-module dependency나 shadow type 없이 컴파일/테스트를 시작할 수 있다.
- [ ] ADR-0001~0007의 필수 결정에 `TBD`가 없고 수치 예산에 단위와 측정법이 있다.
- [ ] Core bootstrap은 Optional 10~13을 import하거나 존재를 전제로 하지 않는다.
- [ ] feature 구현이나 01~08 소유 디렉터리의 placeholder가 포함되지 않았다.
- [ ] 실제 실행한 검증과 미실행 실기기 검증이 RESULT에서 구분된다.
- [ ] Bootstrap 소유 파일만 담은 baseline commit이 `main`에 생성되었다.
- [ ] `baseline/core-v1` tag가 최종 baseline commit을 가리키며 resolved SHA가 최종 보고에 포함되었다.
- [ ] final baseline commit과 대응하는 Pages deployment URL/status/commit SHA가 최종 보고에 포함되었다.

## Baseline Commit Rule

- baseline commit은 01~08보다 시간 및 ancestry상 선행해야 한다.
- 01~08용 branch/worktree는 `baseline/core-v1^{commit}`으로 해석한 정확한 commit에서 생성한다.
- baseline 검증 실패 상태, 미커밋 contract 변경, 또는 `Status: BLOCKED`에서는 분기하지 않는다.
- baseline 이후 공용 contract/scaffold 변경은 개별 workstream에서 직접 적용하지 않고 contract change
  request로 남겨 09 Integration에서 결정한다.
- `baseline/core-v1` tag는 공유 후 이동하거나 덮어쓰지 않는다. baseline 수정이 필요하면 새 version tag를
  만든다. 이미 시작한 workstream이 있으면 기존 tag를 rewrite하지 않고 후속 통합 변경으로 처리한다.

## RESULT
Status: IN_PROGRESS

### Baseline commit
- Ref: `baseline/core-v1`
- Resolved SHA: 최종 production 검증 후 기록
- Branch: `main`
- 01~08 branch point announced: NO

### Implemented
- Node/npm/TypeScript/Vite/Vitest 기반의 재현 가능한 정적 SPA scaffold
- 기능 모듈 없이 제품명과 WebGL2 필수 capability 상태만 표시하는 `OctoPoly` shell
- `src/contracts/**` canonical public contract와 barrel, shape/runtime invariant tests
- Cloudflare Pages용 `dist` build, `_headers`, artifact/production verifier
- GitHub Actions clean-install CI

### Decisions / ADRs
- ADR-0001~0007을 2026-08-10 Accepted로 고정했다.
- WebGL2를 Core 필수 backend로, WebGPU를 optional 정보로만 취급한다.
- Pages project `octopoly`의 기존 Git integration을 재사용하고 정적 artifact만 배포한다.

### Files created or modified
- Toolchain/CI: `package.json`, `package-lock.json`, `.node-version`, `tsconfig.json`, Vite/Vitest config,
  `.github/workflows/ci.yml`
- App/Pages: `index.html`, `src/main.ts`, `src/app/**`, `public/_headers`, `scripts/**`
- Contracts/tests: `src/contracts/**`, `tests/bootstrap/**`, `tests/contracts/**`
- Decisions/evidence: `docs/adr/**`, `docs/validation/pages/**`, contract 문서와 이 RESULT

### Public API
- Canonical import: `@octopoly/contracts`
- Public barrel: `src/contracts/index.ts`
- Documented/source declarations: 116/116 일치

### Canonical commands
- Install: `npm ci`
- Typecheck: `npm run typecheck`
- Test: `npm run test`
- Build: `npm run build`
- CI-equivalent: `npm run ci`

### Cloudflare Pages deployment
- Product name: `OctoPoly`
- Existing Pages project: `octopoly`
- Production URL: `https://octopoly.pages.dev/`
- Deployed commit SHA: candidate/final push 후 production에서 검증 예정
- Functions / Workers used: NO

### Tests / validation
- `npm ci`: PASS, 86 packages, audit vulnerabilities 0
- `npm run ci`: PASS, 4 files / 22 tests, strict typecheck와 production build 포함
- Artifact: gzip JS+CSS 2,525 bytes, parsed JS 3,680 bytes, forbidden dynamic artifact 없음
- Local browser: root/deep link 모두 `OctoPoly`, `WebGL2 ready`, root-absolute hashed assets, 수평 overflow 없음

### Acceptance gate evidence
- 정적 artifact와 로컬 브라우저 gate는 통과했다.
- candidate와 final Pages commit identity/body/header 검증은 push 후 수행한다.

### Integration notes
- 01~08은 `baseline/core-v1^{commit}`에서만 분기한다.
- 개별 workstream은 `@octopoly/contracts`를 사용하고 contract 변경 요청은 09로 이관한다.

### Requested contract changes
- NONE

### Known limitations
- 실제 iPad Safari 실기기 검증은 이번 환경에서 수행하지 못했으며 후속 device gate로 남긴다.
- production Pages 검증과 immutable tag 생성 전이므로 아직 COMPLETE가 아니다.
