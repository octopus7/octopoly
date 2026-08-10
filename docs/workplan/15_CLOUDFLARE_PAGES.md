# 15 Cloudflare Pages Release / Operations Hardening

## Required

CONDITIONAL — **OctoPoly를 Cloudflare Pages production으로 공개할 때 필수**다.

00 Bootstrap은 사용자가 미리 구성한 기존 Cloudflare Pages 프로젝트에 최소 빈 OctoPoly 메인 페이지를
배포하고, 프로젝트 설정과 최초 배포 증거를 RESULT에 남긴다. 15는 프로젝트 생성, 최초 Git 연결 또는 첫
배포 작업이 아니다. 00의 기존 Pages 설정과 성공한 production deployment를 인수하여 실제 Core 또는
Full Optional release의 preview, 정적 SPA 운영 정책, production 배포와 rollback을 검증하는 후속 작업이다.

위 문장은 00 실행 전 사용자가 제공한 역사적 Pages 연결 입력이었다. 현재 00/09/14 구현·배포 상태는 각
RESULT와 live deployment evidence로 다시 판정하며, 그 사실만으로 15의 제품 release 완료를 주장하지 않는다.

## Execution

```text
Mode: MAIN
Branch: main
Worktree: NONE
Order: AFTER 09 CORE INTEGRATION, OR AFTER 14 WHEN ANY OPTIONAL IS SELECTED

Core-only input: `baseline/optional-sdk-v1^{commit}` from 09
Optional input: `baseline/full-v1^{commit}` from 14
Existing Pages input: 00 Bootstrap Pages config + production deployment evidence
Existing Pages project ID/name: `octopoly`
Production URL: `https://octopoly.pages.dev/`
Project lifecycle: REUSE EXISTING PROJECT ONLY; NEVER CREATE, RECREATE, REPLACE OR OVERWRITE

Build root directory: repository root
Build output directory: `dist`
Production branch: `main`
Output: VERIFIED PAGES PRODUCTION DEPLOYMENT + ANNOTATED TAG `deploy/pages-v1`
```

별도 worktree를 만들지 않는다. 저장소 변경은 `main`에서 이 문서의 Ownership만 수정한다. Pages preview를
위해 remote preview branch나 PR을 사용할 수 있지만, 그 ref에서는 구현하거나 파일을 수정하지 않는다.
동일한 local `main` candidate commit을 preview ref로 게시한 뒤 검증된 SHA만 production `main`에 push한다.

## Goal

검증된 OctoPoly release를 기존 Cloudflare Pages 프로젝트에 **정적 SPA**로 안전하게 배포하고 반복 가능한
운영 절차를 확립한다.

```text
00 Bootstrap Pages deployment
-> 09 Core-only baseline 또는 14 Full Optional baseline 선택
-> clean canonical build
-> `dist/` 정적 artifact 검증
-> branch/PR preview 배포
-> preview deep-link/header/cache/iPad smoke
-> production `main` 배포
-> production smoke
-> 이전 성공 deployment로 rollback smoke
-> 검증된 candidate로 roll-forward
-> 실제 production source SHA에 `deploy/pages-v1`
```

완료 상태는 단순히 Pages build가 성공했다는 뜻이 아니다. 배포된 commit, URL, 정적 artifact, deep-link
refresh, cache/security headers, iPad Safari 동작, rollback/roll-forward와 선택한 제품 baseline의 release
readiness가 모두 증거로 연결되어야 한다.

## Hosting Decision

현재 배포는 Cloudflare Pages의 정적 asset serving만 사용한다.

- 배포 대상은 기존 project ID/name `octopoly`, production URL `https://octopoly.pages.dev/`로 고정한다.
- 15는 이 Pages project resource를 생성, 재생성, 교체, 초기화, 삭제 또는 다른 project로 덮어쓰지 않는다.
- project가 조회되지 않거나 identity/URL이 다르면 새 project를 만들지 않고 즉시 `BLOCKED`로 종료한다.
- 정적 HTML/CSS/JavaScript/WebAssembly/asset만 `dist/`에서 제공한다.
- Pages Functions, Workers runtime, `_worker.js`, `_routes.json`, runtime binding과 secret을 사용하지 않는다.
- KV, D1, R2, Durable Objects, Queues, service binding 등 Cloudflare resource를 요구하지 않는다.
- Core와 Optional 모두 네트워크 API 없이 build/start/use 가능해야 한다.
- 동적 기능이 필요해지면 별도 Cloudflare Worker와 versioned HTTP API 경계를 새 계획으로 추가한다.
- 미래 Worker/API는 browser-side adapter가 호출하며 Core/Optional package의 선행 build dependency가 아니다.
- API endpoint, 인증, CORS, rate limit, secret과 binding은 미래 Worker가 소유한다. secret을 Pages client
  bundle, public build variable 또는 저장소에 넣지 않는다.

현재 Pages의 `/api/*`가 SPA fallback HTML을 반환할 수 있다는 사실을 API 구현으로 간주하지 않는다. 미래
동적 API를 도입할 때는 별도 Worker hostname 또는 명시적인 routed API origin을 사용하고, client adapter의
base URL과 실패/offline semantics를 별도 contract로 결정한다.

## Non-Goals

- Cloudflare account 또는 Pages 프로젝트 생성
- 기존 `octopoly` Pages project의 재생성, 교체, 초기화, 삭제 또는 동일 이름 project로의 덮어쓰기
- 최초 GitHub App 설치, 최초 repository 연결 또는 최초 Pages 배포
- custom domain, DNS, Access, Web Analytics 또는 observability 제품 도입
- Pages Functions, `_worker.js`, `_routes.json`, Worker, binding, environment variable 또는 secret 추가
- Core/Optional 내부 구현, public contract, shader, topology 또는 UI 기능 수정
- 09/14의 제품 acceptance나 iPad/performance 실패를 배포 성공으로 덮어쓰기
- Direct Upload 프로젝트로 전환하거나 기존 Git-integrated 프로젝트의 배포 방식을 교체

## Required Inputs

아래 순서로 끝까지 읽는다.

1. `/AGENTS.md`
2. `docs/workplan/00_MASTER.md`
3. `docs/workplan/00_BOOTSTRAP.md` 전체와 RESULT
4. 00이 남긴 Pages config, build log, project/deployment URL과 최초 production evidence
5. `docs/workplan/09_INTEGRATION.md` 전체와 RESULT
6. 10~13 전체를 포함한 Full Optional release면 `docs/workplan/14_OPTIONAL_INTEGRATION.md` 전체와 RESULT
7. 선택 baseline commit의 `docs/adr/**`, canonical command와 iPad/performance evidence
8. 현재 build 설정, lockfile, static public directory와 실제 router/entrypoint

00의 evidence 경로는 실제 산출물을 기준으로 발견한다. 예상 경로를 새 shadow 문서로 만들어 누락을
감추지 않는다. RESULT나 validation artifact에서 기존 Pages project와 최초 성공 production deployment를
식별할 수 없으면 외부 조회 전에 누락을 보고한다.

## Start Gates

다음을 모두 충족하기 전에는 repository 수정, preview ref push 또는 Pages 설정 변경을 시작하지 않는다.

- 00 RESULT가 `COMPLETE`이고 최소 OctoPoly 메인 페이지의 Pages production 배포가 성공했다.
- 00 evidence에 project identity, production URL, deployment ID 또는 동등 식별자, source commit SHA,
  build command, build output directory와 성공 build log가 있다.
- 기존 Pages project ID/name이 정확히 `octopoly`이고 production URL이
  `https://octopoly.pages.dev/`이며, 사용자가 소유하고 삭제 예정이 아니다.
- 기존 `octopoly` project의 성공한 00 deployment가 rollback target으로
  남아 있다.
- Core-only release면 09 RESULT가 `COMPLETE`이고 `baseline/optional-sdk-v1`이 존재한다.
- 10~13 전체를 포함한 Full Optional release면 14 RESULT가 `COMPLETE`이고 `baseline/full-v1`이 존재한다.
- 선택한 tag가 `main` ancestry에 있고 `git rev-parse <tag>^{commit}`으로 한 commit SHA에 해석된다.
- 선택하지 않은 Optional이 Core entrypoint나 Pages build의 필수 import가 아니다.
- 현재 branch가 `main`이고 working tree가 clean하며 관련 없는 사용자 변경이 없다.
- 00 RESULT/ADR에 clean install, typecheck, test, build, CI-equivalent 명령이 정확히 기록되어 있다.
- repository root 기준 production output이 정확히 `dist/`로 고정되어 있다.
- Pages project/account/dashboard/GitHub 설정을 조회하거나 변경하기 위한 사용자의 명시적 승인이 있다.
- preview ref push, production push, rollback, roll-forward와 tag push의 외부 변경 범위가 사용자에게 사전
  보고되고 명시적으로 승인되었다.

00의 Pages evidence는 있지만 기존 project가 Direct Upload 방식이라 branch/PR preview를 제공할 수 없거나,
Git integration 방식 변경에 프로젝트 재생성이 필요하면 추측으로 전환하지 않고 `BLOCKED`로 기록해 사용자
결정을 요청한다.

## Baseline Selection

한 release에서 입력 baseline은 하나만 선택한다.

| Release shape | Required upstream | Immutable input | Additional gate |
|---|---|---|---|
| Core-only | 09 `COMPLETE` | `baseline/optional-sdk-v1^{commit}` | Optional source 제거 build와 09 vertical slice |
| Full Optional (10~13 전체) | 14 `COMPLETE` | `baseline/full-v1^{commit}` | 14 full matrix, Core-only regression와 release gate |

현재 14의 `baseline/full-v1`은 10~13 전체 통합을 뜻한다. 일부 Optional만 배포하려면 15가 임의 조합을
만들지 않고, 14 또는 별도 Optional Integration 계획이 해당 조합의 immutable baseline을 먼저 게시해야 한다.

15 candidate commit은 선택 baseline의 descendant여야 하며 deployment-only 변경만 추가한다. baseline tag를
이동하거나 덮어쓰지 않는다.

## Existing Pages Project Discovery and Approval

Pages project identity는 새로 발견하거나 정하는 값이 아니다. project ID/name은 `octopoly`, production
URL은 `https://octopoly.pages.dev/`로 확정되어 있다. 00 evidence와, 승인 후 기존 Pages project를 읽어 이
고정값 및 나머지 운영 metadata가 서로 일치하는지 검증한다.

`octopoly`가 없거나 다른 account/project/URL을 가리키면 동일 이름 project를 생성하거나 기존 resource를
덮어써 복구하지 않는다. 외부 변경을 중단하고 `BLOCKED`로 기록한 뒤 사용자에게 기존 project 복구 또는
접근 권한 확인을 요청한다.

최소 discovery record:

| Field | Evidence source |
|---|---|
| Cloudflare account display name / non-secret account identifier | 00 evidence + approved dashboard/API read |
| Pages project ID/name | fixed value `octopoly`; verify against existing project settings |
| Git repository | existing Git integration |
| Production branch | must be `main` |
| Preview branch policy | branch/PR preview enabled for candidate ref |
| Build root | repository root |
| Build command | 00 canonical CI-equivalent command |
| Build output | exactly `dist` |
| Production URL | fixed value `https://octopoly.pages.dev/` |
| Bootstrap deployment | 00 deployment ID, source SHA and URL |
| Current production deployment | deployment ID, source SHA and status |
| Functions/bindings/secrets | must be absent |

권한 원칙:

- account/project/dashboard/GitHub App 또는 인증 상태에 접근하기 전에 명시적 승인을 받는다.
- read-only discovery와 실제 변경 항목을 구분해 승인 범위를 알린다.
- `octopoly` project resource 자체의 create/recreate/replace/reset/delete는 승인 가능한 15 작업으로 취급하지
  않는다. 필요해 보여도 멈추고 별도 사용자 결정을 요청한다.
- production branch, preview branch control, build command/output을 바꾸기 전에 old/new 값을 제시한다.
- project 삭제, Git integration 재설치, custom domain/DNS 변경, Access policy 변경은 이 workstream 범위가
  아니며 별도 사용자 지시 없이는 수행하지 않는다.
- API token, session cookie, account secret과 deployment credential을 repository, RESULT, log 또는 screenshot에
  기록하지 않는다.

## Canonical Build and Pages Configuration

00 RESULT에 기록된 명령을 문자 그대로 canonical source로 사용한다. 15가 package manager나 command를 새로
추측하지 않는다.

```text
Clean install: <resolved from 00 RESULT>
Typecheck:     <resolved from 00 RESULT>
Test:          <resolved from 00 RESULT>
Build:         <resolved from 00 RESULT>
CI-equivalent: <resolved from 00 RESULT>
```

실행 시 위 placeholder 줄을 실제 명령으로 RESULT에 옮긴다. 필수 정책은 다음과 같다.

- disposable clean checkout에서 lockfile을 강제하는 canonical clean install을 실행한다.
- 같은 checkout에서 typecheck, test, build와 CI-equivalent를 실행한다.
- Pages build command는 00이 정한 동일 typecheck/test/build gate를 우회하지 않는다.
- Node/package-manager version은 00의 pin과 Pages build environment에서 일치한다.
- build root는 repository root이고 output은 정확히 repository-root `dist/`다.
- output 경로를 `dist`, `./dist`, `/opt/buildhome/repo/dist`처럼 서로 다른 의미로 중복 설정하지 않는다.
- dependency 또는 lockfile 변경은 deployment 검증에 꼭 필요한 경우만 허용하고 근거를 RESULT에 남긴다.
- build cache 유무와 관계없이 clean build가 성공해야 한다. cache hit만으로 통과 처리하지 않는다.

기존 Pages project의 build command가 canonical command와 다르면 preview 전에 최소 설정 변경을 제안하고
승인받는다. production 설정을 먼저 바꾸지 않는다.

## Static Artifact Contract

`dist/`는 아래 구조와 불변조건을 만족해야 한다.

```text
dist/
  index.html                 REQUIRED
  _headers                   REQUIRED
  assets/<name>.<hash>.*     REQUIRED for generated JS/CSS and cacheable build assets

dist/404.html                FORBIDDEN at top level
dist/_redirects              FORBIDDEN for SPA fallback in this release
dist/_worker.js              FORBIDDEN
dist/_routes.json            FORBIDDEN
functions/**                 FORBIDDEN in deployed source
```

검증 규칙:

- `dist/index.html`이 존재하고 production entry asset을 유효한 상대/절대 web path로 참조한다.
- top-level `dist/404.html`이 없어 Cloudflare Pages의 default SPA rendering을 사용한다.
- `_redirects`로 catch-all rewrite를 중복 구현하지 않는다.
- generated JavaScript/CSS와 장기 cache 대상은 content hash가 filename에 있고 HTML은 hashed asset만 참조한다.
- `dist/_headers`는 source static directory의 `_headers`에서 build 중 복사되며 수동 post-build 편집에 의존하지
  않는다.
- source와 output 어디에도 Pages Functions, advanced mode Worker 또는 route manifest가 없다.
- Pages project 설정과 repository config 어디에도 runtime binding, variable 또는 secret이 없다.
- file count, 개별 file size, build duration과 `_headers` rule/line 크기가 실행 시 확인한 현재 Pages limits
  안에 있다.

## Header and Cache Policy

정적 source의 `_headers`는 최소 다음 의도를 표현한다. 실제 source 위치는 build tool의 static directory를
확인해 `public/_headers`를 기본값으로 사용하고, build 결과 `dist/_headers`와 byte-level로 비교한다.

```text
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=()

/
  Cache-Control: no-cache

/index.html
  Cache-Control: no-cache

/assets/*
  Cache-Control: public, max-age=31536000, immutable
```

- 전역 security header rule에 `Cache-Control`을 넣지 않아 hashed asset의 immutable 정책과 중복 결합되지
  않게 한다.
- `/`와 `/index.html`은 매 요청 재검증되도록 `no-cache`를 요구한다.
- SPA deep-link fallback HTML은 Pages 기본 `max-age=0, must-revalidate` 또는 그보다 엄격한 revalidation
  정책인지 실제 응답에서 확인한다.
- immutable rule은 content hash가 있는 `/assets/*`에만 적용한다. 고정 filename asset에는 적용하지 않는다.
- CSP는 실제 WebGL, Worker/blob, image import와 network dependency inventory 없이 추측해 추가하지 않는다.
  필요하면 별도 보안 hardening 변경으로 preview에서 먼저 검증한다.
- `_headers`가 static asset response에 적용됨을 확인하고 Functions response에 의존하지 않는다.

## Default Pages SPA Routing Gate

Cloudflare Pages는 top-level `404.html`이 없으면 기본 SPA rendering으로 incoming path를 root app shell에
연결한다. 이를 `_redirects`, Pages Functions 또는 Worker로 재구현하지 않는다.

preview와 production에서 각각 다음을 검증한다.

1. `GET /`가 `200`, HTML content type과 OctoPoly app shell을 반환한다.
2. 실제 client router가 가진 non-root route가 있으면 그 route를 직접 주소창에서 열고 hard refresh한다.
3. router 유무와 관계없이 `/__pages_spa_probe__/nested`를 직접 요청하여 Pages 404가 아니라 `200` app shell을
   반환하는지 확인한다.
4. browser refresh 후 module script, CSS, WASM, icon과 runtime asset 요청이 모두 성공한다.
5. deep link response가 top-level custom 404 body나 directory listing이 아니며 blank screen 또는 redirect loop가
   없다.
6. query string과 fragment를 포함한 URL에서도 client bootstrap이 동일하게 시작한다.
7. root와 deep link의 app-shell signature 및 referenced asset set을 비교하되 runtime-generated 값은 정규화한다.

synthetic probe path를 제품 route로 노출하거나 navigation에 추가하지 않는다. 이 경로는 Pages fallback
동작만 검증한다.

## Git Integration and Environment Separation

00에서 사용한 기존 GitHub Git integration을 유지하고 다음을 검증한다.

- production branch는 정확히 `main`이다.
- production deployment는 remote `main` push에서만 생성된다.
- non-production candidate branch 또는 같은 repository의 PR은 production을 변경하지 않는 preview URL을
  만든다.
- fork-origin PR은 preview URL이 생성되지 않을 수 있으므로 release candidate는 repository 내부 branch를
  사용한다.
- preview deployment의 source commit SHA가 local candidate SHA와 일치한다.
- preview URL의 기본 `X-Robots-Tag: noindex`를 확인한다.
- preview와 production은 같은 build root, command, runtime version과 `dist/` output을 사용한다.
- 현재 release에는 production/preview binding, secret 또는 environment-specific dynamic config가 없다.

Mode MAIN을 유지하기 위한 preview 절차:

1. local `main`에서 deployment-only candidate commit을 만든다.
2. 사용자 승인 후 그 commit을 remote candidate branch ref에 게시한다. 별도 worktree나 branch write를 하지
   않는다.
3. 필요하면 그 ref로 PR을 열어 GitHub/Pages check와 preview URL을 수집한다.
4. preview가 통과하기 전에는 remote production `main`을 갱신하지 않는다.
5. preview와 production 사이에는 RESULT evidence 외 app/build artifact에 영향을 주는 commit을 끼우지 않는다.

## Pages Limits Revalidation

구현 시점에 Cloudflare 공식 문서를 다시 조회하고 조회 날짜, account plan과 실제 limits를 evidence에 기록한다.
이 문서 작성 시점의 숫자를 release 판단에 고정하지 않는다.

최소 재확인 항목:

- monthly/concurrent build와 build timeout
- site당 file count와 단일 asset file size
- `_headers` rule count와 line length
- preview deployment 정책과 보존/삭제 제약
- Git integration, production/preview branch control과 build environment
- rollback 가능한 deployment 조건
- default SPA rendering의 `index.html`/top-level `404.html` semantics
- static asset caching과 response header behavior

공식 근거:

- [Cloudflare Pages Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/)
- [Cloudflare Pages preview deployments](https://developers.cloudflare.com/pages/configuration/preview-deployments/)
- [Cloudflare Pages serving and SPA behavior](https://developers.cloudflare.com/pages/configuration/serving-pages/)
- [Cloudflare Pages headers](https://developers.cloudflare.com/pages/configuration/headers/)
- [Cloudflare Pages rollbacks](https://developers.cloudflare.com/pages/configuration/rollbacks/)
- [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/)

공식 문서가 00 evidence나 이 계획의 세부 동작과 다르면 production을 진행하지 않고 차이와 영향을 먼저
보고한다.

## Integration Ownership

15는 deployment-only 범위에서 다음 파일만 소유할 수 있다.

```text
public/_headers

scripts/deploy/pages/verify-artifact.*
scripts/deploy/pages/smoke-preview.*
scripts/deploy/pages/smoke-production.*
scripts/deploy/pages/verify-rollback.*

tests/deploy/pages/artifact/**
tests/deploy/pages/preview/**
tests/deploy/pages/production/**
tests/device/pages/**

docs/validation/pages/artifact/**
docs/validation/pages/preview/**
docs/validation/pages/production/**
docs/validation/pages/rollback/**

package.json 및 선택된 lockfile (검증 script 등록에 필요한 최소 변경만)
vite.config.* 또는 동등 build 설정 (`dist/` output 고정에 필요한 최소 변경만)
docs/workplan/15_CLOUDFLARE_PAGES.md (RESULT만)
```

규칙:

- `src/**`, `src/contracts/**`, Core/Optional package와 00~14 작업 문서는 수정하지 않는다.
- `.github/workflows/**`에 별도 deploy workflow를 추가하지 않는다. 기존 Pages Git integration을 사용한다.
- 새 runtime dependency를 추가하지 않는다. 검증 도구가 꼭 필요하면 기존 dev dependency와 platform 도구를
  우선 사용하고, 추가 이유와 lockfile diff를 기록한다.
- actual repository 구조가 다르면 작업 전에 동등한 정확한 파일 목록을 선언하고 위 범위 밖으로 넓히지
  않는다.
- Cloudflare dashboard/project/GitHub 설정은 filesystem Ownership과 별도의 사용자 소유 external state다.
  주 에이전트만 승인된 범위에서 변경한다.

## Agent Allocation

주 에이전트가 선택 baseline, candidate SHA, canonical commands, 기존 Pages project와 exact ownership을 먼저
확정한다. 아래 Agent A/B/C의 write 경로는 서로 겹치지 않는다.

### Agent A — Static Artifact / Header Gate

소유 파일:

```text
public/_headers
scripts/deploy/pages/verify-artifact.*
tests/deploy/pages/artifact/**
docs/validation/pages/artifact/**
```

책임:

- `_headers` source와 `dist/_headers` 복사 검증
- `dist/index.html` 존재, top-level `404.html`/`_redirects`/`_worker.js`/`_routes.json` 부재 검증
- generated JS/CSS hashed filename과 HTML reference integrity 검증
- file count, largest file, output path와 current Pages limit 비교
- secret, binding, Functions/Worker artifact 정적 탐지
- deterministic artifact manifest와 digest evidence 생성

### Agent B — Preview / Deep-Link Validation

소유 파일:

```text
scripts/deploy/pages/smoke-preview.*
tests/deploy/pages/preview/**
docs/validation/pages/preview/**
```

책임:

- candidate branch/PR preview source SHA와 URL 확인
- root, actual route와 synthetic nested route의 direct navigation/hard refresh 검증
- script/CSS/WASM/asset load, MIME, console error와 blank-screen 검사
- preview security/cache headers와 `X-Robots-Tag: noindex` 증거 수집
- desktop Safari-equivalent/WebKit 및 가능한 browser smoke
- production을 변경하지 않고 failure evidence를 main agent에 반환

### Agent C — Production / iPad / Rollback Evidence

소유 파일:

```text
scripts/deploy/pages/smoke-production.*
scripts/deploy/pages/verify-rollback.*
tests/deploy/pages/production/**
tests/device/pages/**
docs/validation/pages/production/**
docs/validation/pages/rollback/**
```

책임:

- 승인된 production URL의 deploy smoke와 source SHA 검증
- 실제 iPad Safari에서 cold load, deep-link refresh, orientation/resize와 product-critical smoke
- production header/cache와 hashed asset 재검증
- 00 known-good deployment rollback, rollback 상태 smoke와 candidate roll-forward 검증
- deployment ID, UTC timestamp, device/browser, request evidence와 screenshot/log index 기록

### Main Agent Reserved

```text
package.json 및 선택된 lockfile
vite.config.* 또는 동등 build 설정
docs/workplan/15_CLOUDFLARE_PAGES.md (RESULT만)
Cloudflare Pages / GitHub external settings and deployment actions
commit, tag and push decisions
```

주 에이전트 책임:

- baseline/ref/ancestry와 00 Pages evidence gate 판정
- 사용자 승인 범위와 external old/new settings 기록
- canonical command 등록과 `dist/` output의 최소 reconciliation
- preview candidate ref 게시, production push, rollback/roll-forward 순서 통제
- Agent A/B/C 증거의 deployment ID/SHA/URL 일치 검증
- release readiness 판정, RESULT 갱신과 `deploy/pages-v1` tag 생성

Agent B/C는 main agent가 제공한 URL과 deployment ID만 검증하며 dashboard 설정을 변경하거나 deployment를
promote/rollback하지 않는다. external mutation은 주 에이전트 한 명만 수행한다.

## Work Sequence

1. `main`, working tree, 선택 baseline tag/resolved SHA와 ancestry를 확인한다.
2. 00 RESULT와 Pages evidence에서 고정 project `octopoly`, URL `https://octopoly.pages.dev/`, bootstrap
   deployment와 canonical build 설정을 읽는다.
3. 사용자 승인 후 project를 read-only 조회하여 00 evidence와 현재 설정을 대조한다.
4. current official Pages docs/limits를 재확인하고 dated evidence를 만든다.
5. 정확한 Agent A/B/C 파일 소유를 선언한다.
6. `public/_headers`, artifact verifier, preview/production/rollback smoke를 소유 범위별로 구현한다.
7. disposable clean checkout에서 install -> typecheck -> test -> build -> CI-equivalent를 실행한다.
8. Agent A artifact gate와 local static serving deep-link/header smoke를 통과시킨다.
9. deployment-only candidate commit을 local `main`에 만든다.
10. 승인된 remote candidate branch/PR에 같은 SHA를 게시하고 Pages preview가 완료될 때까지 기다린다.
11. Agent B preview gate와 가능한 iPad preview smoke를 통과시킨다.
12. 이전 성공 production deployment ID와 emergency rollback 승인/담당자를 다시 확인한다.
13. 사용자 승인 후 candidate SHA를 remote production `main`에 push한다.
14. Pages production deployment의 source SHA가 candidate와 같은지 확인하고 production smoke를 실행한다.
15. 00 known-good production으로 실제 rollback하고 예상 bootstrap page와 headers를 smoke한다.
16. candidate production으로 roll-forward하고 전체 production smoke를 다시 통과시킨다.
17. 실제 active production source commit인 candidate SHA에 annotated tag `deploy/pages-v1`을 생성한다.
18. RESULT에 project/URL, candidate/tag SHA, deployment IDs, preview/production/iPad/rollback evidence를 기록한다.
19. RESULT-only evidence commit은 Pages 재배포를 일으키지 않도록 commit message의 공식 skip prefix를 사용하고,
    app/build artifact가 candidate와 동일함을 확인한 뒤 push한다.
20. main HEAD, deployed/tagged SHA, tag resolution, active deployment URL과 모든 evidence 경로를 최종 보고한다.

09/14 baseline과 candidate 사이에 deployment-only가 아닌 commit이 있으면 sequence를 중단한다. preview 이후
artifact-affecting 수정이 생기면 새 candidate SHA로 preview부터 다시 시작한다.

## Local and Artifact Tests

최소 검증:

- clean checkout에서 canonical install/typecheck/test/build/CI-equivalent PASS
- `dist/`만 지우고 다시 build해 동일 logical manifest 생성
- `dist/index.html`과 `dist/_headers` 존재
- top-level `dist/404.html`, `dist/_redirects`, `dist/_worker.js`, `dist/_routes.json` 부재
- deployed source의 `functions/**` 및 runtime binding/secret config 부재
- HTML의 local path, missing asset, source-tree import와 unhashed generated JS/CSS reference 0
- generated hashed asset cache rule coverage 100%
- `_headers` rule parser/line limit와 basic security header syntax 검증
- artifact file count/largest file/build time가 current Pages limit 이내
- local static server에서 root와 synthetic nested path가 app shell로 bootstrap
- test가 repository나 사용자의 실제 Cloudflare secret 값을 snapshot하지 않음

## Preview Gate

production 전에 다음을 모두 통과해야 한다.

- [ ] preview deployment status가 success이고 source SHA가 candidate commit과 같다.
- [ ] preview URL과 immutable deployment URL/branch alias를 구분해 기록했다.
- [ ] root, 실제 client route와 synthetic nested route의 direct navigation/hard refresh가 통과했다.
- [ ] entry JS/CSS/WASM과 runtime assets가 status/MIME 오류 없이 load된다.
- [ ] browser console에 uncaught exception, module load error, CSP/cache 관련 failure가 없다.
- [ ] root/index는 no-cache, hashed `/assets/*`는 immutable cache header를 가진다.
- [ ] 모든 정적 응답에 의도한 basic security headers가 있다.
- [ ] preview response의 `X-Robots-Tag: noindex`를 확인했다.
- [ ] Pages Functions/Worker invocation, binding 또는 secret dependency가 없다.
- [ ] 선택 baseline의 최소 hosted vertical slice가 preview에서 동작한다.
- [ ] 가능한 대표 iPad Safari preview smoke가 통과했거나 production gate 전에 실행 계획이 확정되었다.

preview failure에서는 remote production `main`을 push하지 않는다.

## Production Gate

production push 전에 다음을 모두 확인한다.

- preview를 통과한 candidate SHA가 변경되지 않았다.
- 09 Core-only 또는 14 Full Optional의 required release blocker가 남아 있지 않다.
- product iPad/performance gate와 Pages-hosted iPad smoke를 혼동하지 않는다.
- active production, previous known-good deployment ID와 rollback 담당/절차가 기록되어 있다.
- production push와 필요 시 즉시 rollback에 대한 명시적 승인이 있다.
- current Cloudflare status와 account build quota가 배포를 안전하게 수행할 상태다.

production 배포 후 최소 smoke:

```text
production deployment SUCCESS
-> source SHA equals candidate
-> GET / and deep-link refresh PASS
-> hashed assets and headers PASS
-> Core/selected Optional hosted smoke PASS
-> iPad Safari hosted smoke PASS
-> no new console/network fatal error
```

custom domain이 이미 있으면 `*.pages.dev`와 custom domain을 각각 확인하되, domain 추가/변경은 하지 않는다.

## iPad Safari Hosted Release Gate

00 ADR의 최소 지원 iPadOS/Safari와 대표 iPad에서 실제 production 또는 동일 candidate preview를 검증한다.

- cold navigation과 repeat navigation
- root 및 nested deep-link direct load/hard refresh
- portrait/landscape orientation과 resize 후 viewport 복구
- Apple Pencil down/move/coalesced/up/cancel과 touch navigation 분리
- reference import, 최소 retopo edit, undo/redo, save/reload와 export
- Optional release면 14의 UV/Paint/PBR/MatCap critical smoke
- background/foreground 후 asset, input과 WebGL context 상태
- 00 ADR의 startup/frame/pointer/memory/thermal hard limit
- immutable asset 재사용과 새 HTML revalidation이 stale mixed-version app을 만들지 않음

Pages-hosted smoke가 제품의 09/14 device evidence를 대체하지 않는다. upstream release readiness가
`BLOCKED`이면 15의 네트워크/hosting smoke가 성공해도 production tag를 만들지 않는다.

## Rollback and Roll-Forward Drill

00의 최초 성공 production deployment를 최소 rollback target으로 사용한다. 그 이후 더 적합한 current
known-good deployment가 있으면 00 evidence와 함께 선택 근거를 기록한다. preview deployment는 rollback
target이 될 수 없으므로 사용하지 않는다.

실제 절차:

1. candidate production deployment ID, current active ID와 known-good target ID를 기록한다.
2. 사용자 승인 범위가 유효한지 확인한다.
3. known-good production deployment로 rollback한다.
4. active deployment ID가 target으로 바뀌었는지 확인한다.
5. 00 bootstrap page 또는 target release의 예상 root/deep-link/static asset smoke를 실행한다.
6. candidate production deployment로 roll-forward한다.
7. active deployment ID와 source SHA가 candidate로 돌아왔는지 확인한다.
8. production root/deep-link/header/asset/iPad critical smoke를 다시 실행한다.
9. 시작/완료 UTC, actor, old/new deployment ID, URL, 결과와 failure recovery를 evidence에 기록한다.

rollback이나 roll-forward가 실패하면 known-good 상태 복구를 최우선으로 하고 tag를 만들지 않는다. project
삭제, deployment 삭제, force push나 tag rewrite로 rollback을 대신하지 않는다.

## Release Readiness

다음을 구분해 기록한다.

```text
Workstream Status: NOT_STARTED | IN_PROGRESS | COMPLETE | BLOCKED
Release readiness: NOT_ASSESSED | READY | BLOCKED
```

- repository/local gate만 통과: `IN_PROGRESS`, release readiness `NOT_ASSESSED`
- preview 통과, production 승인/실행 전: `IN_PROGRESS`, release readiness `NOT_ASSESSED`
- production 또는 rollback/iPad 필수 gate 실패: `BLOCKED`, release readiness `BLOCKED`
- 모든 acceptance와 production/rollback evidence 완료: `COMPLETE`, release readiness `READY`

사용자 소유 승인 대기만으로 코드를 완료로 과장하지 않는다. 반대로 승인 전 수행 가능한 local/artifact/preview
준비는 계속하고 실제 external blocker를 RESULT에 정확히 남긴다.

## Acceptance Gates

다음을 모두 충족해야 `COMPLETE`와 `Release readiness: READY`다.

- [ ] 00 Pages project/config/최초 deployment evidence를 읽고 현재 project와 대조했다.
- [ ] release shape에 따라 09 또는 14의 정확한 immutable baseline과 resolved SHA를 선택했다.
- [ ] candidate가 선택 baseline descendant이며 deployment-only 변경만 포함한다.
- [ ] 기존 project ID/name이 `octopoly`, production URL이 `https://octopoly.pages.dev/`임을 확인했고 새
      placeholder, 중복 project, project 재생성/교체/덮어쓰기가 없다.
- [ ] Cloudflare/GitHub external 조회와 모든 mutation에 필요한 사용자 승인을 기록했다.
- [ ] production branch가 `main`, build root가 repository root, output이 정확히 `dist`다.
- [ ] canonical clean install/typecheck/test/build/CI-equivalent가 disposable checkout에서 통과했다.
- [ ] `dist/index.html`은 있고 top-level `404.html`과 `_redirects`는 없다.
- [ ] `functions/**`, `_worker.js`, `_routes.json`, runtime binding과 secret이 없다.
- [ ] generated JS/CSS와 long-cache asset이 content-hashed이며 immutable header를 가진다.
- [ ] root/index no-cache와 basic security headers가 preview/production에서 실제 응답으로 확인되었다.
- [ ] default Pages SPA routing의 real/synthetic deep-link direct load와 hard refresh가 통과했다.
- [ ] current official Pages limits와 behavior를 실행 날짜 기준으로 재확인하고 artifact가 limits 이내다.
- [ ] branch/PR preview가 candidate SHA로 성공하고 production과 분리되어 있다.
- [ ] production deployment source SHA가 preview를 통과한 candidate와 일치한다.
- [ ] 실제 iPad Safari hosted smoke와 upstream product release gate가 blocker 없이 통과했다.
- [ ] known-good production으로 실제 rollback하고 candidate로 roll-forward한 뒤 양쪽 smoke가 통과했다.
- [ ] RESULT에 branch HEAD, deployed candidate SHA, project name, preview/production URL, deployment ID와 evidence
      경로가 있다.
- [ ] 실제 active production source SHA에 annotated tag `deploy/pages-v1`을 생성했다.
- [ ] `git rev-parse deploy/pages-v1^{commit}`이 recorded deployed candidate SHA와 같다.

## Failure and Stop Rules

- 00 Pages evidence나 known-good production deployment가 없으면 rollback을 추측하지 않고 `BLOCKED`다.
- selected baseline이 `COMPLETE`가 아니거나 product release blocker가 있으면 production/tag를 진행하지 않는다.
- canonical clean build, artifact gate 또는 preview가 실패하면 production `main`을 push하지 않는다.
- preview source SHA와 local candidate가 다르면 URL을 재사용하지 않고 올바른 SHA의 새 preview를 기다린다.
- top-level `404.html`, catch-all `_redirects`, Functions/Worker artifact, binding 또는 secret이 발견되면 정적 SPA
  범위 위반으로 차단한다.
- Pages current limit 초과는 file 삭제나 압축을 임의로 수행하지 않고 원인과 remediation proposal을 보고한다.
- production smoke 실패 시 승인된 known-good deployment로 rollback하고 tag를 만들지 않는다.
- rollback 또는 roll-forward 검증 실패는 release blocker다.
- iPad/WebGL blank frame, input loss, stale mixed-version asset 또는 hard-limit 실패는 Known limitation만으로
  낮출 수 없다.
- dashboard/project/GitHub 권한이 불충분하면 인증을 우회하거나 token을 요청 메시지/파일에 노출하지 않는다.
- `octopoly` project가 없거나 identity/URL이 다르면 새 project 생성, 재생성, 교체 또는 덮어쓰기를 수행하지
  않고 `BLOCKED`로 종료한다.
- 기존 immutable baseline/release/deploy tag를 이동, 삭제 또는 덮어쓰지 않는다.

## Final Commit, Deployment and Tag Rule

`deploy/pages-v1`은 기존 `baseline/core-v1`, `baseline/optional-sdk-v1`, `baseline/full-v1`과 목적/namespace가
다른 production deployment tag다.

1. candidate commit은 deployment-only config/tests/scripts를 포함하고 preview/production에 동일하게 사용한다.
2. production과 rollback/roll-forward가 성공하기 전에는 `deploy/pages-v1`을 만들지 않는다.
3. tag는 현재 active production deployment의 **source candidate SHA**에 annotated tag로 생성한다.
4. annotation에는 project name, production URL, deployment ID, UTC와 selected baseline ref를 기록하되 secret은
   넣지 않는다.
5. RESULT는 production/rollback 성공 후 갱신하여 deployed/tagged SHA와 evidence를 기록한다.
6. RESULT-only evidence commit은 app artifact를 바꾸지 않으며 공식 Pages build-skip commit prefix를 사용한다.
7. final response에는 `main` HEAD와 별도로 deployed/tagged SHA, tag resolution, production URL과 검증 결과를
   보고한다.
8. main과 tag push는 승인된 범위에서 함께 수행하며 force push하지 않는다.
9. 수정 release는 `deploy/pages-v1`을 rewrite하지 않고 새 versioned deploy tag를 계획한다.

## RESULT

Status: NOT_STARTED

Release readiness: NOT_ASSESSED

### Selected product baseline
- Release shape:
- Input ref:
- Input resolved SHA:
- Candidate is descendant: NO

### Existing Pages discovery
- Account evidence:
- Project ID/name: `octopoly`
- Git repository:
- Production branch:
- Build root:
- Build command:
- Build output directory:
- Production URL: `https://octopoly.pages.dev/`
- Custom domain, if already configured:
- Functions / bindings / secrets absent: NOT_VERIFIED

### 00 Bootstrap Pages input
- Evidence path:
- Bootstrap deployment ID:
- Bootstrap source SHA:
- Bootstrap deployment URL:
- Known-good rollback target:

### User approvals
- Read-only account/project discovery:
- Preview ref/PR publication:
- Pages setting changes:
- Production push:
- Rollback / roll-forward:
- Tag and push:

### Canonical commands
- Clean install:
- Typecheck:
- Test:
- Build:
- CI-equivalent:

### Files created or modified
-

### Local / artifact evidence
- Candidate SHA:
- Artifact manifest/digest:
- `dist/index.html`:
- `dist/_headers`:
- Forbidden artifact scan:
- Hash/reference integrity:
- File count / largest file / build duration:
- Evidence paths:

### Pages limits revalidation
- Checked at UTC:
- Account plan:
- Official documentation revision/URLs:
- Relevant limits and measured usage:
- Differences from 00 evidence:

### Preview evidence
- Candidate branch/PR:
- Deployment ID:
- Source SHA:
- Immutable preview URL:
- Branch alias URL:
- Build log/check URL:
- Root/deep-link/header/cache results:
- Browser results:
- Evidence paths:

### Production evidence
- Deployment ID:
- Source SHA:
- Production URL: `https://octopoly.pages.dev/`
- Deployed at UTC:
- Root/deep-link/header/cache results:
- Hosted vertical slice:
- Evidence paths:

### iPad Safari evidence
- Device / iPadOS / Safari:
- Preview or production URL:
- Pencil/touch/orientation/background results:
- Performance/hard-limit result:
- Evidence paths:

### Rollback / roll-forward evidence
- Previous active deployment ID:
- Known-good target ID:
- Rollback completed at UTC:
- Rollback smoke:
- Candidate roll-forward completed at UTC:
- Final active deployment ID/SHA:
- Evidence paths:

### Static-only / future Worker boundary
- Pages Functions/Worker/bindings/secrets absent:
- Core/Optional network independence:
- Deferred dynamic API notes:

### Deployment tag
- Tag: `deploy/pages-v1`
- Tagged deployed SHA:
- `git rev-parse deploy/pages-v1^{commit}`:
- Annotation verified:
- Tag pushed:

### Tests / validation
-

### Known limitations
-

### Final disposition
- Candidate production deployed: NO
- Rollback and roll-forward verified: NO
- `deploy/pages-v1` created: NO
- RESULT evidence commit created: NO
- Main/tag push performed: NO
